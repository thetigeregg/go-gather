import { SearchTermData } from '@go-gather/shared';
import { Gender, PokemonType, Region, RaidOrigin, SimpleKeyword, Size } from './search-query.model';

/** Describes what kind of value input a term kind needs, so the preset
 * editor can render a generic kind-driven form instead of hardcoding a
 * widget per SearchTerm variant. */
export type TermInputKind =
  | 'none'
  | 'freeText'
  | 'tagPicker'
  | 'enum'
  | 'keywordEnum'
  | 'numericRange'
  | 'statRating'
  | 'smallEnumNumber';

export interface TermCatalogEntry {
  kind: SearchTermData['kind'];
  label: string;
  /** Groups entries under a header in the picker UI, e.g. "Tags", "Keywords". */
  category: string;
  inputKind: TermInputKind;
  /** Fixed choice list for 'enum'/'keywordEnum' inputKinds. */
  enumOptions?: string[];
  /** Fixed choice list of field names for 'numericRange'/'statRating'. */
  fieldOptions?: string[];
  /** Inclusive min/max for 'smallEnumNumber' (appraisalStars/buddyLevel/megaLevel). */
  smallEnumRange?: { min: number; max: number };
}

const SIMPLE_KEYWORDS: SimpleKeyword[] = [
  'costume',
  'defender',
  'eggsonly',
  'evolve',
  'evolvenew',
  'evolvequest',
  'fusion',
  'megaevolve',
  'gigantamax',
  'dynamax',
  'hatched',
  'item',
  'legendary',
  'lucky',
  'mythical',
  'ultra beasts',
  'shiny',
  'traded',
  'shadow',
  'purified',
  'tradeevolve',
  'favorite',
  'gbl',
  'snapshot',
  'research',
  'rocket',
  'candyxl',
  'locationbackground',
  'specialbackground',
  'background',
  'adventureeffect',
];

const REGIONS: Region[] = [
  'kanto',
  'johto',
  'hoenn',
  'sinnoh',
  'unova',
  'kalos',
  'alola',
  'galar',
  'hisui',
  'paldea',
];

const GENDERS: Gender[] = ['male', 'female', 'genderunknown'];

const SIZES: Size[] = ['xxs', 'xs', 'xl', 'xxl'];

const RAID_ORIGINS: RaidOrigin[] = ['raid', 'remoteraid', 'megaraid', 'exraid', 'primalraid'];

/** Shared across the `type`, `moveType`, `weakAgainst`, and
 * `superEffectiveAgainst` term kinds, all of which take a Pokemon type name
 * as their value — one canonical list rather than four separate ones. */
const POKEMON_TYPES: PokemonType[] = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
];

/** One entry per `SearchTerm`/`SearchTermData` kind — the single source of
 * truth the preset editor reads to render its "add rule" picker, grouped by
 * `category`, with a kind-specific value sub-form driven by `inputKind`. */
export const TERM_CATALOG: TermCatalogEntry[] = [
  { kind: 'name', label: 'Species Name', category: 'Basic', inputKind: 'freeText' },
  { kind: 'family', label: 'Species Family (+name)', category: 'Basic', inputKind: 'freeText' },
  { kind: 'nickname', label: 'Nickname', category: 'Basic', inputKind: 'freeText' },
  { kind: 'tag', label: 'User Tag', category: 'Tags', inputKind: 'tagPicker' },
  { kind: 'hasTag', label: 'Has Any Tag', category: 'Tags', inputKind: 'none' },
  { kind: 'region', label: 'Region', category: 'Regions', inputKind: 'enum', enumOptions: REGIONS },
  {
    kind: 'keyword',
    label: 'Keyword',
    category: 'Keywords',
    inputKind: 'keywordEnum',
    enumOptions: SIMPLE_KEYWORDS,
  },
  {
    kind: 'type',
    label: 'Pokemon Type',
    category: 'Basic',
    inputKind: 'enum',
    enumOptions: POKEMON_TYPES,
  },
  { kind: 'gender', label: 'Gender', category: 'Basic', inputKind: 'enum', enumOptions: GENDERS },
  { kind: 'size', label: 'Size', category: 'Numeric', inputKind: 'enum', enumOptions: SIZES },
  {
    kind: 'raidOrigin',
    label: 'Raid Origin',
    category: 'Keywords',
    inputKind: 'enum',
    enumOptions: RAID_ORIGINS,
  },
  { kind: 'move', label: 'Move (@move)', category: 'Moves', inputKind: 'freeText' },
  {
    kind: 'moveType',
    label: 'Move Type (@type)',
    category: 'Moves',
    inputKind: 'enum',
    enumOptions: POKEMON_TYPES,
  },
  {
    kind: 'fastMoveType',
    label: 'Fast Move Type (@1type)',
    category: 'Moves',
    inputKind: 'freeText',
  },
  {
    kind: 'chargedMoveType',
    label: 'Charged Move Type (@2type)',
    category: 'Moves',
    inputKind: 'freeText',
  },
  {
    kind: 'secondChargedMoveType',
    label: 'Second Charged Move Type (@3type)',
    category: 'Moves',
    inputKind: 'freeText',
  },
  { kind: 'weather', label: 'Weather Boosted (@weather)', category: 'Moves', inputKind: 'none' },
  { kind: 'special', label: 'Special Move (@special)', category: 'Moves', inputKind: 'none' },
  {
    kind: 'weakAgainst',
    label: 'Weak Against Type (<type)',
    category: 'Moves',
    inputKind: 'enum',
    enumOptions: POKEMON_TYPES,
  },
  {
    kind: 'superEffectiveAgainst',
    label: 'Super Effective Against Type (>type)',
    category: 'Moves',
    inputKind: 'enum',
    enumOptions: POKEMON_TYPES,
  },
  {
    kind: 'numeric',
    label: 'Numeric (CP/HP/Age/Dex/Distance/Year/CandyKM/MaxMove/MaxGuard/MaxSpirit)',
    category: 'Numeric',
    inputKind: 'numericRange',
    fieldOptions: [
      'cp',
      'hp',
      'age',
      'dex',
      'distance',
      'year',
      'candykm',
      'maxmove',
      'maxguard',
      'maxspirit',
    ],
  },
  {
    kind: 'statRating',
    label: 'Stat Appraisal Rating (0-4)',
    category: 'Numeric',
    inputKind: 'statRating',
    fieldOptions: ['hp', 'attack', 'defense'],
  },
  {
    kind: 'appraisalStars',
    label: 'Appraisal Stars (1-4*)',
    category: 'Numeric',
    inputKind: 'smallEnumNumber',
    smallEnumRange: { min: 1, max: 4 },
  },
  {
    kind: 'buddyLevel',
    label: 'Buddy Level (0-5)',
    category: 'Numeric',
    inputKind: 'smallEnumNumber',
    smallEnumRange: { min: 0, max: 5 },
  },
  {
    kind: 'megaLevel',
    label: 'Mega Level (0-4)',
    category: 'Numeric',
    inputKind: 'smallEnumNumber',
    smallEnumRange: { min: 0, max: 4 },
  },
  { kind: 'raw', label: 'Raw Search Text', category: 'Basic', inputKind: 'freeText' },
];

export function getTermCatalogEntry(kind: SearchTermData['kind']): TermCatalogEntry {
  const entry = TERM_CATALOG.find((candidate) => candidate.kind === kind);

  if (!entry) {
    throw new Error(`No TERM_CATALOG entry for kind "${kind}"`);
  }

  return entry;
}
