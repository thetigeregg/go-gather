import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CatalogEntry } from '@go-gather/shared';
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
  });

  it('exposes the assigned species group', () => {
    const speciesGroup: SpeciesGroup = {
      dexNr: 1,
      speciesId: 'bulbasaur',
      speciesName: 'Bulbasaur',
      entries: [
        makeEntry({ id: 'bulbasaur-regular' }),
        makeEntry({ id: 'bulbasaur-shiny', isShiny: true, name: 'Bulbasaur (Shiny)' }),
      ],
    };

    component.speciesGroup = speciesGroup;
    fixture.detectChanges();

    expect(component.speciesGroup).toBe(speciesGroup);
  });
});
