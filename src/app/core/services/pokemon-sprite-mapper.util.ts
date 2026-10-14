import { POKEMON_NAME_TO_ID } from './pokemon-name-to-id.constant';
import { POKEMON_FAMILY_ID } from './pokemon-family.constant';
import { PokemonFormData, POKEMON_FORM_MAP } from './pokemon-form-map.constant';
import { VALID_STATIC_SPRITES } from './valid-static-sprites.constant';
import { GIGANTAMAX_POKEMON_IDS } from './valid-gigantamax-sprites.constant';

/**
 * Ported from pogo-cal's src/utils/pokemonMapper.ts — static-sprite path
 * only. `getPokemonAnimatedUrl`/`VALID_ANIMATED_SPRITES`/
 * `parsePokemonNameWithOptionalForm` (animated-only — the static path takes
 * an already-parsed name+suffix from event-pokemon-names.util.ts instead)
 * are all omitted per the static-only decision for this port.
 */

const loggedMissingStaticSprites = new Set<string>();

/** Normalize Pokemon names for matching — smart Unicode normalization + gender symbols. */
export function normalizePokemonName(name: string): string {
  return name
    .toLowerCase()
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .replace(/_/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Built lazily, once, on first lookup — POKEMON_NAME_TO_ID is a static
// ~1045-entry constant, so a per-call O(n) scan (each comparison itself
// paying for a fresh normalizePokemonName() call) was a real, measurable
// main-thread cost: events with dozens of raid bosses (e.g. a GO Fest day
// with 50+ bosses) could burn several seconds re-scanning this table once
// per boss per resolver stage. A one-time reverse index turns every
// subsequent lookup into a single Map.get().
let normalizedNameToIdIndex: Map<string, number> | null = null;

function getNormalizedNameToIdIndex(): Map<string, number> {
  normalizedNameToIdIndex ??= new Map(
    Object.entries(POKEMON_NAME_TO_ID).map(([pokeName, id]) => [normalizePokemonName(pokeName), id])
  );
  return normalizedNameToIdIndex;
}

export function getPokemonId(name: string): number | null {
  const normalizedInput = normalizePokemonName(name);
  return getNormalizedNameToIdIndex().get(normalizedInput) ?? null;
}

// Same lazy-cached-once reasoning as getNormalizedNameToIdIndex() above —
// POKEMON_FAMILY_ID is a static ~1000-entry constant, so normalizing every
// name is worth doing exactly once rather than on every getFamilyMemberNames()
// call (a prefix search, unlike getPokemonId's exact lookup, can't collapse
// to a single Map.get() and needs to scan these pairs on every call, but a
// ~1000-entry .filter() is still sub-millisecond per keystroke).
let normalizedFamilyEntries: [string, number][] | null = null;

function getNormalizedFamilyEntries(): [string, number][] {
  normalizedFamilyEntries ??= Object.entries(POKEMON_FAMILY_ID).map(
    ([name, id]) => [normalizePokemonName(name), id] as [string, number]
  );
  return normalizedFamilyEntries;
}

/** Every species belonging to a family that has at least one member whose
 * name starts with `term` (normalized), e.g. "pikachu" -> {pichu, pikachu,
 * raichu}, or a short prefix like "bu" -> the union of every family with a
 * matching member (Bulbasaur's, Burmy's, Bunnelby's, etc). Falls back to a
 * single-member set containing just the normalized input when nothing
 * matches, so an unrecognized/empty search behaves like an exact match
 * rather than matching everything or nothing. */
export function getFamilyMemberNames(term: string): Set<string> {
  const normalizedTerm = normalizePokemonName(term);
  const entries = getNormalizedFamilyEntries();

  const matchingFamilyIds = new Set(
    entries.filter(([name]) => name.startsWith(normalizedTerm)).map(([, id]) => id)
  );

  if (matchingFamilyIds.size === 0) {
    return new Set([normalizedTerm]);
  }

  return new Set(entries.filter(([, id]) => matchingFamilyIds.has(id)).map(([name]) => name));
}

export function isValidStaticSprite(spriteName: string): boolean {
  return VALID_STATIC_SPRITES.has(spriteName.toLowerCase());
}

/** Some of our slugs are more specific than PokeMiners' form names (e.g. "crownedsword" → "CROWNED"). */
const POKEMINERS_FORM_ALIASES: Record<string, string> = {
  crownedsword: 'CROWNED',
  crownedshield: 'CROWNED',
};

/** Does this Pokemon have a PokeMiners form matching the given suffix? Forms are stored with an
 * 'f' prefix (e.g. "fBURN"), so this checks both with and without it. */
function pokeMinersHasForm(pokemon: PokemonFormData, formSuffix: string): boolean {
  const cleanedSuffix = formSuffix.startsWith('-') ? formSuffix.substring(1) : formSuffix;
  const normalizedForm =
    POKEMINERS_FORM_ALIASES[cleanedSuffix.toLowerCase()] ?? cleanedSuffix.toUpperCase();

  return pokemon.forms.some(
    (f) => f.substring(1) === normalizedForm || f.toUpperCase() === normalizedForm
  );
}

const POKEMINERS_URL_PREFIX =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon/Addressable%20Assets/';
/** PokeMiners' 256x256 extraction folder: newly-released assets sometimes land here before the standard icon folder. */
const POKEMINERS_256_PREFIX =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon%20-%20256x256/Addressable%20Assets/';
const POKEMINERS_MIRROR_CDN = 'https://db.pokemongohub.net/images/ingame/normal/';

/** Get PokeMiners asset URL for a Pokemon using the form mapping. */
function getPokeMinersSpriteUrl(pokemonId: number, formSuffix?: string): string | null {
  const formMap: Partial<Record<string, PokemonFormData | null>> = POKEMON_FORM_MAP;
  const pokemon = formMap[pokemonId.toString()];

  // Effectively unreachable under the current data (every ID 1-1025 has a
  // form-map entry, verified) — kept as a guard for parity with source.
  if (pokemon === undefined) {
    return null;
  }

  let suffix = '';

  if (pokemon === null) {
    suffix = '';
  } else if (formSuffix) {
    if (pokeMinersHasForm(pokemon, formSuffix)) {
      const cleanedSuffix = formSuffix.startsWith('-') ? formSuffix.substring(1) : formSuffix;
      const normalizedForm =
        POKEMINERS_FORM_ALIASES[cleanedSuffix.toLowerCase()] ?? cleanedSuffix.toUpperCase();
      suffix = `.${cleanedSuffix.startsWith('f') ? cleanedSuffix : 'f' + normalizedForm}`;
    } else {
      suffix = pokemon.default ? `.${pokemon.default}` : '';
    }
  } else {
    suffix = pokemon.default ? `.${pokemon.default}` : '';
  }

  const filename = `pm${String(pokemonId)}${suffix}.icon.png`;
  return `${POKEMINERS_URL_PREFIX}${filename}`;
}

/** True when a sprite genuinely matches the Pokemon's exact requested form (static or PokeMiners) —
 * as opposed to `getPokeMinersSpriteUrl`'s "form not found -> use default" fallback, which silently
 * hands back the base sprite for an unmatched suffix. Callers with a better fallback available (e.g.
 * an event-provided boss image) should check this before trusting a generated sprite URL. */
export function hasExactSpriteForm(pokemonName: string, suffix?: string): boolean {
  const pokemonId = getPokemonId(pokemonName);
  if (pokemonId == null) {
    return false;
  }
  if (!suffix) {
    return true;
  }

  const urlName = normalizePokemonName(pokemonName).replace(/[^a-z0-9]/g, '') + suffix;
  if (isValidStaticSprite(urlName)) {
    return true;
  }

  const pokemon = POKEMON_FORM_MAP[pokemonId.toString()];
  return pokemon != null && pokeMinersHasForm(pokemon, suffix);
}

function swapUrlBase(url: string, fromBase: string, toBase: string): string | null {
  if (!url.startsWith(fromBase)) {
    return null;
  }
  const filename = url.split('/').pop();
  return filename ? `${toBase}${filename}` : null;
}

export function getSprite256FallbackUrl(spriteUrl: string): string | null {
  return swapUrlBase(spriteUrl, POKEMINERS_URL_PREFIX, POKEMINERS_256_PREFIX);
}

export function getSpriteFallbackUrl(spriteUrl: string): string | null {
  return swapUrlBase(spriteUrl, POKEMINERS_URL_PREFIX, POKEMINERS_MIRROR_CDN);
}

/** Gigantamax sprites live on a standalone CDN (no PokeMiners/mgrann coverage), so they don't
 * participate in the tiered fallback above — an unknown filename resolves to a 404. */
const HYBRIDSHIVAM_GMAX_PREFIX =
  'https://raw.githubusercontent.com/HybridShivam/Pokemon/master/assets/images/';

/** Filenames for Pokemon with multiple Gigantamax forms; all other Gmax Pokemon use `${paddedId}-Gmax.png`. */
const GIGANTAMAX_FORM_FILENAMES: Record<
  number,
  { default: string; forms: Record<string, string> }
> = {
  849: { default: '0849-Amped-Gmax.png', forms: { 'low-key': '0849-Low-Key-Gmax.png' } }, // Toxtricity
  892: {
    default: '0892-Single-Strike-Gmax.png',
    forms: { 'rapid-strike': '0892-Rapid-Strike-Gmax.png' },
  }, // Urshifu
};

export function getGigantamaxSpriteUrl(pokemonName: string, formSlug?: string): string | null {
  const pokemonId = getPokemonId(pokemonName);
  if (pokemonId == null || !GIGANTAMAX_POKEMON_IDS.has(pokemonId)) {
    return null;
  }

  const gmaxFilenames: Partial<Record<number, { default: string; forms: Record<string, string> }>> =
    GIGANTAMAX_FORM_FILENAMES;
  const formData = gmaxFilenames[pokemonId];
  let filename: string;
  if (formData) {
    const forms: Partial<Record<string, string>> = formData.forms;
    filename = (formSlug && forms[formSlug]) || formData.default;
  } else {
    filename = `${String(pokemonId).padStart(4, '0')}-Gmax.png`;
  }

  return `${HYBRIDSHIVAM_GMAX_PREFIX}${filename}`;
}

/** True for Pokemon whose Mega Evolution splits into separate X/Y sprites (currently Charizard,
 * Mewtwo) rather than a single unified Mega form. */
export function hasSplitMegaXYForms(pokemonName: string): boolean {
  const pokemonId = getPokemonId(pokemonName);
  if (pokemonId == null) {
    return false;
  }

  const pokemon = POKEMON_FORM_MAP[pokemonId.toString()];
  return pokemon != null && pokemon.forms.includes('fMEGA_X') && pokemon.forms.includes('fMEGA_Y');
}

export function getPokemonSpriteUrl(
  pokemonNameOrId: string | number,
  suffix?: string
): string | null {
  let pokemonName: string;
  let pokemonId: number | null = null;

  if (typeof pokemonNameOrId === 'string') {
    pokemonId = getPokemonId(pokemonNameOrId);
    if (!pokemonId) {
      return null;
    }
    pokemonName = pokemonNameOrId;
  } else {
    const foundName = Object.entries(POKEMON_NAME_TO_ID).find(([, id]) => id === pokemonNameOrId);
    if (!foundName) {
      return null;
    }
    pokemonName = foundName[0];
    pokemonId = pokemonNameOrId;
  }

  let urlName = normalizePokemonName(pokemonName).replace(/[^a-z0-9]/g, '');
  if (suffix) {
    urlName += suffix;
  }

  if (isValidStaticSprite(urlName)) {
    return `https://raw.githubusercontent.com/mgrann03/pokemon-resources/refs/heads/main/graphics/pogo/${urlName}.png`;
  }

  if (pokemonId) {
    const pokeminersUrl = getPokeMinersSpriteUrl(pokemonId, suffix);
    if (pokeminersUrl) {
      return pokeminersUrl;
    }
  }

  // Effectively unreachable under the current data tables: every ID in
  // pokemon-name-to-id.constant.ts has a pokemon-form-map.constant.ts entry
  // (verified — no gaps 1-1025), so any name/ID that resolves via
  // getPokemonId()/the ID lookup above always gets a PokeMiners URL. Kept
  // for parity with source (and as a guard if the data tables ever diverge).
  if (!loggedMissingStaticSprites.has(urlName)) {
    console.info('Could not find static sprite for:', pokemonNameOrId);
    loggedMissingStaticSprites.add(urlName);
  }

  return null;
}
