/* eslint-disable @typescript-eslint/restrict-template-expressions,
   @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-non-null-assertion,
   @typescript-eslint/use-unknown-in-catch-callback-variable --
   ported near-verbatim from go-gather-next (see
   docs/progress/phase-4-catalog-pipeline.md); go-gather-next's own ESLint
   config doesn't enforce these strictTypeChecked rules. Only markCatalogSynced()
   and its one call site are new, plus the Bulbapedia wiring in fetchPokedex(). */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CatalogEntry } from '@go-gather/shared';
import {
  loadAvailability,
  syncAvailability,
  type LoadedAvailability,
} from './availability-store.js';
import { db, initSchema } from './db.js';
import {
  backfillReleasedDynamaxForms,
  backfillReleasedGigantamaxForms,
  dropUnreleasedGigantamaxForms,
  finalEvolutionDexNumbers,
  splitDynamaxForms,
  splitGigantamaxForms,
} from './max-forms.js';
import {
  fetchPokeApiGigantamaxSprites,
  fetchPokeApiMegaSprites,
  fetchPokeApiSprites,
  fetchPokeApiSpritesBySlug,
} from './pokeapi.js';
import {
  stampReleaseDates,
  undatedMegaNames,
  unlistedShinyCount,
  unmappedUnreleasedForms,
  unmatchedUnreleasedFormIds,
} from './release-dates.js';
import { pokedexToEntries, type RawPokemon } from './transform.js';

const POKEDEX_URL = 'https://pokemon-go-api.github.io/pokemon-go-api/api/pokedex.json';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, '..', 'data', 'images');
const IMAGE_CONCURRENCY = 16;

/**
 * Hand-edited allowlists of known upstream pokemon-go-api data gaps that
 * this sync script patches from PokeAPI — see sync-overrides.json's own
 * `_readme` for the full rationale on each list. Kept in a plain JSON file
 * (rather than hardcoded here) so they can be edited directly without a
 * code change, matching how equivalent per-dex-number lists (e.g.
 * excludedDexNumbers) are already user-editable via the Settings UI —
 * this file is this script's equivalent, since sync.ts runs standalone
 * before the frontend/UserSettings exist to read from.
 */
interface SyncOverrides {
  missingAssetLinkDexNumbers: { dexNr: number }[];
  dmaxOnlyFinalEvolution: boolean;
  formSplitGigantamaxDexNumbers: { dexNr: number; forms: string[] }[];
  regionFormAssetBackfill: {
    dexNr: number;
    forms: { regionForm: string; slug: string }[];
  }[];
  regionFormNameOverrides: { dexNr: number; regionForm: string; name: string }[];
  baseFormAssetBackfill: { dexNr: number; name?: string; slug: string; notes?: string }[];
}

const SYNC_OVERRIDES_PATH = join(__dirname, 'sync-overrides.json');

/** Keys that used to drive Max availability by hand, now read from
 * Bulbapedia (see bulbapedia.ts) and ignored if still present. */
const RETIRED_OVERRIDE_KEYS = [
  'releasedDynamaxDexNumbers',
  'releasedGigantamaxDexNumbers',
  'formSplitDynamaxDexNumbers',
];

async function loadSyncOverrides(): Promise<SyncOverrides> {
  const raw = await readFile(SYNC_OVERRIDES_PATH, 'utf-8');
  const overrides = JSON.parse(raw) as SyncOverrides;
  // sync-overrides.json is bind-mounted from the NAS host (see
  // docs/nas-deployment.md), so an existing deployment can still supply the
  // pre-baseFormAssetBackfill file after upgrading the image.
  overrides.baseFormAssetBackfill ??= [];
  const retiredKeys = RETIRED_OVERRIDE_KEYS.filter((key) => key in overrides);
  if (retiredKeys.length > 0) {
    console.warn(
      `sync-overrides.json: ${retiredKeys.join(', ')} no longer used — released Dynamax/Gigantamax Pokemon now come from Bulbapedia. Safe to delete.`
    );
  }
  return overrides;
}

function assetUrlsForDexNumber(dexNr: number): { image: string; shinyImage: string } {
  const base = `https://raw.githubusercontent.com/pokemon-go-api/assets/main/Pokemon/pm${dexNr}`;
  return { image: `${base}.icon.png`, shinyImage: `${base}.s.icon.png` };
}

