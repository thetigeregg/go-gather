export enum Region {
  Alola = 'alola',
  Galar = 'galar',
  Hisui = 'hisui',
  Paldea = 'paldea',
}

export type PokemonClass =
  'POKEMON_CLASS_LEGENDARY' | 'POKEMON_CLASS_MYTHIC' | 'POKEMON_CLASS_ULTRA_BEAST';

/**
 * Which pokedex a catalog entry belongs to. Mega and Gigantamax entries are
 * event/battle-mechanic variants tracked separately from the regular dex —
 * pokemon-go-api models Mega via a distinct `megaEvolutions` object and
 * Gigantamax via an `assetForms` entry with `form: "GIGANTAMAX"`, neither of
 * which has its own dexNr, so they're tagged here rather than inferable from
 * dexNr/generation alone. `dmax` (Dynamax) is synthesized the same way via
 * an assetForms entry with `form: "DYNAMAX"`, added by sync.ts for
 * hand-curated species (see sync-overrides.json) since neither
 * pokemon-go-api nor PokeAPI has any per-species Dynamax signal at all.
 *
 * `costume` entries are, like Mega/GMax/DMax, real `assetForms` rows with
 * their own sprite — just keyed off a truthy `assetForm.costume` instead of
 * a reserved `form` value. Splitting them into their own pokedexType (rather
 * than leaving them inline in `regular`, distinguished only by the
 * `costume` field) keeps the Regular dex free of event-outfit clutter and
 * lets costumes get their own Default/Shiny search strings via the same
 * generic mechanism the other non-regular types already use.
 *
 * `xxl`/`xxs` are different in kind from all of the above: they're not a
 * form or battle mechanic at all, just a random size roll Niantic assigns
 * per-individual-catch, so there's no distinct sprite or upstream signal to
 * key off. transform.ts synthesizes one xxl and one xxs clone of every
 * `isBaseForm` regular entry (reusing its sprite as-is), purely so this app
 * can track "which species am I still missing an XXL/XXS catch of" as its
 * own independent checklist and generate matching search strings.
 */
export type PokedexType = 'regular' | 'mega' | 'max' | 'dmax' | 'costume' | 'xxl' | 'xxs';

/** All 7 `PokedexType` values — used to seed a full `Record<PokedexType, ...>`
 * (e.g. `DEFAULT_SETTINGS.excludedSearchTermsByPokedex`) without missing an
 * entry. Duplicated from `POKEDEX_TYPE_OPTIONS`
 * (`src/app/features/side-menu/side-menu.component.ts`) since `shared`
 * cannot import from the app. */
const POKEDEX_TYPES: PokedexType[] = ['regular', 'mega', 'max', 'dmax', 'xxl', 'xxs', 'costume'];

/**
 * One catchable variant: a species + form + costume + gender + shiny
 * combination. This is the flattened row the sync script writes to
 * `pokemon_catalog` and the row the frontend renders as a single
 * "gather entry" card.
 */
export interface CatalogEntry {
  id: string;
  dexNr: number;
  generation: number;
  speciesId: string;
  formId: string;
  name: string;
  speciesName: string;
  imgUrl: string;
  isShiny: boolean;
  isFemale: boolean;
  form: string | null;
  costume: string | null;
  region: Region | null;
  primaryType: string;
  secondaryType: string | null;
  pokemonClass: PokemonClass | null;
  /** True for the plain species/region-form row with no costume/form/gender variant. */
  isBaseForm: boolean;
  pokedexType: PokedexType;
  order: number;
}

export interface ProgressEntry {
  catalogEntryId: string;
  caught: boolean;
  updatedAt: string;
}

/**
 * One user-defined exclusion rule for a pokedex's generated search strings
 * (Search Strings page) — a Pokemon GO search keyword/size/tag that
 * generated strings for that pokedex exclude, e.g. `shadow`, `xxl`, `Trade`,
 * so the app doesn't suggest catching Pokemon the user isn't looking for.
 * Presence in `UserSettings.excludedSearchTermsByPokedex` is what makes an
 * entry active — there's no separate enabled flag to toggle.
 */
export interface ExcludedSearchTerm {
  kind: 'keyword' | 'size' | 'tag';
  value: string;
}

/**
 * A full user-data backup: caught progress plus the excluded-patterns
 * filters (name regex + dex numbers). `version` is bumped whenever the
 * shape changes, so a future import can detect and migrate an older file
 * instead of silently misreading it.
 */
export interface ExportBundle {
  version: 1;
  exportedAt: string;
  progress: ProgressEntry[];
  excludedNamePatterns: string[];
  excludedDexNumbers: number[];
  excludedShinyDexNumbers: number[];
  excludedShinyNamePatterns: string[];
  userTags: string[];
  presetQueries: PresetQuery[];
  excludedSearchTermsByPokedex: Record<PokedexType, ExcludedSearchTerm[]>;
}

