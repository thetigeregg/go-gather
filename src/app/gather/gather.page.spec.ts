import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Subject, of } from 'rxjs';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { DEFAULT_SETTINGS, UserSettings } from '@go-gather/shared';
import { IonSearchbar } from '@ionic/angular/standalone';
import { GatherPage } from './gather.page';
import { PokeDataService } from '../core/services/poke-data.service';
import { UserDataService } from '../core/services/user-data.service';
import { FilterService, Generation } from '../core/services/filter.service';
import { SearchConfigService } from '../core/services/search-config.service';
import { GenerationHeaderRowComponent } from '../features/generation-header-row/generation-header-row.component';
import { GatherEntryRowComponent } from '../features/gather-entry-row/gather-entry-row.component';
import { GatherEntryComponent } from '../features/gather-entry/gather-entry.component';

describe('GatherPage', () => {
  let fixture: ComponentFixture<GatherPage>;
  let component: GatherPage;
  let userSettings: UserSettings;
  let userSettingsChange$: Subject<UserSettings>;
  let progressChange$: Subject<void>;
  let caughtIds: Set<string>;
  let groupPokemonByGenerationCalls: UserSettings[];
  let generations: Generation[];

  beforeEach(async () => {
    userSettings = { ...DEFAULT_SETTINGS };
    userSettingsChange$ = new Subject<UserSettings>();
    progressChange$ = new Subject<void>();
    caughtIds = new Set();
    groupPokemonByGenerationCalls = [];
    generations = [
      {
        generationName: 'Generation 1',
        speciesList: [
          {
            dexNr: 1,
            speciesId: 'bulbasaur',
            speciesName: 'Bulbasaur',
            entries: [
              {
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
              },
            ],
          },
        ],
      },
    ];

    TestBed.configureTestingModule({
      providers: [
        {
          provide: PokeDataService,
          useValue: { loadCatalog: () => of([]) },
        },
        {
          provide: UserDataService,
          useValue: {
            getUserSettings: () => userSettings,
            loadProgress: () => of([]),
            getItemState: (id: string) => caughtIds.has(id),
            listenForUserSettingsChanges: () => userSettingsChange$.asObservable(),
            listenForProgressChanges: () => progressChange$.asObservable(),
          },
        },
        {
          provide: FilterService,
          useValue: {
            groupPokemonByGeneration: (settings: UserSettings) => {
              groupPokemonByGenerationCalls.push(settings);
              return generations;
            },
          },
        },
        {
          provide: SearchConfigService,
          useValue: {
            loadConfig: () => of({ implicitlyExcludedSearchTerms: [], costumeGenderEnabled: true }),
          },
        },
      ],
    });
    TestBed.overrideComponent(GatherPage, { set: { template: '<div></div>', styleUrls: [] } });
    TestBed.overrideComponent(GenerationHeaderRowComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(GatherEntryRowComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(GatherEntryComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(GatherPage);
    component = fixture.componentInstance;
  });

  it('hydrates the catalog grid and header count on init', () => {
    fixture.detectChanges();

    expect(component.generationToPokemonMap).toEqual(generations);
    expect(component.visibleGenerations).toEqual(generations);
    expect(component.headerText).toBe('Regular Pokedex (0/1)');
    expect(groupPokemonByGenerationCalls).toHaveLength(1);
  });

  describe('onSearchChange', () => {
    it('narrows visibleGenerations to species matching the search term', () => {
      fixture.detectChanges();

      component.onSearchChange('bulba');

      expect(component.visibleGenerations).toEqual(generations);

      component.onSearchChange('charmander');

      expect(component.visibleGenerations).toEqual([]);
    });

    it('does not affect the header count, which stays scoped to the full list', () => {
      fixture.detectChanges();

      component.onSearchChange('charmander');

      expect(component.headerText).toBe('Regular Pokedex (0/1)');
    });

    it('restores the full list when the search term is cleared', () => {
      fixture.detectChanges();

      component.onSearchChange('charmander');
      component.onSearchChange('');

      expect(component.visibleGenerations).toEqual(generations);
    });
  });

  it('re-filters and recomputes the header when user settings change', () => {
    fixture.detectChanges();

    const updatedSettings: UserSettings = { ...userSettings, pokedexType: 'mega' };
    userSettingsChange$.next(updatedSettings);

    expect(component.userSettings).toEqual(updatedSettings);
    expect(groupPokemonByGenerationCalls).toContainEqual(updatedSettings);
  });

  it('re-filters on progress change only when showUncaughtOnly is set', () => {
    fixture.detectChanges();
    const callsBefore = groupPokemonByGenerationCalls.length;

    progressChange$.next();
    expect(groupPokemonByGenerationCalls).toHaveLength(callsBefore);
    expect(component.headerText).toBe('Regular Pokedex (0/1)');

    userSettings = { ...userSettings, showUncaughtOnly: true };
    component.userSettings = userSettings;
    caughtIds.add('bulbasaur-regular');
    progressChange$.next();

    expect(groupPokemonByGenerationCalls).toHaveLength(callsBefore + 1);
    expect(component.headerText).toBe('Regular Pokedex (1/1)');
  });

  describe('flatRows and the sticky header bar', () => {
    it('flattens visibleGenerations into rows and points the sticky bar at the first row', () => {
      fixture.detectChanges();

      expect(component.flatRows.map((row) => row.kind)).toEqual(['generation-header', 'entry']);
      expect(component.stickyGenerationName).toBe('Generation 1');
      expect(component.stickyGenerationCaught).toBe(0);
      expect(component.stickyGenerationTotal).toBe(1);
      expect(component.stickySpeciesName).toBe('');
      expect(component.stickySpeciesDexNr).toBeNull();
    });

    it('updates the sticky bar to the species at the scrolled-to entry row', () => {
      fixture.detectChanges();

      component.onScrolledIndexChange(1);

      expect(component.stickyGenerationName).toBe('Generation 1');
      expect(component.stickySpeciesName).toBe('Bulbasaur');
      expect(component.stickySpeciesDexNr).toBe(1);
    });

    it('resets the viewport scroll position whenever the rows are rebuilt', () => {
      fixture.detectChanges();
      const scrollToIndexSpy = vi.fn();
      component.viewportRef = {
        scrollToIndex: scrollToIndexSpy,
      } as unknown as CdkVirtualScrollViewport;

      component.onSearchChange('bulba');

      expect(scrollToIndexSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('focusSearch', () => {
    it('focuses the header searchbar', () => {
      fixture.detectChanges();
      const setFocusSpy = vi.fn().mockResolvedValue(undefined);
      component.searchbarRef = { setFocus: setFocusSpy } as unknown as IonSearchbar;

      component.focusSearch();

      expect(setFocusSpy).toHaveBeenCalled();
    });
  });
});