/**
 * Corrects known bad `names.English` values on specific regionForms —
 * confirmed pokemon-go-api data bugs (e.g. Squawkabilly's WHITE variant is
 * upstream-labeled "Squawkabilly (White Kyurem)", an apparent copy-paste
 * error unrelated to Squawkabilly, rather than "White Plumage" like its
 * siblings), not something transform.ts's existing `hasGenericName`
 * fallback catches (that only handles a bare duplicate of the species
 * name, not a wrong-but-specific name like this one).
 */
function patchRegionFormNames(pokedex: RawPokemon[], overrides: SyncOverrides): RawPokemon[] {
  const overridesByDex = new Map<number, { regionForm: string; name: string }[]>();
  for (const entry of overrides.regionFormNameOverrides) {
    const forDex = overridesByDex.get(entry.dexNr) ?? [];
    forDex.push(entry);
    overridesByDex.set(entry.dexNr, forDex);
  }

  return pokedex.map((pokemon) => {
    const forDex = overridesByDex.get(pokemon.dexNr);
    if (!forDex) {
      return pokemon;
    }

    const regionForms = { ...pokemon.regionForms };
    for (const { regionForm, name } of forDex) {
      const existing = regionForms[regionForm];
      if (existing) {
        regionForms[regionForm] = { ...existing, names: { ...existing.names, English: name } };
      }
    }

    return { ...pokemon, regionForms };
  });
}

function patchMissingAssetLinks(pokedex: RawPokemon[], overrides: SyncOverrides): RawPokemon[] {
  const missingAssetLinkDexNumbers = new Set(
    overrides.missingAssetLinkDexNumbers.map((e) => e.dexNr)
  );
  return pokedex.map((pokemon) => {
    if (!missingAssetLinkDexNumbers.has(pokemon.dexNr) || pokemon.assets) {
      return pokemon;
    }
    return { ...pokemon, assets: assetUrlsForDexNumber(pokemon.dexNr) };
  });
}

const POKEAPI_BACKFILL_CONCURRENCY = 8;

/**
 * pokemon-go-api hasn't caught up on asset links for some species at all
 * (unlike the two above, which are known linking bugs — real GO sprite art
 * exists, pokemon-go-api just doesn't reference it). Rather than treating
 * "no assets in pokemon-go-api" as "doesn't exist in Pokemon GO," this
 * backfills a base sprite from PokeAPI for species still missing assets
 * after the patch above — but only base species, since PokeAPI has no
 * representation of GO-exclusive costumes/forms (assetForms/regionForms/
 * megaEvolutions gaps are unaffected by this). Runs once per sync, never as
 * a live per-request call, matching PokeAPI's own fair-use expectation to
 * avoid hammering their API — a pokemon-go-api sprite naturally supersedes
 * this the moment it's added, since this only ever fills in still-null
 * `assets`.
 *
 * Only applies to species with ZERO assetForms/regionForms — species like
 * Unown/Burmy/Wormadam have `assets: null` but list only named forms (no
 * real "plain" catchable version exists in Pokemon GO at all), and
 * transform.ts's `findBaseFormDuplicate` dedup logic (which normally
 * detects "this base sprite is just a copy of one specific named form" by
 * comparing image URLs) can never match a PokeAPI-sourced sprite against
 * any of pokemon-go-api's own assetForms URLs — so backfilling assets for
 * these species produced a spurious extra base-form row that isn't
 * actually catchable in-game. Restricting to species with no assetForms/
 * regionForms at all (Flittle, Rabsca, Espathra, Cramorant, ...) sidesteps
 * this entirely, since there's no named-form duplicate to conflict with.
 */