/**
 * A plain, serializable mirror of the app's `SearchTerm` union (defined in
 * `src/app/core/search-engine/search-query.model.ts`) — kept here, not
 * there, because `ExportBundle` must serialize preset queries and `shared`
 * cannot import from the app (server also depends on `shared`, and the
 * search engine is app-only UI/business logic the server never touches).
 * The app imports this type directly rather than declaring a duplicate,
 * and must keep it structurally identical to `SearchTerm` — the same
 * relationship `CatalogEntry` already has between `server/transform.ts`
 * and the app's `filter.service.ts`.
 */
export type SearchTermData =
  | { kind: 'name'; value: string }
  | { kind: 'family'; value: string }
  | { kind: 'nickname'; value: string }
  | { kind: 'tag'; value: string }
  | { kind: 'hasTag' }
  | { kind: 'region'; value: string }
  | { kind: 'keyword'; value: string }
  | { kind: 'type'; value: string }
  | { kind: 'gender'; value: string }
  | { kind: 'size'; value: string }
  | { kind: 'raidOrigin'; value: string }
  | { kind: 'move'; value: string }
  | { kind: 'moveType'; value: string }
  | { kind: 'fastMoveType'; value: string }
  | { kind: 'chargedMoveType'; value: string }
  | { kind: 'secondChargedMoveType'; value: string }
  | { kind: 'weather' }
  | { kind: 'special' }
  | { kind: 'weakAgainst'; value: string }
  | { kind: 'superEffectiveAgainst'; value: string }
  | { kind: 'numeric'; field: string; value: number | { min?: number; max?: number } }
  | { kind: 'statRating'; field: string; value: number }
  | { kind: 'appraisalStars'; value: number }
  | { kind: 'buddyLevel'; value: number }
  | { kind: 'megaLevel'; value: number }
  | { kind: 'raw'; value: string };

export interface PresetQueryRule {
  id: string;
  term: SearchTermData;
  negate: boolean;
}

export interface PresetQueryGroup {
  id: string;
  /** Rules within a group are ANDed together. */
  rules: PresetQueryRule[];
}

export interface PresetQuery {
  id: string;
  name: string;
  /** Groups are OR'd together. */
  groups: PresetQueryGroup[];
}

/** 'all' shows both; 'shiny'/'non-shiny' show only that half — lets shiny
 * and non-shiny be tracked as fully separate lists within each pokedex
 * (regular/mega/max), rather than shiny being a show/hide layered on top. */
export type ShinyFilter = 'all' | 'shiny' | 'non-shiny';

/** All 9 named Pokemon GO regions searchable in-game (`kanto`, `johto`, ...,
 * `paldea`) — matches the real search bar's "region" keyword exactly: per
 * the game's own docs, typing a region name returns every Pokemon whose
 * ORIGIN generation is that region, OR whose alternate FORM is that region
 * ("Regional forms can be found by either typing their original form's or
 * regional form's region."). This catalog's data source folds Hisui-origin
 * species (Wyrdeer, Sneasler, ...) into generation 9/Paldea rather than a
 * distinct generation, so there is no separate "Hisui origin" bucket to
 * offer — Hisui only ever appears here as an alternate-form region, exactly
 * like in-game. */
export type UnifiedRegion =
  | 'kanto'
  | 'johto'
  | 'hoenn'
  | 'sinnoh'
  | 'unova'
  | 'kalos'
  | 'alola'
  | 'galar'
  | 'hisui'
  | 'paldea';

/** 'all' shows every region; a specific `UnifiedRegion` shows any entry
 * whose ORIGIN generation maps to that region OR whose alternate FORM
 * (`CatalogEntry.region`) is that region — exactly matching how typing a
 * region name into the real in-game search bar behaves. Independent of the
 * `showRegional` toggle, which is a simpler show/hide-all-regional-forms
 * switch — picking a specific region here implies regional forms are being
 * shown regardless. */
export type RegionFilter = 'all' | UnifiedRegion;

/**
 * The full set of user-configurable view/filter state, persisted server-side
 * (see `server/src/db.ts`'s `user_settings` table) rather than in browser
 * localStorage — a prior localStorage clear wiped a user's excluded
 * patterns/tags/presets, while catch progress (already server-side) survived
 * intact, prompting this move. Lives in `shared` (not app-only) because both
 * the Angular app and the server's `GET`/`PUT /api/settings` route handlers
 * need this exact shape.
 */
