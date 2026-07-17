/* eslint-disable @typescript-eslint/restrict-template-expressions,
   @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-condition,
   @typescript-eslint/no-unnecessary-type-assertion -- ported verbatim from
   go-gather-next (see docs/progress/phase-4-catalog-pipeline.md);
   go-gather-next's own ESLint config doesn't enforce these strictTypeChecked
   rules. Do not reinterpret this file's flattening logic. */
import type { CatalogEntry, PokedexType, PokemonClass, Region } from '@go-gather/shared';

export interface RawNames {
  English: string;
  [language: string]: string | undefined;
}

export interface RawType {
  type: string;
}

export interface RawAssets {
  image: string;
  shinyImage: string;
}

export interface RawAssetForm {
  image: string;
  shinyImage: string;
  form: string | null;
  costume: string | null;
  isFemale: boolean;
}

export interface RawMegaEvolution {
  id: string;
  names: RawNames;
  primaryType: RawType;
  secondaryType: RawType | null;
  assets: RawAssets;
}

/** Only `id` is used (by sync.ts's final-evolution filtering for DMax) —
 * pokemon-go-api's own evolution entries also carry `candies`/`item`/
 * `quests`, none of which this app needs. */
export interface RawEvolution {
  id: string;
}

export interface RawPokemon {
  id: string;
  formId: string;
  dexNr: number;
  generation: number;
  names: RawNames;
  primaryType: RawType;
  secondaryType: RawType | null;
  pokemonClass: PokemonClass | null;
  assets: RawAssets | null;
  assetForms: RawAssetForm[];
  regionForms: Record<string, RawRegionPokemon>;
  megaEvolutions: Record<string, RawMegaEvolution>;
  /** Empty array means this species has no further evolution — either a
   * single-stage species or already the final stage of its family. Used by
   * sync.ts to filter the DMax pokedex down to final forms only when
   * `dmaxOnlyFinalEvolution` is set in sync-overrides.json. */
  evolutions: RawEvolution[];
}

export interface RawRegionPokemon {
  id: string;
  formId: string;
  dexNr: number;
  generation: number;
  names: RawNames;
  primaryType: RawType;
  secondaryType: RawType | null;
  pokemonClass: PokemonClass | null;
  assets: RawAssets | null;
  regionForms: Record<string, RawRegionPokemon>;
}

/**
 * The pokemon-go-api region form keys look like "VULPIX_ALOLA",
 * "GROWLITHE_HISUIAN", "DARMANITAN_GALARIAN_STANDARD". The spelling of the
 * region segment is inconsistent (ALOLA vs GALARIAN vs HISUIAN vs PALDEA),
 * so matching a fixed suffix list against `formId` (as an earlier version of
 * this function did) silently misses forms like "HISUIAN" that don't match
 * the suffix "HISUI". Matching against these known region tokens anywhere in
 * the id is resilient to the inconsistent spelling.
 */
const REGION_TOKENS: [token: string, region: Region][] = [
  ['ALOLA', 'alola' as Region],
  ['GALARIAN', 'galar' as Region],
  ['GALAR', 'galar' as Region],
  ['HISUIAN', 'hisui' as Region],
  ['HISUI', 'hisui' as Region],
  ['PALDEA', 'paldea' as Region],
];

export function regionFromFormId(formId: string): Region | null {
  const match = REGION_TOKENS.find(([token]) => formId.includes(token));
  return match ? match[1] : null;
}

/**
 * A species with multiple real alternate forms whose Gigantamax/Dynamax
 * appearance genuinely differs per form (Toxtricity's Amped/Low Key, see
 * sync-overrides.json's formSplitGigantamaxDexNumbers) is represented as a
 * compound assetForms `form` value — `AMPED_GIGANTAMAX`, `LOW_KEY_DYNAMAX`,
 * etc. — rather than the bare `GIGANTAMAX`/`DYNAMAX` used for single-form
 * species. Every place that needs to recognize "this is a Gigantamax/Dynamax
 * entry" must therefore check the suffix, not exact equality, or a
 * form-qualified entry silently falls through as a regular/costume entry
 * instead (this was confirmed live: before these suffix checks existed,
 * Pikachu's blanket costume-like rule and the pokedexType derivation both
 * only matched the bare string).
 */
export function isGigantamaxForm(form: string): boolean {
  return form === 'GIGANTAMAX' || form.endsWith('_GIGANTAMAX');
}

export function isDynamaxForm(form: string): boolean {
  return form === 'DYNAMAX' || form.endsWith('_DYNAMAX');
}

const MEGA_FORM_VALUES = new Set(['MEGA', 'MEGA_X', 'MEGA_Y']);

export function isReservedBattleMechanicForm(form: string): boolean {
  return MEGA_FORM_VALUES.has(form) || isGigantamaxForm(form) || isDynamaxForm(form);
}