async function backfillMissingAssetsFromPokeApi(pokedex: RawPokemon[]): Promise<RawPokemon[]> {
  const patched = [...pokedex];
  const missingIndexes = patched
    .map((pokemon, index) =>
      pokemon.assets || pokemon.assetForms.length > 0 || Object.keys(pokemon.regionForms).length > 0
        ? -1
        : index
    )
    .filter((index) => index !== -1);

  let patchedCount = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < missingIndexes.length) {
      const index = missingIndexes[cursor++];
      const pokemon = patched[index];
      const sprites = await fetchPokeApiSprites(pokemon.dexNr);
      if (sprites) {
        patched[index] = { ...pokemon, assets: sprites };
        patchedCount++;
      }
    }
  }

  await Promise.all(Array.from({ length: POKEAPI_BACKFILL_CONCURRENCY }, worker));

  console.log(
    `PokeAPI backfill: ${patchedCount} species patched, ${missingIndexes.length - patchedCount} still missing.`
  );

  return patched;
}

const MEGA_SUFFIXES = ['MEGA', 'MEGA_X', 'MEGA_Y'] as const;
type MegaSuffix = (typeof MEGA_SUFFIXES)[number];

function isMegaSuffix(value: string): value is MegaSuffix {
  return (MEGA_SUFFIXES as readonly string[]).includes(value);
}

/**
 * pokemon-go-api has no real art for most GO "Mega Evolutions" that were
 * never real mainline-game Mega Evolutions (Mega Raichu, Mega Dragonite,
 * Mega Mewtwo, ...) — `mega.assets` just falls back to the base species'
 * own sprite in those cases (confirmed: identical image URL to
 * `pokemon.assets`), which silently renders the mega card as a duplicate of
 * the base card instead of visually distinct art. Primal Kyogre/Groudon are
 * already excluded here: transform.ts's `matchingAssetForm` lookup already
 * finds their real art filed under `assetForms`, so `mega.assets` for those
 * two is never actually used downstream regardless of what this backfill
 * does.
 *
 * Falls back to PokeAPI's own mega "varieties" (see
 * fetchPokeApiMegaSprites) when a collision is found — PokeAPI does carry
 * real, visually distinct art for several of these (fan-game-derived
 * sprite set), which beats showing a duplicate of the base sprite. Runs
 * once per sync, same fair-use/caching rationale as
 * backfillMissingAssetsFromPokeApi above.
 */
async function backfillCollidingMegaSpritesFromPokeApi(
  pokedex: RawPokemon[]
): Promise<RawPokemon[]> {
  const patched = pokedex.map((pokemon) => ({
    ...pokemon,
    megaEvolutions: { ...pokemon.megaEvolutions },
  }));

  interface Job {
    pokemonIndex: number;
    megaKey: string;
    speciesName: string;
    suffix: MegaSuffix;
  }

  const jobs: Job[] = [];
  patched.forEach((pokemon, pokemonIndex) => {
    if (!pokemon.assets) {
      return;
    }
    for (const [megaKey, mega] of Object.entries(pokemon.megaEvolutions ?? {})) {
      const suffix = megaKey.startsWith(`${pokemon.id}_`)
        ? megaKey.slice(pokemon.id.length + 1)
        : null;
      const isCollision =
        mega.assets.image === pokemon.assets.image ||
        mega.assets.shinyImage === pokemon.assets.shinyImage;
      if (suffix && isMegaSuffix(suffix) && isCollision) {
        jobs.push({ pokemonIndex, megaKey, speciesName: pokemon.names.English, suffix });
      }
    }
  });

  let patchedCount = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const sprites = await fetchPokeApiMegaSprites(job.speciesName, job.suffix);
      if (sprites) {
        const pokemon = patched[job.pokemonIndex];
        pokemon.megaEvolutions[job.megaKey] = {
          ...pokemon.megaEvolutions[job.megaKey],
          assets: sprites,
        };
        patchedCount++;
      }
    }
  }

  await Promise.all(Array.from({ length: POKEAPI_BACKFILL_CONCURRENCY }, worker));

  console.log(
    `PokeAPI mega backfill: ${patchedCount} mega sprites patched, ${jobs.length - patchedCount} still duplicating base sprite.`
  );

  return patched;
}

