import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CatalogEntry, DEFAULT_SETTINGS, UserSettings } from '@go-gather/shared';
import { GatherPokemonComponent } from './gather-pokemon.component';
import { SpeciesGroup } from '../../core/services/filter.service';
import { UserDataService } from '../../core/services/user-data.service';
import { GatherEntryComponent } from '../gather-entry/gather-entry.component';

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

describe('GatherPokemonComponent', () => {
  let fixture: ComponentFixture<GatherPokemonComponent>;
  let component: GatherPokemonComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: UserDataService,
          useValue: { getItemState: () => false },
        },
      ],
    });
    TestBed.overrideComponent(GatherPokemonComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(GatherEntryComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(GatherPokemonComponent);
    component = fixture.componentInstance;
    component.userSettings = { ...DEFAULT_SETTINGS } satisfies UserSettings;
  });

  it('chunks entries into rows of 5', () => {
    const speciesGroup: SpeciesGroup = {
      dexNr: 1,
      speciesId: 'bulbasaur',
      speciesName: 'Bulbasaur',
      entries: Array.from({ length: 12 }, (_, i) => makeEntry({ id: `entry-${String(i)}` })),
    };

    component.speciesGroup = speciesGroup;

    expect(component.entryRows).toHaveLength(3);
    expect(component.entryRows[0].entries).toHaveLength(5);
    expect(component.entryRows[1].entries).toHaveLength(5);
    expect(component.entryRows[2].entries).toHaveLength(2);
  });

  it('marks a row as having a named entry when any entry differs from the species name', () => {
    const speciesGroup: SpeciesGroup = {
      dexNr: 1,
      speciesId: 'bulbasaur',
      speciesName: 'Bulbasaur',
      entries: [
        makeEntry({ id: 'plain', name: 'Bulbasaur' }),
        makeEntry({ id: 'shiny', name: 'Bulbasaur (Shiny)' }),
      ],
    };

    component.speciesGroup = speciesGroup;

    expect(component.entryRows[0].hasNamedEntry).toBe(true);
  });

  it('marks a row as not having a named entry when every entry matches the species name', () => {
    const speciesGroup: SpeciesGroup = {
      dexNr: 1,
      speciesId: 'bulbasaur',
      speciesName: 'Bulbasaur',
      entries: [makeEntry({ id: 'plain', name: 'Bulbasaur' })],
    };

    component.speciesGroup = speciesGroup;

    expect(component.entryRows[0].hasNamedEntry).toBe(false);
  });
});
