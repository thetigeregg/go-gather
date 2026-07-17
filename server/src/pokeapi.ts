/* eslint-disable @typescript-eslint/restrict-template-expressions -- ported
   verbatim from go-gather-next (see docs/progress/phase-4-catalog-pipeline.md);
   go-gather-next's own ESLint config doesn't enforce this strictTypeChecked rule. */
const POKEAPI_BASE = 'https://pokeapi.co/api/v2/pokemon';

interface PokeApiHomeSprites {
  front_default: string | null;
  front_shiny: string | null;
}

interface PokeApiSprites {
  front_default: string | null;
  front_shiny: string | null;
  other?: {
    home?: PokeApiHomeSprites;
  };
}

interface PokeApiPokemon {
  sprites: PokeApiSprites;
}

/**
 * PokeAPI only models mainline-game data, but for a BASE species (no
 * GO-exclusive form/costume) its own numeric id equals the National Dex
 * number directly, so a dex-number lookup needs no name normalization
 * (avoiding Ho-Oh/Mr. Mime/Farfetch'd-style hyphenation mismatches). Used
 * only to backfill species pokemon-go-api has no assets for at all —
 * PokeAPI has no representation of GO-exclusive costumes/forms, so this
 * can't help fill in a missing assetForm/regionForm/megaEvolution sprite,
 * only a fully-missing base species.
 *
 * Uses `sprites.other.home` (Pokemon HOME renders) rather than the default
 * flat pixel-art `front_default`/`front_shiny` — HOME's art is rendered
 * from the same 3D model style Pokemon GO's own sprites are derived from,
 * so it's a much closer visual match than the classic Gen 5-style sprites.
 * Falls back to the flat sprite if a species has no HOME render for some
 * reason (e.g. very old sprite-set gaps).
 *
 * Returns null if PokeAPI has no entry or no usable sprite for this dex
 * number (e.g. a very recent species neither source has yet).
 */
export async function fetchPokeApiSprites(
  dexNr: number
): Promise<{ image: string; shinyImage: string } | null> {
  const response = await fetch(`${POKEAPI_BASE}/${dexNr}`);
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as PokeApiPokemon;
  const home = data.sprites.other?.home;
  const image = home?.front_default ?? data.sprites.front_default;
  const shinyImage = home?.front_shiny ?? data.sprites.front_shiny ?? image;

  if (!image) {
    return null;
  }

  return { image, shinyImage: shinyImage ?? image };
}

/**
 * Gigantamax forms follow the same PokeAPI "variety" slug pattern as Mega
 * Evolutions (`{species}-gmax`) — used only for species confirmed released
 * in Pokemon GO but still missing a GIGANTAMAX assetForms entry upstream
 * (see RELEASED_GIGANTAMAX_DEX_NUMBERS in sync.ts). Not every species with
 * a PokeAPI gmax variety belongs there: most Sword/Shield Gigantamax forms
 * were never added to Pokemon GO at all.
 *
 * `formSlug`, when provided, looks up a specific form's own gmax variety
 * instead — `{species}-{formSlug}-gmax` (e.g. `toxtricity-amped-gmax`) —
 * for the small set of species whose Gigantamax appearance genuinely
 * differs per pre-existing form (see formSplitGigantamaxDexNumbers in
 * sync-overrides.json).
 */
export async function fetchPokeApiGigantamaxSprites(
  speciesName: string,
  formSlug?: string
): Promise<{ image: string; shinyImage: string } | null> {
  const slug = formSlug
    ? `${speciesName.toLowerCase()}-${formSlug}-gmax`
    : `${speciesName.toLowerCase()}-gmax`;

  const response = await fetch(`${POKEAPI_BASE}/${slug}`);
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as PokeApiPokemon;
  const home = data.sprites.other?.home;
  const image = home?.front_default ?? data.sprites.front_default;
  const shinyImage = home?.front_shiny ?? data.sprites.front_shiny ?? image;

  if (!image) {
    return null;
  }

  return { image, shinyImage: shinyImage ?? image };
}

/**
 * Backfills a `regionForms` entry's sprite from an explicit PokeAPI slug
 * (see `regionFormAssetBackfill` in sync-overrides.json) — unlike
 * `fetchPokeApiMegaSprites`/`fetchPokeApiGigantamaxSprites`, the slug can't
 * be mechanically derived from the species name for this group of species:
 * Silvally's 17 type-based regionForms all share ONE PokeAPI sprite (no
 * per-type art exists), Koraidon/Miraidon's GO-exclusive raid forms have no
 * PokeAPI equivalent at all, and several others (Squawkabilly, Minior, ...)
 * use PokeAPI slugs that don't match pokemon-go-api's own form-name
 * spelling 1:1. So the caller always supplies the exact slug to fetch,
 * hand-verified per species rather than derived here.
 */
export async function fetchPokeApiSpritesBySlug(
  slug: string
): Promise<{ image: string; shinyImage: string } | null> {
  const response = await fetch(`${POKEAPI_BASE}/${slug}`);
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as PokeApiPokemon;
  const home = data.sprites.other?.home;
  const image = home?.front_default ?? data.sprites.front_default;
  const shinyImage = home?.front_shiny ?? data.sprites.front_shiny ?? image;

  if (!image) {
    return null;
  }

  return { image, shinyImage: shinyImage ?? image };
}

/**
 * Mega Evolutions (and Primal forms, though those are already handled via a
 * different path — see transform.ts's matchingAssetForm) aren't addressable
 * by dex number on PokeAPI: they're separate "varieties" of the base
 * species with their own non-dex-number numeric ids (e.g. Mega Dragonite is
 * id 10281, not 149), but PokeAPI does expose a stable, human-readable slug
 * for each — `{species}-mega`, `{species}-mega-x`, `{species}-mega-y` — that
 * can be built directly from the species' English name without needing to
 * resolve the id first. All species with a mega in pokemon-go-api happen to
 * have simple ASCII names (no Farfetch'd/Mr. Mime-style hyphenation or
 * apostrophe edge cases to normalize), so a plain lowercase is sufficient.
 *
 * Returns null if PokeAPI has no such variety (most GO "Mega Evolutions"
 * that were never real mainline-game Mega Evolutions — Mega Raichu, Mega
 * Dragonite, Mega Skarmory, etc. — don't exist in PokeAPI either, though
 * several do, filed under PokeAPI's fan-game-derived sprite set).
 */
export async function fetchPokeApiMegaSprites(
  speciesName: string,
  megaSuffix: 'MEGA' | 'MEGA_X' | 'MEGA_Y'
): Promise<{ image: string; shinyImage: string } | null> {
  const slugSuffix = megaSuffix === 'MEGA' ? 'mega' : megaSuffix === 'MEGA_X' ? 'mega-x' : 'mega-y';
  const slug = `${speciesName.toLowerCase()}-${slugSuffix}`;

  const response = await fetch(`${POKEAPI_BASE}/${slug}`);
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as PokeApiPokemon;
  const home = data.sprites.other?.home;
  const image = home?.front_default ?? data.sprites.front_default;
  const shinyImage = home?.front_shiny ?? data.sprites.front_shiny ?? image;

  if (!image) {
    return null;
  }

  return { image, shinyImage: shinyImage ?? image };
}
