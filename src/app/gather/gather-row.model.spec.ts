import { CatalogEntry } from '@go-gather/shared';
import { flattenGenerations, trackGatherRow } from './gather-row.model';
import { GATHER_ROW_GENERATION_HEADER_PX, speciesCardHeightPx } from './gather-row-sizing';
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
    expect(flattenGenerations([])).toEqual({
      rows: [],
      rowSizes: [],
      generationHeaderIndexByRow: [],
    });
  });

  it('emits a generation-header row followed by one species-card row per species, in order', () => {
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

    expect(rows.map((row) => row.kind)).toEqual([
      'generation-header',
      'species-card',
      'species-card',
    ]);
    expect(rows.map((row) => row.key)).toEqual([
      'generation-header:Generation 1',
      'bulbasaur',
      'charmander',
    ]);
  });

  it('sizes each row from precomputed constants based on generation/species shape', () => {
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
        ],
      },
    ];

    const { rowSizes } = flattenGenerations(generations);

    expect(rowSizes).toEqual([GATHER_ROW_GENERATION_HEADER_PX, speciesCardHeightPx(2)]);
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
        kind: 'species-card',
        key: 'bulbasaur',
        speciesGroup: {
          dexNr: 1,
          speciesId: 'bulbasaur',
          speciesName: 'Bulbasaur',
          entries: [makeEntry()],
        },
      })
    ).toBe('bulbasaur');
  });
});