/**
 * A handful of species (Squawkabilly, Wishiwashi, Silvally, Minior,
 * Mimikyu, Magearna, Eiscue, Calyrex, Palafin, Koraidon, Miraidon) have
 * `assets: null` for BOTH the base species AND every one of its
 * `regionForms` — unlike the Unown/Burmy/Wormadam case (real sprites, just
 * filed under named forms instead of a base form), these species have NO
 * sprite anywhere in pokemon-go-api at all, so they're entirely absent from
 * the catalog (transform.ts's regionPokemonToEntries gates entirely on
 * `if (regionPokemon.assets)`, same as the base-species case). This is a
 * different gap than `backfillMissingAssetsFromPokeApi` fixes: that
 * function deliberately SKIPS any species with regionForms at all, to
 * avoid producing a spurious duplicate base row for species like Unown —
 * so a species whose regionForms themselves are also null falls through
 * untouched by it. Backfills each regionForm's own sprite from PokeAPI
 * using the exact hand-verified slug in `regionFormAssetBackfill` (see
 * sync-overrides.json and fetchPokeApiSpritesBySlug's own doc comment for
 * why this can't be a mechanical per-species derivation).
 */
/**
 * A hand-curated list for species where the base species has `assets: null`
 * AND non-empty `regionForms`/`assetForms` — a combination
 * `backfillMissingAssetsFromPokeApi` above deliberately skips, since for
 * species like Unown/Burmy/Wormadam that combination means "no plain
 * catchable form exists, only named ones" and backfilling a base sprite
 * there would produce a spurious duplicate row. Cramorant (dex 845) is the
 * first confirmed exception: it has non-empty `regionForms`
 * (CRAMORANT_GULPING/CRAMORANT_GORGING), but those are battle-only
 * transient states (triggered mid-battle by Surf/Dive, never independently
 * catchable) with `assets: null` themselves — genuinely no sprite exists
 * anywhere upstream for any Cramorant variant, and the base/Normal Form is
 * the only one that should ever appear in the catalog. Listing a species
 * here is a deliberate, per-species confirmation that its regionForms are
 * never real catchable forms, so backfilling the base sprite can't collide
 * with `transform.ts`'s `findBaseFormDuplicate` dedup logic.
 */
async function backfillBaseFormAssetsFromPokeApi(
  pokedex: RawPokemon[],
  overrides: SyncOverrides
): Promise<RawPokemon[]> {
  const bySpecies = new Map(overrides.baseFormAssetBackfill.map((e) => [e.dexNr, e.slug]));
  const patched = [...pokedex];
  let patchedCount = 0;

  for (let index = 0; index < patched.length; index++) {
    const pokemon = patched[index];
    const slug = bySpecies.get(pokemon.dexNr);
    if (!slug || pokemon.assets) {
      continue;
    }
    const sprites = await fetchPokeApiSpritesBySlug(slug);
    if (sprites) {
      patched[index] = { ...pokemon, assets: sprites };
      patchedCount++;
    }
  }

  console.log(
    `PokeAPI base-form backfill: ${patchedCount} of ${overrides.baseFormAssetBackfill.length} species patched.`
  );

  return patched;
}

async function backfillRegionFormAssetsFromPokeApi(
  pokedex: RawPokemon[],
  overrides: SyncOverrides
): Promise<RawPokemon[]> {
  const patched = pokedex.map((pokemon) => ({
    ...pokemon,
    regionForms: { ...pokemon.regionForms },
  }));
  const bySpecies = new Map(overrides.regionFormAssetBackfill.map((e) => [e.dexNr, e.forms]));

  interface Job {
    pokemonIndex: number;
    regionForm: string;
    slug: string;
  }

  const jobs: Job[] = [];
  patched.forEach((pokemon, pokemonIndex) => {
    const forms = bySpecies.get(pokemon.dexNr);
    if (!forms) {
      return;
    }
    for (const { regionForm, slug } of forms) {
      const existing = pokemon.regionForms[regionForm];
      if (existing && !existing.assets) {
        jobs.push({ pokemonIndex, regionForm, slug });
      }
    }
  });

  let patchedCount = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const sprites = await fetchPokeApiSpritesBySlug(job.slug);
      if (sprites) {
        const pokemon = patched[job.pokemonIndex];
        pokemon.regionForms[job.regionForm] = {
          ...pokemon.regionForms[job.regionForm],
          assets: sprites,
        };
        patchedCount++;
      }
    }
  }

  await Promise.all(Array.from({ length: POKEAPI_BACKFILL_CONCURRENCY }, worker));

  console.log(
    `PokeAPI regionForm backfill: ${patchedCount} of ${jobs.length} region-form sprites patched.`
  );

  return patched;
}