export function buildCatalogId(params: {
  dexNr: number;
  formId: string;
  form: string | null;
  costume: string | null;
  isFemale: boolean;
  isShiny: boolean;
}): string {
  const { dexNr, formId, form, costume, isFemale, isShiny } = params;
  const genderPart = isFemale ? 'f' : 'm';
  const shinyPart = isShiny ? 'shiny' : 'normal';
  // `formId` alone identifies the species/region variant (e.g. VULPIX_ALOLA)
  // but not the assetForms-level `form` (e.g. FALL_2019, GIGANTAMAX) or
  // `costume` (e.g. HOLIDAY_2016) layered on top of it — both must be part
  // of the id or distinct cosmetic variants collide onto the same row.
  return `${dexNr}-${formId}-${form ?? 'none'}-${costume ?? 'none'}-${genderPart}-${shinyPart}`;
}

function baseFields(
  pokemon: RawPokemon | RawRegionPokemon,
  speciesName: string
): Pick<
  CatalogEntry,
  | 'dexNr'
  | 'generation'
  | 'speciesId'
  | 'formId'
  | 'speciesName'
  | 'primaryType'
  | 'secondaryType'
  | 'pokemonClass'
> {
  return {
    dexNr: pokemon.dexNr,
    generation: pokemon.generation,
    speciesId: pokemon.id,
    formId: pokemon.formId,
    speciesName,
    primaryType: pokemon.primaryType.type,
    secondaryType: pokemon.secondaryType?.type ?? null,
    pokemonClass: pokemon.pokemonClass,
  };
}

/**
 * Turns one image/shinyImage pair into up to two catalog rows (normal +
 * shiny). pokemon-go-api never publishes a shinyImage without a matching
 * normal image for a given form, and every asset entry observed in the
 * live payload has both fields populated together, so this always yields
 * a pair rather than needing to guess "shiny released" from a placeholder
 * sprite.
 */
function assetToEntries(
  base: Omit<CatalogEntry, 'id' | 'imgUrl' | 'isShiny' | 'isFemale' | 'order'>,
  assets: RawAssets,
  isFemale: boolean,
  startOrder: number
): CatalogEntry[] {
  const entries: CatalogEntry[] = [];

  entries.push({
    ...base,
    id: buildCatalogId({
      dexNr: base.dexNr,
      formId: base.formId,
      form: base.form,
      costume: base.costume,
      isFemale,
      isShiny: false,
    }),
    imgUrl: assets.image,
    isShiny: false,
    isFemale,
    order: startOrder,
  });

  if (assets.shinyImage) {
    entries.push({
      ...base,
      id: buildCatalogId({
        dexNr: base.dexNr,
        formId: base.formId,
        form: base.form,
        costume: base.costume,
        isFemale,
        isShiny: true,
      }),
      imgUrl: assets.shinyImage,
      isShiny: true,
      isFemale,
      order: startOrder + 1,
    });
  }

  return entries;
}

function assetFormToEntries(
  pokemon: RawPokemon,
  speciesName: string,
  region: Region | null,
  assetForm: RawAssetForm,
  startOrder: number,
  genderedFormKeys: Set<string>,
  /** Overrides the generic "Species (Suffix)" naming with an API-provided
   * base name — used when this assetForm matches a `regionForms` entry
   * that only supplies the other gender, so both genders share one name. */
  baseNameOverride?: string
): CatalogEntry[] {
  const formKey = `${assetForm.form ?? ''}|${assetForm.costume ?? ''}`;
  const isGenderedForm = genderedFormKeys.has(formKey);
  const displayName = baseNameOverride
    ? isGenderedForm
      ? `${baseNameOverride} ${assetForm.isFemale ? '♀' : '♂'}`
      : baseNameOverride
    : formDisplayName(
        speciesName,
        assetForm.form,
        assetForm.costume,
        isGenderedForm,
        assetForm.isFemale
      );

  const base = {
    ...baseFields(pokemon, speciesName),
    name: displayName,
    region,
    form: assetForm.form,
    costume: assetForm.costume,
    isBaseForm: false,
    pokedexType: (assetForm.form && isGigantamaxForm(assetForm.form)
      ? 'max'
      : assetForm.form && isDynamaxForm(assetForm.form)
        ? 'dmax'
        : assetForm.costume
          ? 'costume'
          : 'regular') as PokedexType,
  };

  return assetToEntries(
    base,
    { image: assetForm.image, shinyImage: assetForm.shinyImage },
    assetForm.isFemale,
    startOrder
  );
}

/**
 * Mega Evolutions have no dexNr/generation of their own in pokemon-go-api —
 * they inherit the base species' identity. `assetForms` also lists a
 * duplicate MEGA/MEGA_X/MEGA_Y entry pointing at the same sprite (skipped in
 * `pokemonToEntries`), so `megaEvolutions` is the single source used here,
 * since it additionally carries the mega's own type/stats/name.
 */
