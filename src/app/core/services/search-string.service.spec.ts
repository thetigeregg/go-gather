import { TestBed } from '@angular/core/testing';
import { CatalogEntry, DEFAULT_SETTINGS, UserSettings } from '@go-gather/shared';
import { PokeDataService } from './poke-data.service';
import { SearchConfigService } from './search-config.service';
import { SearchStringService } from './search-string.service';
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

describe('SearchStringService', () => {
  let catalog: CatalogEntry[];
  let entryStates: Map<string, boolean>;
  let settings: UserSettings;
  let implicitlyExcludedSearchTerms: { kind: string; value: string; enabled: boolean }[];
  let service: SearchStringService;

  beforeEach(() => {
    catalog = [];
    entryStates = new Map();
    settings = { ...DEFAULT_SETTINGS };
    implicitlyExcludedSearchTerms = [];

    TestBed.configureTestingModule({
      providers: [
        SearchStringService,
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
          useValue: {
            getAllEntryStates: () => new Map(entryStates),
            getUserSettings: () => settings,
          },
        },
        {
          provide: SearchConfigService,
          useValue: {
            get implicitlyExcludedSearchTerms() {
              return implicitlyExcludedSearchTerms;
            },
          },
        },
      ],
    });

    service = TestBed.inject(SearchStringService);
  });

  it('returns null when there are no missing entries', () => {
    service.init();
    expect(service.getDefaultSearchString()).toBeNull();
  });

  it('builds a default (non-shiny) search string for missing entries of the current pokedexType', () => {
    catalog = [
      makeEntry(),
      makeEntry({ id: 'ivysaur', speciesName: 'Ivysaur', speciesId: 'ivysaur' }),
    ];
    service.init();

    expect(service.getDefaultSearchString()).toBe('!shiny&+bulbasaur,+ivysaur&!#Living Dex');
  });

  it('excludes already-caught entries from the default search string', () => {
    catalog = [
      makeEntry(),
      makeEntry({ id: 'ivysaur', speciesName: 'Ivysaur', speciesId: 'ivysaur' }),
    ];
    entryStates.set('ivysaur', true);
    service.init();

    expect(service.getDefaultSearchString()).toBe('!shiny&+bulbasaur&!#Living Dex');
  });

  it('getShinySearchString swaps the shiny filter and excludes tag [Shiny] instead of Living Dex', () => {
    catalog = [makeEntry({ isShiny: true })];
    service.init();

    expect(service.getShinySearchString()).toBe('shiny&+bulbasaur&!#[Shiny]');
  });

  it('uses the pokedex-type keyword and atomic tag for non-regular pokedex types', () => {
    catalog = [makeEntry({ pokedexType: 'max' })];
    settings = { ...settings, pokedexType: 'max' };
    service.init();

    expect(service.getDefaultSearchString()).toBe('!shiny&+bulbasaur&gigantamax&!#GMax');
  });

  it('getDefaultMaleSearchString / getDefaultFemaleSearchString filter by isFemale', () => {
    catalog = [
      makeEntry({ id: 'male', isFemale: false }),
      makeEntry({ id: 'female', isFemale: true }),
    ];
    service.init();

    expect(service.getDefaultMaleSearchString()).toBe('!shiny&+bulbasaur&male&!#Living Dex');
    expect(service.getDefaultFemaleSearchString()).toBe('!shiny&+bulbasaur&female&!#Living Dex');
  });

  it('getAltRegionSearchStrings only includes regions with at least one missing entry', () => {
    catalog = [makeEntry({ id: 'alolan', region: 'alola', speciesName: 'Bulbasaur' })];
    service.init();

    const regionStrings = service.getAltRegionSearchStrings();
    expect(regionStrings.has('alola')).toBe(true);
    expect(regionStrings.has('galar')).toBe(false);
  });

  it('applies enabled implicit exclusion terms from SearchConfigService', () => {
    catalog = [makeEntry()];
    implicitlyExcludedSearchTerms = [
      { kind: 'keyword', value: 'shadow', enabled: true },
      { kind: 'keyword', value: 'lucky', enabled: false },
    ];
    service.init();

    expect(service.getDefaultSearchString()).toBe('!shiny&+bulbasaur&!#Living Dex&!shadow');
  });

  it('silently ignores an invalid excluded-name regex pattern', () => {
    catalog = [makeEntry()];
    settings = { ...settings, excludedNamePatterns: ['(unclosed'] };

    expect(() => {
      service.init();
    }).not.toThrow();
    expect(service.getDefaultSearchString()).toBe('!shiny&+bulbasaur&!#Living Dex');
  });
});
