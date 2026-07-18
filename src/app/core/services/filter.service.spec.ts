import { TestBed } from '@angular/core/testing';
import { CatalogEntry, DEFAULT_SETTINGS, UserSettings } from '@go-gather/shared';
import { FilterService } from './filter.service';
import { PokeDataService } from './poke-data.service';
import { SearchConfigService } from './search-config.service';
import { UserDataService } from './user-data.service';

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

function makeSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('FilterService', () => {
  let catalog: CatalogEntry[];
  let caughtIds: Set<string>;
  let costumeGenderEnabled: boolean;
  let service: FilterService;

  beforeEach(() => {
    catalog = [];
    caughtIds = new Set();
    costumeGenderEnabled = true;

    TestBed.configureTestingModule({
      providers: [
        FilterService,
        {
          provide: PokeDataService,
          useValue: {
            get catalog() {
              return catalog;
            },
          },
        },
        {
          provide: UserDataService,
          useValue: { getItemState: (id: string) => caughtIds.has(id) },
        },
        {
          provide: SearchConfigService,
          useValue: {
            get costumeGenderEnabled() {
              return costumeGenderEnabled;
            },
          },
        },
      ],
    });

    service = TestBed.inject(FilterService);
  });

  it('filters entries to the selected pokedexType', () => {
    catalog = [
      makeEntry({ pokedexType: 'regular' }),
      makeEntry({ id: 'mega', pokedexType: 'mega' }),
    ];

    const [generation] = service.groupPokemonByGeneration(makeSettings({ pokedexType: 'regular' }));

    expect(generation.speciesList.flatMap((g) => g.entries)).toHaveLength(1);
  });

  it('drops entries whose dex number is excluded', () => {
    catalog = [makeEntry({ dexNr: 1 }), makeEntry({ id: 'other', dexNr: 2, speciesId: 'other' })];

    const generations = service.groupPokemonByGeneration(makeSettings({ excludedDexNumbers: [1] }));

    const ids = generations.flatMap((g) =>
      g.speciesList.flatMap((s) => s.entries.map((e) => e.id))
    );
    expect(ids).toEqual(['other']);
  });

  it('only excludes the shiny entry for excludedShinyDexNumbers, not the non-shiny one', () => {
    catalog = [
      makeEntry({ id: 'a-normal', isShiny: false }),
      makeEntry({ id: 'a-shiny', isShiny: true }),
    ];

    const generations = service.groupPokemonByGeneration(
      makeSettings({ excludedShinyDexNumbers: [1] })
    );

    const ids = generations.flatMap((g) =>
      g.speciesList.flatMap((s) => s.entries.map((e) => e.id))
    );
    expect(ids).toEqual(['a-normal']);
  });

  it('drops entries matching an excluded name pattern (case-insensitive)', () => {
    catalog = [
      makeEntry({ name: 'Bulbasaur (Copy 2024)' }),
      makeEntry({ id: 'other', name: 'Ivysaur', speciesId: 'ivysaur' }),
    ];

    const generations = service.groupPokemonByGeneration(
      makeSettings({ excludedNamePatterns: ['\\(copy \\d{4}\\)'] })
    );

    const ids = generations.flatMap((g) =>
      g.speciesList.flatMap((s) => s.entries.map((e) => e.id))
    );
    expect(ids).toEqual(['other']);
  });

  it('silently ignores an invalid regex pattern instead of throwing or blanking the catalog', () => {
    catalog = [makeEntry()];

    expect(() =>
      service.groupPokemonByGeneration(makeSettings({ excludedNamePatterns: ['(unclosed'] }))
    ).not.toThrow();

    const generations = service.groupPokemonByGeneration(
      makeSettings({ excludedNamePatterns: ['(unclosed'] })
    );
    expect(generations.flatMap((g) => g.speciesList)).toHaveLength(1);
  });

  it('shinyFilter "shiny" hides non-shiny entries and vice versa', () => {
    catalog = [
      makeEntry({ id: 'normal', isShiny: false }),
      makeEntry({ id: 'shiny', isShiny: true }),
    ];

    const shinyOnly = service.groupPokemonByGeneration(makeSettings({ shinyFilter: 'shiny' }));
    expect(
      shinyOnly.flatMap((g) => g.speciesList.flatMap((s) => s.entries.map((e) => e.id)))
    ).toEqual(['shiny']);

    const nonShinyOnly = service.groupPokemonByGeneration(
      makeSettings({ shinyFilter: 'non-shiny' })
    );
    expect(
      nonShinyOnly.flatMap((g) => g.speciesList.flatMap((s) => s.entries.map((e) => e.id)))
    ).toEqual(['normal']);
  });

  it('showRegional=false hides regional-form entries only when the species also has a plain entry', () => {
    catalog = [
      makeEntry({ id: 'plain', region: null }),
      makeEntry({ id: 'alolan', region: 'alola', form: 'alolan' }),
    ];

    const generations = service.groupPokemonByGeneration(makeSettings({ showRegional: false }));
    const ids = generations.flatMap((g) =>
      g.speciesList.flatMap((s) => s.entries.map((e) => e.id))
    );
    expect(ids).toEqual(['plain']);
  });

  it('showRegional=false does NOT hide a regional entry when it is the only entry for the species', () => {
    catalog = [makeEntry({ id: 'alolan-only', region: 'alola', form: 'alolan' })];

    const generations = service.groupPokemonByGeneration(makeSettings({ showRegional: false }));
    const ids = generations.flatMap((g) =>
      g.speciesList.flatMap((s) => s.entries.map((e) => e.id))
    );
    expect(ids).toEqual(['alolan-only']);
  });

  it('regionFilter matches either origin generation or alternate-form region', () => {
    catalog = [
      makeEntry({ id: 'kanto-origin', generation: 1, region: null }),
      makeEntry({
        id: 'alolan-form',
        generation: 3,
        region: 'alola',
        form: 'alolan',
        speciesId: 'alolan-species',
      }),
      makeEntry({ id: 'unrelated', generation: 3, region: null, speciesId: 'other' }),
    ];

    const generations = service.groupPokemonByGeneration(makeSettings({ regionFilter: 'alola' }));
    const ids = generations
      .flatMap((g) => g.speciesList.flatMap((s) => s.entries.map((e) => e.id)))
      .sort();
    expect(ids).toEqual(['alolan-form']);

    const kantoGenerations = service.groupPokemonByGeneration(
      makeSettings({ regionFilter: 'kanto' })
    );
    const kantoIds = kantoGenerations.flatMap((g) =>
      g.speciesList.flatMap((s) => s.entries.map((e) => e.id))
    );
    expect(kantoIds).toEqual(['kanto-origin']);
  });

  it('costume entries respect costumeGenderEnabled independent of the global showGender toggle', () => {
    catalog = [
      makeEntry({
        id: 'costume-female',
        pokedexType: 'costume',
        isFemale: true,
        speciesId: 'costume-species',
      }),
    ];
    costumeGenderEnabled = false;

    const generations = service.groupPokemonByGeneration(
      makeSettings({ pokedexType: 'costume', showGender: true })
    );

    expect(generations.flatMap((g) => g.speciesList)).toHaveLength(0);
  });

  it('showUncaughtOnly hides entries already marked caught', () => {
    catalog = [
      makeEntry({ id: 'caught' }),
      makeEntry({ id: 'uncaught', speciesId: 'other', dexNr: 2 }),
    ];
    caughtIds.add('caught');

    const generations = service.groupPokemonByGeneration(makeSettings({ showUncaughtOnly: true }));
    const ids = generations.flatMap((g) =>
      g.speciesList.flatMap((s) => s.entries.map((e) => e.id))
    );
    expect(ids).toEqual(['uncaught']);
  });

  it('groups species by generation, sorted by generation number and dex number', () => {
    catalog = [
      makeEntry({ id: 'gen3', generation: 3, dexNr: 3, speciesId: 'gen3-species' }),
      makeEntry({ id: 'gen1-high', generation: 1, dexNr: 2, speciesId: 'gen1-high-species' }),
      makeEntry({ id: 'gen1-low', generation: 1, dexNr: 1, speciesId: 'gen1-low-species' }),
    ];

    const generations = service.groupPokemonByGeneration(makeSettings());

    expect(generations.map((g) => g.generationName)).toEqual(['Generation 1', 'Generation 3']);
    expect(generations[0].speciesList.map((s) => s.dexNr)).toEqual([1, 2]);
  });
});