function megaEvolutionToEntries(
  pokemon: RawPokemon,
  speciesName: string,
  mega: RawMegaEvolution,
  startOrder: number
): CatalogEntry[] {
  const base = {
    dexNr: pokemon.dexNr,
    generation: pokemon.generation,
    speciesId: pokemon.id,
    formId: mega.id,
    speciesName,
    name: mega.names.English,
    primaryType: mega.primaryType.type,
    secondaryType: mega.secondaryType?.type ?? null,
    pokemonClass: pokemon.pokemonClass,
    region: null,
    form: mega.id,
    costume: null,
    isBaseForm: false,
    pokedexType: 'mega' as PokedexType,
  };

  // For most unreleased-in-game Mega forms (Mega Raichu, Mega Dragonite,
  // Mega Mewtwo, ...), pokemon-go-api has no real art at all and
  // `mega.assets` just falls back to the base species sprite. Kyogre and
  // Groudon are the one exception: real Primal artwork exists, but it's
  // filed under `assetForms` (form: "PRIMAL") rather than reflected in
  // `megaEvolutions.assets` — using it here instead avoids a released,
  // visually distinct form being shown with the wrong (base) sprite.
  const formSuffix = mega.id.startsWith(`${pokemon.id}_`)
    ? mega.id.slice(pokemon.id.length + 1)
    : null;
  const matchingAssetForm = formSuffix
    ? pokemon.assetForms.find((af) => af.form === formSuffix)
    : undefined;
  const assets = matchingAssetForm
    ? { image: matchingAssetForm.image, shinyImage: matchingAssetForm.shinyImage }
    : mega.assets;

  return assetToEntries(base, assets, false, startOrder);
}

function formDisplayName(
  speciesName: string,
  form: string | null,
  costume: string | null,
  isGenderedForm: boolean,
  isFemale: boolean
): string {
  const suffix = form ?? costume;
  const baseName = suffix ? `${speciesName} (${readableFormLabel(suffix)})` : speciesName;

  // Matches the previous (PokeAPI-based) app's convention: when a form comes
  // in both male and female sprites, every entry in that pair gets the
  // matching gender symbol appended — not just the female one — so male and
  // female look visually distinct even when they'd otherwise share a name.
  if (!isGenderedForm) {
    return baseName;
  }
  return `${baseName} ${isFemale ? '♀' : '♂'}`;
}