async function fetchRawPokedex(): Promise<RawPokemon[]> {
  const response = await fetch(POKEDEX_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch pokedex.json: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as RawPokemon[];
}

/**
 * Refreshes the saved Bulbapedia availability data alongside pokedex.json,
 * then reads it back to drive the DMax/GMax steps here and the release
 * dates stamped in main(). A Bulbapedia outage or parse failure only leaves
 * the saved data as it was (see availability-store.ts) — the sync carries
 * on with it. It only aborts, before upsertCatalog, if the Dynamax or
 * Gigantamax data has never been saved. Max releases include announced ones: those entries ship with
 * a future `releasedOn` and the app hides them until that date.
 */
async function fetchPokedex(): Promise<{
  pokedex: RawPokemon[];
  availability: LoadedAvailability;
}> {
  const overrides = await loadSyncOverrides();
  const [pokedex] = await Promise.all([fetchRawPokedex(), syncAvailability(db)]);
  const availability = loadAvailability(db);
  const finalEvolutionDexNrs = finalEvolutionDexNumbers(pokedex);
  const nameFixed = patchRegionFormNames(pokedex, overrides);
  const linkPatched = patchMissingAssetLinks(nameFixed, overrides);
  const assetsBackfilled = await backfillMissingAssetsFromPokeApi(linkPatched);
  const baseFormBackfilled = await backfillBaseFormAssetsFromPokeApi(assetsBackfilled, overrides);
  const regionFormsBackfilled = await backfillRegionFormAssetsFromPokeApi(
    baseFormBackfilled,
    overrides
  );
  const megasBackfilled = await backfillCollidingMegaSpritesFromPokeApi(regionFormsBackfilled);
  const gmaxFiltered = dropUnreleasedGigantamaxForms(megasBackfilled, availability.gigantamax);
  const gmaxBackfilled = await backfillReleasedGigantamaxForms(
    gmaxFiltered,
    availability.gigantamax,
    fetchPokeApiGigantamaxSprites
  );
  const dmaxBackfilled = backfillReleasedDynamaxForms(
    gmaxBackfilled,
    availability.dynamax,
    overrides.dmaxOnlyFinalEvolution,
    finalEvolutionDexNrs
  );
  const gmaxSplit = await splitGigantamaxForms(
    dmaxBackfilled,
    overrides.formSplitGigantamaxDexNumbers,
    fetchPokeApiGigantamaxSprites
  );
  const dmaxSplit = splitDynamaxForms(
    gmaxSplit,
    availability.dynamax,
    overrides.dmaxOnlyFinalEvolution,
    finalEvolutionDexNrs
  );
  return { pokedex: dmaxSplit, availability };
}

/**
 * pokemon-go-api's own sprite URLs are always uniquely named by filename
 * alone (shiny sprites get a `.s.` infix, e.g. `pm25.icon.png` vs
 * `pm25.s.icon.png`), but PokeAPI's Pokemon HOME sprite set instead puts
 * the shiny/non-shiny distinction in the DIRECTORY path — `.../home/955.png`
 * vs `.../home/shiny/955.png` both end in the bare filename `955.png`.
 * Taking just the last path segment collided these onto one local file,
 * silently overwriting one variant with the other (whichever synced last)
 * and leaving both the shiny and non-shiny catalog rows pointing at
 * whichever version won. Prefixing with `shiny-` when the URL's own path
 * says so keeps them as distinct local files.
 */
function imageFilename(imgUrl: string): string {
  const filename = imgUrl.split('/').pop()!;
  return imgUrl.includes('/shiny/') ? `shiny-${filename}` : filename;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sprites are immutable per filename (pokemon-go-api names each asset after
 * its form/costume/shiny combination, e.g. pm3.fMEGA.s.icon.png, rather than
 * reusing a filename across different art), so a file already on disk from a
 * previous sync never needs to be re-downloaded.
 */
async function downloadImages(imgUrls: readonly string[]): Promise<void> {
  await mkdir(IMAGES_DIR, { recursive: true });

  let downloaded = 0;
  let skipped = 0;

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < imgUrls.length) {
      const url = imgUrls[cursor++];
      const filename = imageFilename(url);
      const dest = join(IMAGES_DIR, filename);

      if (await fileExists(dest)) {
        skipped++;
        continue;
      }

      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Skipping image (${response.status}): ${url}`);
        continue;
      }
      await writeFile(dest, Buffer.from(await response.arrayBuffer()));
      downloaded++;
    }
  }

  await Promise.all(Array.from({ length: IMAGE_CONCURRENCY }, worker));
  console.log(`Sprites: ${downloaded} downloaded, ${skipped} already cached.`);
}

function upsertCatalog(entries: CatalogEntry[]): void {
  const insert = db.prepare(`
    INSERT INTO pokemon_catalog (
      id, dex_nr, generation, species_id, form_id, name, species_name,
      img_url, is_shiny, is_female, form, costume, region,
      primary_type, secondary_type, pokemon_class, is_base_form, pokedex_type, "order",
      released_on
    ) VALUES (
      @id, @dexNr, @generation, @speciesId, @formId, @name, @speciesName,
      @imgUrl, @isShiny, @isFemale, @form, @costume, @region,
      @primaryType, @secondaryType, @pokemonClass, @isBaseForm, @pokedexType, @order,
      @releasedOn
    )
  `);

  const replaceAll = db.transaction((rows: typeof entries) => {
    db.exec('DELETE FROM pokemon_catalog');
    for (const row of rows) {
      insert.run({
        ...row,
        isShiny: row.isShiny ? 1 : 0,
        isFemale: row.isFemale ? 1 : 0,
        isBaseForm: row.isBaseForm ? 1 : 0,
      });
    }
  });

  replaceAll(entries);
}

// Not part of the ported pipeline logic — the smallest addition needed for
// the migration's "syncMeta version tracking" requirement (STORAGE-MIGRATION.md),
// so GET /api/catalog can tell clients when the catalog was last synced.
function markCatalogSynced(): void {
  db.prepare(
    `INSERT INTO sync_meta (key, value) VALUES ('catalogSyncedAt', @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run({ value: new Date().toISOString() });
}

export async function main(): Promise<void> {
  initSchema();

  console.log('Fetching pokedex.json from pokemon-go-api...');
  const { pokedex, availability } = await fetchPokedex();
  console.log(`Fetched ${pokedex.length} species entries.`);

  const entries = stampReleaseDates(pokedexToEntries(pokedex), availability);
  const undatedMegas = undatedMegaNames(entries, availability);
  if (undatedMegas.length > 0) {
    console.log(
      `Megas with no Bulbapedia release (hidden as unreleased): ${undatedMegas.join(', ')}`
    );
  }
  const unlistedShinies = unlistedShinyCount(entries, availability);
  if (unlistedShinies > 0) {
    console.log(
      `Shinies not in Bulbapedia's shiny list (hidden as unreleased): ${String(unlistedShinies)} entries.`
    );
  }
  const unmatchedForms = unmatchedUnreleasedFormIds(entries, availability);
  if (unmatchedForms.length > 0) {
    console.warn(
      `Unreleased forms that match no catalog entry (still shown — renamed upstream?): ${unmatchedForms.join(', ')}`
    );
  }
  const unmappedForms = unmappedUnreleasedForms(availability);
  if (unmappedForms.length > 0) {
    console.warn(
      `Bulbapedia lists unreleased forms with no mapping in release-dates.ts's UNRELEASED_FORM_IDS (still shown): ${unmappedForms.join(', ')}`
    );
  }

  const uniqueImgUrls = [...new Set(entries.map((e) => e.imgUrl))];
  console.log(`Downloading ${uniqueImgUrls.length} unique sprites...`);
  await downloadImages(uniqueImgUrls);

  const localizedEntries = entries.map((e) => ({
    ...e,
    imgUrl: `/images/${imageFilename(e.imgUrl)}`,
  }));
  upsertCatalog(localizedEntries);
  markCatalogSynced();

  console.log(`Synced ${entries.length} catalog entries from ${pokedex.length} species.`);
}

// Guarded so this module can be imported (e.g. by scheduled-sync.ts) without
// triggering a sync run as an import side effect — only runs when invoked
// directly, e.g. `tsx src/sync.ts` / `npm run sync`.
const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  main().catch((err) => {
    console.error('Sync failed:', err);
    process.exitCode = 1;
  });
}