export interface UserSettings {
  pokedexType: PokedexType;
  shinyFilter: ShinyFilter;
  regionFilter: RegionFilter;
  showRegional: boolean;
  showAlternate: boolean;
  showGender: boolean;
  /** When true, entries already marked caught are hidden from the list. */
  showUncaughtOnly: boolean;
  /** Case-insensitive regex patterns; any entry whose name matches one is hidden. */
  excludedNamePatterns: string[];
  /** National dex numbers to hide entirely — e.g. species pokemon-go-api
   * lists but Niantic hasn't actually released in-game yet. */
  excludedDexNumbers: number[];
  /** National dex numbers whose shiny entries are hidden — e.g. a species is
   * released but its shiny form isn't out yet. */
  excludedShinyDexNumbers: number[];
  /** Case-insensitive regex patterns; only the SHINY entry of any matching
   * form is hidden (non-shiny stays visible) — e.g. a specific costume's
   * shiny variant hasn't been released, unlike the rest of that species. */
  excludedShinyNamePatterns: string[];
  /** Custom tags the user has assigned to Pokemon in-game — kept here as a
   * reference list (not tied to any catalog entry) so search strings can be
   * built for them the same way nicknames are searched in-game. */
  userTags: string[];
  /** User-defined, reusable named search-query presets (Preset Queries). */
  presetQueries: PresetQuery[];
  /** Custom search-string exclusions (Search Strings page), scoped
   * independently per pokedex type — e.g. the Regular dex's list is edited
   * separately from the XXL dex's. Every `PokedexType` always has an entry
   * (possibly empty), never a partial map, so callers can index it by the
   * current pokedex type without a fallback. */
  excludedSearchTermsByPokedex: Record<PokedexType, ExcludedSearchTerm[]>;
  /** Server-authoritative mirror of the calendar filter state (see
   * CalendarFilterService) — lives here (rather than device-local storage)
   * so the server-side notification scheduler can filter events out
   * before sending a push, since a push can't be recalled once delivered. */
  hiddenEventIds: string[];
  /** Event types excluded from the calendar/timeline view and from
   * notifications. */
  disabledEventTypes: string[];
  /** Master on/off switch for calendar-event push notifications. */
  notificationsEnabled: boolean;
  /** Minutes before a timed event's actual start to fire its notification
   * (0 is valid — notify exactly at start). Applies only to events whose
   * start clock time is not exactly local midnight. */
  notificationTimedEventOffsetMinutes: number;
  /** Local time-of-day ("HH:mm", 24h) at which all-day events' notifications
   * fire on the event's start day. Applies only to events whose start clock
   * time is exactly local midnight. */
  notificationAllDayEventTime: string;
}

/** Also used server-side (see `server/src/db.ts`'s `initSchema()`) to seed
 * the single `user_settings` row on first run — kept in one place so the
 * client's pre-load placeholder and the server's actual default row can
 * never drift apart. */
export const DEFAULT_SETTINGS: UserSettings = {
  pokedexType: 'regular',
  shinyFilter: 'all',
  regionFilter: 'all',
  showRegional: true,
  showAlternate: true,
  showGender: true,
  showUncaughtOnly: false,
  excludedNamePatterns: ['\\(Copy \\d{4}\\)'],
  excludedDexNumbers: [],
  excludedShinyDexNumbers: [],
  excludedShinyNamePatterns: [],
  userTags: [],
  presetQueries: [],
  excludedSearchTermsByPokedex: Object.fromEntries(
    POKEDEX_TYPES.map((pokedexType) => [pokedexType, defaultExcludedSearchTermsFor(pokedexType)])
  ) as Record<PokedexType, ExcludedSearchTerm[]>,
  hiddenEventIds: [],
  disabledEventTypes: ['go-pass', 'season'],
  notificationsEnabled: false,
  notificationTimedEventOffsetMinutes: 15,
  notificationAllDayEventTime: '09:00',
};

/** Seeded default exclusions for one pokedex type — mirrors the old global
 * `implicitlyExcludedSearchTerms` config this feature replaces (Trade, 2x
 * Transfer, shadow, applied everywhere; xxl/xxs size applied everywhere
 * except each size's own matching dex, since excluding `xxl` while
 * generating the XXL dex's own search string would exclude every result). */
function defaultExcludedSearchTermsFor(pokedexType: PokedexType): ExcludedSearchTerm[] {
  const terms: ExcludedSearchTerm[] = [
    { kind: 'tag', value: 'Trade' },
    { kind: 'tag', value: '2x Transfer' },
    { kind: 'keyword', value: 'shadow' },
  ];

  if (pokedexType !== 'xxl') {
    terms.push({ kind: 'size', value: 'xxl' });
  }

  if (pokedexType !== 'xxs') {
    terms.push({ kind: 'size', value: 'xxs' });
  }

  return terms;
}