function readableFormLabel(suffix: string): string {
  return suffix
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface BaseFormDuplicate {
  name: string;
  form: string | null;
  region: Region | null;
}

/**
 * `isReservedBattleMechanicForm` (defined near the top of this file,
 * alongside `isGigantamaxForm`/`isDynamaxForm`) identifies `form` values
 * that always represent a genuinely separate battle-mechanic entry, never a
 * cosmetic outfit AND never "the base form under a different name." Two
 * independent problems this guards against:
 *
 * 1. Costume misclassification: for species whose `form` values are "all"
 *    costume-like (Pikachu is currently the only one, but the same risk
 *    applies to any future blanket entry), these forms must never be
 *    reclassified as a costume — that would strip the signal
 *    pokedexType derivation relies on, silently filing it under the
 *    Regular Pokedex as a costume. Confirmed the hard way: Pikachu's
 *    PokeAPI-backfilled Gigantamax entry (see sync-overrides.json) landed
 *    as `pokedex_type: 'regular', costume: 'GIGANTAMAX'` before this
 *    exclusion (see isCostumeLikeForm below).
 * 2. Base-form dedup false positive: findBaseFormDuplicate (right below)
 *    normally assumes a named assetForm whose sprite matches the base
 *    sprite means the base form IS that named variant under the hood
 *    (Cherrim's "Overcast Form", Giratina's "Altered Forme", ...) and
 *    folds its name into the base row. Dynamax entries are deliberately
 *    synthesized with a sprite identical to the base (see
 *    backfillReleasedDynamaxForms in sync.ts — Dynamax has no distinct art
 *    anywhere), which otherwise trips this same "is secretly the base
 *    form" heuristic and hijacks the base row's name/pokedexType instead
 *    of producing its own separate DMax entry. Confirmed the hard way:
 *    Bulbasaur's synthesized DYNAMAX entry replaced the base "Bulbasaur"
 *    row with "Bulbasaur (Dynamax)" / pokedexType 'regular' before this
 *    exclusion (see findBaseFormDuplicate below).
 *
 * Regional forms (GALARIAN, ALOLA, HISUIAN, PALDEA, ...) and Primal forms
 * don't need to be covered by it: they're matched via regionForms/
 * matchingAssetForm elsewhere and never reach either code path below.
 */

/**
 * Finds the named assetForms/regionForms entry (if any) whose sprite is
 * identical to `pokemon.assets` — the same duplicate later skipped further
 * down in pokemonToEntries's assetForms/regionForms loops. Used so the
 * surviving base row can carry that entry's name/form/region instead of
 * defaulting to the bare species name, which would otherwise silently lose
 * the only place that named this variant (e.g. Cherrim's base row losing
 * "Overcast Form" once the literal duplicate card is removed).
 */
function findBaseFormDuplicate(pokemon: RawPokemon): BaseFormDuplicate | null {
  const baseImage = pokemon.assets?.image;
  if (!baseImage) {
    return null;
  }

  // `regionForms` is checked first: some species (Giratina) list the SAME
  // duplicate under both `assetForms` and `regionForms`, and the latter
  // carries a proper API-authored name ("Giratina (Altered Forme)") where
  // `assetForms` only has a bare suffix ("ALTERED") to build a generic
  // "Species (Suffix)" name from — preferring it keeps this base row's name
  // consistent with its sibling row's naming style (e.g. "Origin Forme").
  const matchingRegionForm = Object.values(pokemon.regionForms).find(
    (rf) => rf.assets?.image === baseImage
  );
  if (matchingRegionForm) {
    return {
      name: matchingRegionForm.names.English,
      form: null,
      region: regionFromFormId(matchingRegionForm.formId),
    };
  }

  const matchingAssetForm = pokemon.assetForms.find(
    (af) =>
      !af.isFemale &&
      af.image === baseImage &&
      (af.form || af.costume) &&
      !(af.form && isReservedBattleMechanicForm(af.form))
  );
  if (matchingAssetForm) {
    return {
      name: formDisplayName(
        pokemon.names.English,
        matchingAssetForm.form,
        matchingAssetForm.costume,
        false,
        false
      ),
      form: matchingAssetForm.form,
      region: null,
    };
  }

  return null;
}

/**
 * Returns the `form|costume` keys for which pokemon-go-api lists both a male
 * (isFemale: false) and female (isFemale: true) assetForms entry — e.g.
 * Politoed's plain form (form: null, costume: null) or Venusaur's "Jan 2020
 * Noevolve" costume both come in gendered pairs, while most other forms are
 * male-only. Only entries in these pairs need the gender symbol; entries for
 * a form/costume that only ever appears as one gender don't have anything to
 * visually disambiguate from.
 */
function findGenderedFormKeys(assetForms: RawAssetForm[]): Set<string> {
  const gendersByFormKey = new Map<string, Set<boolean>>();

  for (const assetForm of assetForms) {
    const key = `${assetForm.form ?? ''}|${assetForm.costume ?? ''}`;
    const genders = gendersByFormKey.get(key) ?? new Set<boolean>();
    genders.add(assetForm.isFemale);
    gendersByFormKey.set(key, genders);
  }

  return new Set(
    Array.from(gendersByFormKey.entries())
      .filter(([, genders]) => genders.size > 1)
      .map(([key]) => key)
  );
}

const PLAIN_FORM_KEY = '|';

/**
 * Groups assetForms entries by `(form, costume)`, preserving the order each
 * group first appears in, and orders each group's members male-first. A
 * plain `.sort()` can't achieve this: returning 0 for non-matching keys in a
 * comparator only means "don't swap this specific pair," it doesn't cluster
 * every occurrence of a key together across the whole array.
 *
 * The plain form's group is always forced first regardless of where it
 * first appears in the raw array: its male half never actually appears in
 * `assetForms` at all (it's redundant with `pokemon.assets`, filtered out
 * elsewhere, and always emitted first by `pokemonToEntries`), so grouping by
 * "first appearance" would otherwise place a plain-form-only female entry
 * wherever her single listing happens to fall — e.g. after Fashion and
 * Gigantamax for Butterfree — rather than paired with the male row that's
 * already guaranteed to render first.
 */
function groupAdjacentByFormAndGender(assetForms: RawAssetForm[]): RawAssetForm[] {
  const groups = new Map<string, RawAssetForm[]>();

  for (const assetForm of assetForms) {
    const key = `${assetForm.form ?? ''}|${assetForm.costume ?? ''}`;
    const group = groups.get(key) ?? [];
    group.push(assetForm);
    groups.set(key, group);
  }

  const orderedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === PLAIN_FORM_KEY) {
      return -1;
    }
    if (b === PLAIN_FORM_KEY) {
      return 1;
    }
    return 0;
  });

  return orderedKeys.flatMap((key) =>
    [...groups.get(key)!].sort((a, b) => Number(a.isFemale) - Number(b.isFemale))
  );
}

/**
 * Flattens one top-level Pokemon entry (species-level, generation N) into
 * its base-form rows and its assetForms rows. Region forms are handled
 * separately by `regionPokemonToEntries` because RegionPokemon carries no
 * `assetForms` of its own in the pokemon-go-api schema (confirmed against
 * live payload: regional variants only ever expose `assets` + nested
 * `regionForms`, never `assetForms`).
 */
