import { CatalogEntry } from '@go-gather/shared';
import { flattenGenerations, trackGatherRow } from './gather-row.model';
import { Generation } from '../core/services/filter.service';

function makeEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: 'bulbasaur-regular',
    dexNr: 1,
    generation: 1,
    speciesId: 'bulbasaur',
    formId: 'bulbasaur-normal',
    name: 'Bulbasaur',
    speciesName: 'Bulbasaur',
    imgUrl: '/images/bulbasaur.png',
    isShiny: false,
    isFemale: false,
    form: null,
    costume: null,
    region: null,
    primaryType: 'grass',
    secondaryType: 'poison',
    pokemonClass: null,
    isBaseForm: true,
    pokedexType: 'regular',
    order: 1,
    ...overrides,
  };
}

describe('flattenGenerations', () => {
  it('returns no rows for an empty generation list', () => {
    expect(flattenGenerations([])).toEqual({ rows: [], generationHeaderIndexByRow: [] });
  });

  it('emits a generation-header row followed by one entry row per species entry, in order', () => {
    const generations: Generation[] = [
      {
        generationName: 'Generation 1',
        speciesList: [
          {
            dexNr: 1,
            speciesId: 'bulbasaur',
            speciesName: 'Bulbasaur',
            entries: [
              makeEntry({ id: 'bulbasaur-regular' }),
              makeEntry({ id: 'bulbasaur-shiny', isShiny: true }),
            ],
          },
          {
            dexNr: 4,
            speciesId: 'charmander',
            speciesName: 'Charmander',
            entries: [makeEntry({ id: 'charmander-regular', dexNr: 4, speciesId: 'charmander' })],
          },
        ],
      },
    ];

    const { rows } = flattenGenerations(generations);

    expect(rows.map((row) => row.kind)).toEqual(['generation-header', 'entry', 'entry', 'entry']);
    expect(rows.map((row) => row.key)).toEqual([
      'generation-header:Generation 1',
      'bulbasaur-regular',
      'bulbasaur-shiny',
      'charmander-regular',
    ]);
  });

  it('tags the first and last entry of each species group', () => {
    const generations: Generation[] = [
      {
        generationName: 'Generation 1',
        speciesList: [
          {
            dexNr: 1,
            speciesId: 'bulbasaur',
            speciesName: 'Bulbasaur',
            entries: [
              makeEntry({ id: 'bulbasaur-regular' }),
              makeEntry({ id: 'bulbasaur-shiny', isShiny: true }),
              makeEntry({ id: 'bulbasaur-costume' }),
            ],
          },
        ],
      },
    ];

    const { rows } = flattenGenerations(generations);
    const entryRows = rows.filter((row) => row.kind === 'entry');

    expect(entryRows.map((row) => [row.isFirstInSpecies, row.isLastInSpecies])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  it('marks a species with a single entry as both first and last', () => {
    const generations: Generation[] = [
      {
        generationName: 'Generation 1',
        speciesList: [
          {
            dexNr: 1,
            speciesId: 'bulbasaur',
            speciesName: 'Bulbasaur',
            entries: [makeEntry()],
          },
        ],
      },
    ];

    const { rows } = flattenGenerations(generations);
    const entryRow = rows.find((row) => row.kind === 'entry');

    expect(entryRow?.isFirstInSpecies).toBe(true);
    expect(entryRow?.isLastInSpecies).toBe(true);
  });

  it('points every row at the index of the generation-header row above it', () => {
    const generations: Generation[] = [
      {
        generationName: 'Generation 1',
        speciesList: [
          {
            dexNr: 1,
            speciesId: 'bulbasaur',
            speciesName: 'Bulbasaur',
            entries: [makeEntry()],
          },
        ],
      },
      {
        generationName: 'Generation 2',
        speciesList: [
          {
            dexNr: 152,
            speciesId: 'chikorita',
            speciesName: 'Chikorita',
            entries: [makeEntry({ id: 'chikorita-regular', dexNr: 152, generation: 2 })],
          },
        ],
      },
    ];

    const { rows, generationHeaderIndexByRow } = flattenGenerations(generations);

    expect(generationHeaderIndexByRow).toHaveLength(rows.length);
    expect(generationHeaderIndexByRow).toEqual([0, 0, 2, 2]);
    expect(rows[generationHeaderIndexByRow[3]].kind).toBe('generation-header');
  });
});

describe('trackGatherRow', () => {
  it('returns the row key', () => {
    expect(
      trackGatherRow(0, {
        kind: 'entry',
        key: 'bulbasaur-regular',
        entry: makeEntry(),
        speciesGroup: {
          dexNr: 1,
          speciesId: 'bulbasaur',
          speciesName: 'Bulbasaur',
          entries: [makeEntry()],
        },
        isFirstInSpecies: true,
        isLastInSpecies: true,
      })
    ).toBe('bulbasaur-regular');
  });
});
