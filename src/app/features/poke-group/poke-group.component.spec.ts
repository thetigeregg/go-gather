import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { CatalogEntry, DEFAULT_SETTINGS, UserSettings } from '@go-gather/shared';
import { PokeGroupComponent } from './poke-group.component';
import { Generation } from '../../core/services/filter.service';
import { UserDataService } from '../../core/services/user-data.service';
import { GatherPokemonComponent } from '../gather-pokemon/gather-pokemon.component';
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

describe('PokeGroupComponent', () => {
  let fixture: ComponentFixture<PokeGroupComponent>;
  let component: PokeGroupComponent;
  let caughtIds: Set<string>;
  let progressChange$: Subject<void>;

  beforeEach(async () => {
    caughtIds = new Set();
    progressChange$ = new Subject<void>();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: UserDataService,
          useValue: {
            getItemState: (id: string) => caughtIds.has(id),
            listenForProgressChanges: () => progressChange$.asObservable(),
          },
        },
      ],
    });
    TestBed.overrideComponent(PokeGroupComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(GatherPokemonComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(GatherEntryComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(PokeGroupComponent);
    component = fixture.componentInstance;
    component.userSettings = { ...DEFAULT_SETTINGS } satisfies UserSettings;
  });

  it('computes the caught/total count text on init', () => {
    const generation: Generation = {
      generationName: 'Generation 1',
      speciesList: [
        {
          dexNr: 1,
          speciesId: 'bulbasaur',
          speciesName: 'Bulbasaur',
          entries: [makeEntry(), makeEntry({ id: 'ivysaur', speciesId: 'ivysaur' })],
        },
      ],
    };
    component.generation = generation;
    component.ngOnChanges();

    fixture.detectChanges();

    expect(component.countText).toBe('0/2');
  });

  it('recomputes the count text when progress changes', () => {
    const generation: Generation = {
      generationName: 'Generation 1',
      speciesList: [
        {
          dexNr: 1,
          speciesId: 'bulbasaur',
          speciesName: 'Bulbasaur',
          entries: [makeEntry()],
        },
      ],
    };
    component.generation = generation;
    component.ngOnChanges();
    fixture.detectChanges();

    expect(component.countText).toBe('0/1');

    caughtIds.add('bulbasaur-regular');
    progressChange$.next();

    expect(component.countText).toBe('1/1');
  });
});