export function pokemonToEntries(pokemon: RawPokemon): CatalogEntry[] {
  const speciesName = pokemon.names.English;
  const entries: CatalogEntry[] = [];
  const genderedFormKeys = findGenderedFormKeys(pokemon.assetForms);
  // The set of assetForms `form` values that megaEvolutionToEntries below
  // will actually consume as its sprite source (its own suffix-matching
  // logic mirrored here) — these must be shadowed from the regular dex,
  // otherwise Kyogre/Groudon's real Primal art (filed under `assetForms`
  // rather than reflected correctly in `megaEvolutions.assets`) would
  // produce both a "mega" row (using the borrowed sprite) and a leftover
  // "regular" row for the same assetForm.
  const megaEvolutionFormSuffixes = new Set(
    Object.keys(pokemon.megaEvolutions ?? {})
      .filter((megaId) => megaId.startsWith(`${pokemon.id}_`))
      .map((megaId) => megaId.slice(pokemon.id.length + 1))
  );
  let order = 0;

  if (pokemon.assets) {
    // Some species' base sprite is also explicitly listed as one of their
    // named forms (Cherrim's "Overcast Form", Shellos/Gastrodon's "West
    // Sea", ...) — those duplicate assetForms/regionForms entries are
    // dropped further down to avoid a duplicate card, but that means this
    // base row IS that named form, not a nameless "default" — so it should
    // carry that name/form/region rather than just the bare species name.
    const matchingDuplicate = findBaseFormDuplicate(pokemon);

    // The plain-form male sprite lives on `pokemon.assets` directly rather
    // than as an assetForms entry (see isRedundantWithBaseForm below); its
    // female counterpart, when it exists, arrives as a separate `form: null,
    // costume: null, isFemale: true` assetForms entry named via
    // `assetFormToEntries`. Both need the gender symbol when paired.
    const isPlainFormGendered = genderedFormKeys.has('|');
    const base = {
      ...baseFields(pokemon, speciesName),
      name: matchingDuplicate
        ? matchingDuplicate.name
        : formDisplayName(speciesName, null, null, isPlainFormGendered, false),
      region: matchingDuplicate?.region ?? null,
      form: matchingDuplicate?.form ?? null,
      costume: null,
      isBaseForm: true,
      pokedexType: 'regular' as PokedexType,
    };
    entries.push(...assetToEntries(base, pokemon.assets, false, order));
    order += 2;
  }

  // pokemon-go-api lists all male assetForms entries before any female ones
  // (confirmed against live data: Butterfree's plain male/female pair end up
  // 8 slots apart, not adjacent), rather than grouping each form/costume's
  // genders together. Grouping by `(form, costume)` — in order of each
  // group's first appearance — and sorting each group's members male-first
  // puts every gendered pair back-to-back while preserving the API's
  // original relative ordering between different forms/costumes.
  const orderedAssetForms = groupAdjacentByFormAndGender(pokemon.assetForms);

  for (const assetForm of orderedAssetForms) {
    // Some species list a male assetForms entry that is byte-for-byte the
    // same variant as the top-level `assets` — either a plain entry with no
    // form/costume at all (e.g. Bulbasaur's assetForms duplicating
    // pm1.icon.png), or, for species whose *default* appearance is itself
    // one of several explicitly named forms (Cherrim's "Overcast Form",
    // Giratina's "Altered Forme", Shellos/Gastrodon's "West Sea", ...), a
    // named assetForm whose sprite is identical to the base row's. Both
    // carry no information the base-form row doesn't already have, so are
    // skipped to avoid a duplicate catalog id — matched by sprite identity
    // rather than only "no form/costume" to catch the named case too.
    // Two independent ways an assetForm can be redundant with the base row:
    // (1) structurally plain (no form/costume) — the base row already
    // represents this exact variant regardless of sprite, e.g. Bulbasaur's
    // plain duplicate; (2) sprite-identical to the base even though it DOES
    // have a form name — e.g. Cherrim's "OVERCAST"/Giratina's "ALTERED",
    // which are the species' default appearance listed both implicitly (as
    // `pokemon.assets`) and explicitly. These are not interchangeable
    // checks: some species (Giratina) have a THIRD, separate plain
    // assetForm whose sprite differs from the base (a lower-quality
    // fallback image neither the base nor the named form use) — only
    // case (1) catches that one, since its sprite doesn't match the base.
    //
    // Reserved battle-mechanic forms (MEGA, GIGANTAMAX, DYNAMAX, and their
    // per-form compound variants like AMPED_GIGANTAMAX) are exempted from
    // the sprite-identity check even when their sprite does match the base
    // — Dynamax entries are deliberately synthesized with the base sprite
    // (see isReservedBattleMechanicForm above), and that's a genuinely
    // separate catalog entry (a distinct pokedexType), not a redundant
    // duplicate the way Cherrim/Giratina's are.
    const isPlainDuplicate = !assetForm.form && !assetForm.costume && !assetForm.isFemale;
    const isReservedForm = !!assetForm.form && isReservedBattleMechanicForm(assetForm.form);
    const isSpriteIdenticalToBase =
      !assetForm.isFemale &&
      !!pokemon.assets &&
      assetForm.image === pokemon.assets.image &&
      !isReservedForm;
    const isRedundantWithBaseForm = isPlainDuplicate || isSpriteIdenticalToBase;
    if (isRedundantWithBaseForm) {
      continue;
    }

    // A large number of species (Vulpix, Raichu, Meowth, Growlithe, Tauros,
    // Darmanitan, ...) also list their regional variant(s) as a plain `form`
    // here (e.g. form: "ALOLA", "HISUIAN", "GALARIAN_ZEN") pointing at the
    // same sprite already covered, with correct region metadata (own
    // dexNr/types/stats), by `regionForms`. Detect this by checking whether
    // any `regionForms` key for this species actually starts with this
    // assetForm's `form` value, rather than merely "looks region-like" —
    // a small number of forms (e.g. Hisuian Sliggoo/Goodra) share a
    // region-sounding name but have NO corresponding `regionForms` entry,
    // making the assetForms copy the only real row for that variant.
    //
    // `regionForms` only ever carries a single (male) sprite per variant —
    // it has no `assetForms`/`isFemale` field of its own (see
    // RawRegionPokemon) — so only the matching MALE assetForms entry is
    // truly redundant with it. A species like Sneasel (dex 215) lists both
    // a male AND female HISUIAN assetForm; shadowing both (as an earlier
    // version of this check did, by ignoring isFemale) silently dropped the
    // female Hisuian Sneasel entirely, since nothing else ever emits her.
    const isShadowedByRegionForm =
      !!assetForm.form &&
      !assetForm.isFemale &&
      Object.keys(pokemon.regionForms).some((key) =>
        key.startsWith(`${pokemon.id}_${assetForm.form}`)
      );
    if (isShadowedByRegionForm) {
      continue;
    }

    // `assetForms` also lists entries that duplicate a `megaEvolutions`
    // entry one-for-one — Mega Venusaur's "MEGA", but also Primal
    // Kyogre/Groudon's "PRIMAL" (megaEvolutionToEntries borrows this
    // assetForm's sprite as its own, since `megaEvolutions.assets` for
    // those two is a data gap pointing at the plain base sprite instead of
    // real Primal art). Matched by `form` value against each mega's own
    // suffix (mirroring megaEvolutionToEntries' lookup) rather than a fixed
    // name pattern, since a species like Mewtwo has an unrelated "A" Armor
    // form that must NOT be treated as a mega duplicate.
    const isShadowedByMegaEvolution =
      !!assetForm.form && megaEvolutionFormSuffixes.has(assetForm.form);
    if (isShadowedByMegaEvolution) {
      continue;
    }

    // A female assetForm can share a `form` with a `regionForms` entry
    // without being shadowed by it (see isShadowedByRegionForm above, which
    // only shadows the male half) — e.g. Sneasel's female HISUIAN. Tag her
    // with the same region and a name built from the male region form's
    // API-provided name (rather than the generic "Species (Suffix)" pattern
    // `formDisplayName` falls back to) so both genders read consistently as
    // "Hisuian Sneasel", not a "Sneasel (Hisuian)"/"Hisuian Sneasel" mismatch.
    const matchingRegionForm = Object.entries(pokemon.regionForms).find(([key]) =>
      key.startsWith(`${pokemon.id}_${assetForm.form}`)
    )?.[1];
    const formEntries = assetFormToEntries(
      pokemon,
      speciesName,
      matchingRegionForm ? regionFromFormId(matchingRegionForm.formId) : null,
      assetForm,
      order,
      genderedFormKeys,
      matchingRegionForm?.names.English
    );
    entries.push(...formEntries);
    order += formEntries.length;
  }

  for (const regionForm of Object.values(pokemon.regionForms)) {
    // `regionForms` is also reused by pokemon-go-api for non-region "the
    // species' own default form is one of several explicitly named forms"
    // cases — e.g. Cherrim's CHERRIM_OVERCAST/CHERRIM_SUNNY, Shellos/
    // Gastrodon's EAST_SEA/WEST_SEA. When one of these matches the base
    // row's sprite exactly, it's the same variant duplicated, just via a
    // different nesting than the assetForms case handled above.
    const isSpriteIdenticalToBase =
      !!pokemon.assets && regionForm.assets?.image === pokemon.assets.image;
    if (isSpriteIdenticalToBase) {
      continue;
    }

    const regionEntries = regionPokemonToEntries(
      regionForm,
      order,
      pokemon.id,
      genderedFormKeys,
      speciesName
    );
    entries.push(...regionEntries);
    order += regionEntries.length;
  }

  for (const mega of Object.values(pokemon.megaEvolutions ?? {})) {
    const megaEntries = megaEvolutionToEntries(pokemon, speciesName, mega, order);
    entries.push(...megaEntries);
    order += megaEntries.length;
  }

  return entries;
}

