/**
 * A typed model of everything the Pokemon GO in-game search bar understands,
 * per https://pokemongohub.net/post/guide/pokemon-go-search-bar-cheat-sheet/ —
 * built as a reusable engine (terms + combinators + a serializer) rather than
 * ad-hoc string concatenation, so future features (e.g. custom tags) can
 * compose search strings the same way SearchStringService does.
 */

/** Built-in keywords that take no argument and return a fixed category. */
export type SimpleKeyword =
  | 'costume'
  | 'defender'
  | 'eggsonly'
  | 'evolve'
  | 'evolvenew'
  | 'evolvequest'
  | 'fusion'
  | 'megaevolve'
  | 'gigantamax'
  | 'dynamax'
  | 'hatched'
  | 'item'
  | 'legendary'
  | 'lucky'
  | 'mythical'
  | 'ultra beasts'
  | 'shiny'
  | 'traded'
  | 'shadow'
  | 'purified'
  | 'tradeevolve'
  | 'favorite'
  | 'gbl'
  | 'snapshot'
  | 'research'
  | 'rocket'
  | 'candyxl'
  | 'locationbackground'
  | 'specialbackground'
  | 'background'
  | 'adventureeffect';

/** The cheat sheet only documents the original 7 regional keywords, but
 * Hisui/Paldea work as the same kind of region keyword in-game (just added
 * after that doc was written), so they're included here to match what
 * `@go-gather/shared`'s `Region` enum (used elsewhere in the app for actual
 * regional-form data) already models. */
export type Region =
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

/** The 18 standard Pokemon types, lowercase, as typed into the search bar
 * (e.g. `dark`, `fire`) — used for the `type` term itself and for the
 * move-type/weakness/super-effective terms, all of which take a type name
 * as their value. */
export type PokemonType =
  | 'normal'
  | 'fire'
  | 'water'
  | 'electric'
  | 'grass'
  | 'ice'
  | 'fighting'
  | 'poison'
  | 'ground'
  | 'flying'
  | 'psychic'
  | 'bug'
  | 'rock'
  | 'ghost'
  | 'dragon'
  | 'dark'
  | 'steel'
  | 'fairy';

export type Gender = 'male' | 'female' | 'genderunknown';

export type Size = 'xxs' | 'xs' | 'xl' | 'xxl';

export type RaidOrigin = 'raid' | 'remoteraid' | 'megaraid' | 'exraid' | 'primalraid';

/** A bare number (exact match) or a `min-max`/`min-`/`-max` range, matching
 * the doc's range syntax (e.g. `cp10-50`, `cp-1500`, `10-`). */
export type NumericValue = number | { min?: number; max?: number };

export type NumericField =
  | 'cp'
  | 'hp'
  | 'age'
  | 'dex'
  | 'distance'
  | 'year'
  | 'candykm'
  | 'maxmove'
  | 'maxguard'
  | 'maxspirit';

export type StatRatingField = 'hp' | 'attack' | 'defense';

/** 0-4 star appraisal rating for a specific stat, e.g. `4hp`. */
export type StatRating = 0 | 1 | 2 | 3 | 4;

/** Overall appraisal star rating, e.g. `4*` for a hundo. */
export type AppraisalStars = 1 | 2 | 3 | 4;

export type BuddyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type MegaLevel = 0 | 1 | 2 | 3 | 4;

/** A single atomic search condition. Each variant maps to one line item from
 * the cheat sheet; `serialize` renders it to the exact string syntax. */
export type SearchTerm =
  | { kind: 'name'; value: string }
  | { kind: 'family'; value: string }
  | { kind: 'nickname'; value: string }
  /** A user-defined tag (Settings > User Tags), searched via the game's `#`
   * tag-search prefix followed by the tag name unquoted, e.g. `#Trade`. */
  | { kind: 'tag'; value: string }
  /** Matches any Pokemon that has at least one user tag set — the DataJar
   * preset system's "HasTag" wildcard, which compiles to the bare `#`
   * symbol (no tag name). */
  | { kind: 'hasTag' }
  | { kind: 'region'; value: Region }
  | { kind: 'keyword'; value: SimpleKeyword }
  | { kind: 'type'; value: string }
  | { kind: 'gender'; value: Gender }
  | { kind: 'size'; value: Size }
  | { kind: 'raidOrigin'; value: RaidOrigin }
  | { kind: 'move'; value: string }
  | { kind: 'moveType'; value: string }
  | { kind: 'fastMoveType'; value: string }
  | { kind: 'chargedMoveType'; value: string }
  | { kind: 'secondChargedMoveType'; value: string }
  | { kind: 'weather' }
  | { kind: 'special' }
  | { kind: 'weakAgainst'; value: string }
  | { kind: 'superEffectiveAgainst'; value: string }
  | { kind: 'numeric'; field: NumericField; value: NumericValue }
  | { kind: 'statRating'; field: StatRatingField; value: StatRating }
  | { kind: 'appraisalStars'; value: AppraisalStars }
  | { kind: 'buddyLevel'; value: BuddyLevel }
  | { kind: 'megaLevel'; value: MegaLevel }
  | { kind: 'raw'; value: string };

/** AND (`&`), OR (`,`), and NOT (`!`) compose terms into a tree, mirroring
 * how the search bar's own logical operators nest. */
export type QueryNode =
  | { kind: 'term'; term: SearchTerm }
  | { kind: 'not'; node: QueryNode }
  | { kind: 'and'; nodes: QueryNode[] }
  | { kind: 'or'; nodes: QueryNode[] };

export function term(term: SearchTerm): QueryNode {
  return { kind: 'term', term };
}

export function not(node: QueryNode): QueryNode {
  return { kind: 'not', node };
}

export function and(...nodes: QueryNode[]): QueryNode {
  return { kind: 'and', nodes };
}

export function or(...nodes: QueryNode[]): QueryNode {
  return { kind: 'or', nodes };
}