/**
 * Regional variants recurse (a region form can itself list further
 * regionForms, per the OpenAPI schema), so this walks that structure
 * rather than assuming a single level of nesting.
 */
export function regionPokemonToEntries(
  regionPokemon: RawRegionPokemon,
  startOrder = 0,
  /** The root species id and its gendered-form-key set, used only to detect
   * whether this region form has a female counterpart hiding in the root
   * species' assetForms (see Sneasel/HISUIAN in pokemonToEntries) — if so,
   * this male row gets the ♂ symbol so it doesn't look unmarked next to her. */
  rootSpeciesId?: string,
  genderedFormKeys?: Set<string>,
  /** The root species' own name, used only to detect when this region
   * form's own `names.English` is a generic copy of it (see hasGenericName
   * below) rather than a real distinguishing label. */
  rootSpeciesName?: string
): CatalogEntry[] {
  const speciesName = regionPokemon.names.English;
  const region = regionFromFormId(regionPokemon.formId);
  const entries: CatalogEntry[] = [];
  let order = startOrder;

  if (regionPokemon.assets) {
    const regionSuffix = rootSpeciesId
      ? regionPokemon.formId.replace(`${rootSpeciesId}_`, '')
      : null;
    const isGenderedForm = !!regionSuffix && !!genderedFormKeys?.has(`${regionSuffix}|`);
    // "_S" region forms are pokemon-go-api's modeling of Apex Shadow
    // Pokemon — a small set of Legendary raid bosses (Raikou/Entei/Suicune/
    // Unown/Lugia/Ho-Oh/Latias/Latios) with a stronger, permanent Shadow
    // form distinct from ordinary Shadow Pokemon (which this app doesn't
    // track at all and aren't modeled this way in the source data). These
    // are real, separately-catchable variants worth tracking even where
    // pokemon-go-api hasn't published unique art for them yet.
    const isApexShadowForm = regionPokemon.formId.endsWith('_S');
    // pokemon-go-api occasionally leaves a regionForms entry's own name
    // identical to the plain species name — e.g. Darmanitan's Galarian
    // Standard/Zen forms are both just "Darmanitan", indistinguishable from
    // each other and from the base species. When that happens, fall back to
    // a label built from the formId's own suffix (the same "Species (Suffix)"
    // convention used elsewhere), since that suffix reliably encodes the
    // real distinguishing info the API's own name field failed to surface.
    const hasGenericName = speciesName === rootSpeciesName && !!regionSuffix;
    const fallbackName = hasGenericName
      ? `${speciesName} (${readableFormLabel(regionSuffix!)})`
      : speciesName;
    const displayName = isApexShadowForm ? `Apex Shadow ${speciesName}` : fallbackName;
    const base = {
      // `CatalogEntry.speciesName` must stay the plain root species name
      // (e.g. "Maushold") even when this region form's own API-provided
      // `names.English` is itself form-qualified (e.g. Maushold's
      // MAUSHOLD_FAMILY_OF_THREE region form is named "Maushold (Family of
      // Three)" by the API) — using the local `speciesName` here polluted
      // `speciesName` with form-specific text, which then leaked into any
      // consumer (like search-string generation) that groups/dedupes by
      // species name. `rootSpeciesName` is only undefined at the top-level
      // (non-recursive) call, where `speciesName` is already the root name.
      ...baseFields(regionPokemon, rootSpeciesName ?? speciesName),
      name: isGenderedForm ? `${displayName} ♂` : displayName,
      region,
      form: null,
      costume: null,
      isBaseForm: true,
      pokedexType: 'regular' as PokedexType,
    };
    const assetEntries = assetToEntries(base, regionPokemon.assets, false, order);
    entries.push(...assetEntries);
    order += assetEntries.length;
  }

  for (const nestedRegionForm of Object.values(regionPokemon.regionForms)) {
    const nestedEntries = regionPokemonToEntries(
      nestedRegionForm,
      order,
      rootSpeciesId,
      genderedFormKeys,
      rootSpeciesName
    );
    entries.push(...nestedEntries);
    order += nestedEntries.length;
  }

  return entries;
}

/**
 * pokemon-go-api models most cosmetic event outfits via `costume`, but for
 * some species (Pikachu above all — every single one of its ~47 `form`
 * values turns out to be an event outfit like DOCTOR/ROCK_STAR/HORIZONS/
 * WCS_2024, not a real battle/regional form) it instead models them as
 * `form`, indistinguishable from true forms by any structural signal —
 * confirmed by diffing Pikachu's assetForms against every other species,
 * where genuine forms (GALARIAN, MEGA, GIGANTAMAX, etc.) coexist alongside
 * a handful of the same event-outfit values. There is no reliable way to
 * detect this automatically, so known offending (speciesId, form) pairs are
 * swapped into `costume` here, once, before any other transform logic reads
 * `assetForm.form`/`.costume` — so every downstream reader (grouping,
 * gendered-key detection, region/mega shadowing, id/name generation) sees
 * already-corrected data instead of needing its own special case.
 */
const COSTUME_LIKE_FORMS: Record<string, Set<string> | 'all'> = {
  PIKACHU: 'all',
  BULBASAUR: new Set(['FALL_2019']),
  CHARMANDER: new Set(['FALL_2019']),
  SQUIRTLE: new Set(['FALL_2019']),
  VENUSAUR: new Set(['COPY_2019']),
  CHARIZARD: new Set(['COPY_2019']),
  BLASTOISE: new Set(['COPY_2019']),
  PSYDUCK: new Set(['SWIM_2025']),
  SLOWPOKE: new Set(['2020']),
  SLOWBRO: new Set(['2021']),
  SLOWKING: new Set(['2022']),
  GENGAR: new Set(['COSTUME_2020']),
  LAPRAS: new Set(['COSTUME_2020']),
  SABLEYE: new Set(['COSTUME_2020']),
  EEVEE: new Set(['GOFEST_2024_MTIARA', 'GOFEST_2024_STIARA']),
  AERODACTYL: new Set(['SUMMER_2023']),
  SNORLAX: new Set(['WILDAREA_2024']),
  SUDOWOODO: new Set(['WINTER_2025']),
  ESPEON: new Set(['GOFEST_2024_SSCARF']),
  UMBREON: new Set(['GOFEST_2024_MSCARF']),
  DELIBIRD: new Set(['WINTER_2020']),
  CUBCHOO: new Set(['WINTER_2020']),
  BEARTIC: new Set(['WINTER_2020']),
  CHARJABUG: new Set(['WINTER_2025']),
  VIKAVOLT: new Set(['WINTER_2025']),
  BEWEAR: new Set(['WILDAREA_2025']),
  FALINKS: new Set(['GOFEST_2025_TRAIN_CONDUCTOR']),
};

function isCostumeLikeForm(speciesId: string, form: string): boolean {
  if (isReservedBattleMechanicForm(form)) {
    return false;
  }
  const override = COSTUME_LIKE_FORMS[speciesId];
  return override === 'all' || (override?.has(form) ?? false);
}

function normalizeCostumeLikeForms(pokemon: RawPokemon): RawPokemon {
  if (!(pokemon.id in COSTUME_LIKE_FORMS)) {
    return pokemon;
  }

  return {
    ...pokemon,
    assetForms: pokemon.assetForms.map((assetForm) =>
      assetForm.form && isCostumeLikeForm(pokemon.id, assetForm.form)
        ? { ...assetForm, form: null, costume: assetForm.form }
        : assetForm
    ),
  };
}

const SIZE_TIERS = ['xxl', 'xxs'] as const;

/**
 * XXL/XXS aren't a form or battle mechanic — they're a random size roll
 * Niantic assigns per-individual-catch, with no distinct sprite and no
 * per-species signal in pokemon-go-api/PokeAPI at all (unlike Mega/GMax/
 * DMax, which are all genuine alternate forms). So instead of adding a new
 * form/sprite, this just clones regular entries into an xxl and an xxs
 * pokedexType twin — reusing the exact same sprite — purely so the app can
 * track "which species am I still missing an XXL/XXS catch of" as its own
 * independent checklist. Runs as a pure post-processing pass over the fully
 * -flattened entries, since it only needs the final CatalogEntry shape, not
 * any of the raw pokemon-go-api structure.
 *
 * Scoped to `isBaseForm` regular entries by default (matches the existing
 * definition of "base form" already used elsewhere in this file) — this
 * includes species AND their regional variants (Alolan/Galarian/Hisuian/
 * Paldean forms are independently catchable and can roll XXL/XXS too), but
 * excludes gendered-only pairs and named alt-forms, since those would
 * balloon the size-tier pokedexes without adding anything a player actually
 * tracks by XXL/XXS in practice. Costumes are excluded structurally rather
 * than by an explicit check: they're never `pokedexType === 'regular'` (see
 * `assetFormToEntries`), so they never reach `regularEntries` at all.
 *
 * Exception: a species with ZERO `isBaseForm` regular rows at all — Unown,
 * Burmy, Wormadam — has no "plain" appearance to fall back to (every one of
 * Unown's 28 letters, or Burmy/Wormadam's 3 cloak forms, is itself a named
 * form). Each of those named forms is independently catchable and can roll
 * XXL/XXS in-game, so for exactly these base-form-less species, every
 * regular entry for that species gets cloned instead of none at all.
 */
function addSizeTierEntries(entries: CatalogEntry[]): CatalogEntry[] {
  const regularEntries = entries.filter((entry) => entry.pokedexType === 'regular');
  const speciesWithBaseForm = new Set(
    regularEntries.filter((entry) => entry.isBaseForm).map((entry) => entry.speciesId)
  );

  const sizeTierSourceEntries = regularEntries.filter(
    (entry) => entry.isBaseForm || !speciesWithBaseForm.has(entry.speciesId)
  );

  const sizeTierEntries = sizeTierSourceEntries.flatMap((entry) =>
    SIZE_TIERS.map((sizeTier) => ({
      ...entry,
      id: `${entry.id}-${sizeTier}`,
      pokedexType: sizeTier as PokedexType,
    }))
  );

  return [...entries, ...sizeTierEntries];
}

export function pokedexToEntries(pokedex: RawPokemon[]): CatalogEntry[] {
  const entries = pokedex.map(normalizeCostumeLikeForms).flatMap(pokemonToEntries);
  return addSizeTierEntries(entries);
}
