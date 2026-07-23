import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DEFAULT_SETTINGS, UserSettings } from '@go-gather/shared';
import { ExcludedSearchTermInputComponent } from '../features/excluded-search-term-input/excluded-search-term-input.component';
import { SearchStringsPage } from './search-strings.page';
import { SearchStringService } from '../core/services/search-string.service';
import { UserDataService } from '../core/services/user-data.service';
import { SearchConfigService } from '../core/services/search-config.service';
import { SearchStringComponent } from '../features/search-string/search-string.component';
import { MultiSearchStringComponent } from '../features/multi-search-string/multi-search-string.component';

describe('SearchStringsPage', () => {
  let component: SearchStringsPage;
  let fixture: ComponentFixture<SearchStringsPage>;
  let userSettings: UserSettings;
  let searchStringServiceFake: {
    init: ReturnType<typeof vi.fn>;
    getDefaultSearchString: ReturnType<typeof vi.fn>;
    getShinySearchString: ReturnType<typeof vi.fn>;
    getDefaultMaleSearchString: ReturnType<typeof vi.fn>;
    getDefaultFemaleSearchString: ReturnType<typeof vi.fn>;
    getShinyMaleSearchString: ReturnType<typeof vi.fn>;
    getShinyFemaleSearchString: ReturnType<typeof vi.fn>;
    getAltRegionSearchStrings: ReturnType<typeof vi.fn>;
  };
  let costumeGenderEnabled: boolean;
  let updateUserSettings: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    userSettings = { ...DEFAULT_SETTINGS };
    costumeGenderEnabled = true;
    updateUserSettings = vi.fn((partial: Partial<UserSettings>) => {
      userSettings = { ...userSettings, ...partial };
    });

    searchStringServiceFake = {
      init: vi.fn(),
      getDefaultSearchString: vi.fn().mockReturnValue(null),
      getShinySearchString: vi.fn().mockReturnValue(null),
      getDefaultMaleSearchString: vi.fn().mockReturnValue(null),
      getDefaultFemaleSearchString: vi.fn().mockReturnValue(null),
      getShinyMaleSearchString: vi.fn().mockReturnValue(null),
      getShinyFemaleSearchString: vi.fn().mockReturnValue(null),
      getAltRegionSearchStrings: vi.fn().mockReturnValue(new Map()),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: SearchStringService, useValue: searchStringServiceFake },
        {
          provide: UserDataService,
          useValue: {
            getUserSettings: () => userSettings,
            updateUserSettings,
          },
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
    TestBed.overrideComponent(SearchStringsPage, {
      set: { template: '<div></div>', styleUrls: [] },
    });
    TestBed.overrideComponent(SearchStringComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(MultiSearchStringComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(ExcludedSearchTermInputComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(SearchStringsPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('leaves every section null when nothing is missing', () => {
    component.ionViewWillEnter();

    expect(component.defaultConfig).toBeNull();
    expect(component.shinyConfig).toBeNull();
    expect(component.genderConfigs).toEqual([]);
    expect(component.altRegionConfigs).toEqual([]);
  });

  it('labels default/shiny configs from the current pokedexType (regular)', () => {
    userSettings = { ...userSettings, pokedexType: 'regular' };
    searchStringServiceFake.getDefaultSearchString.mockReturnValue('!shiny&+bulbasaur');
    searchStringServiceFake.getShinySearchString.mockReturnValue('shiny&+bulbasaur');

    component.ionViewWillEnter();

    expect(component.defaultConfig).toEqual({
      name: 'Default (Non-Shiny)',
      value: '!shiny&+bulbasaur',
    });
    expect(component.shinyConfig).toEqual({ name: 'Shiny', value: 'shiny&+bulbasaur' });
  });

  it('labels default/shiny configs from the current pokedexType (mega)', () => {
    userSettings = { ...userSettings, pokedexType: 'mega' };
    searchStringServiceFake.getDefaultSearchString.mockReturnValue('!shiny&+venusaur&[Mega]');
    searchStringServiceFake.getShinySearchString.mockReturnValue('shiny&+venusaur&[Mega]');

    component.ionViewWillEnter();

    expect(component.defaultConfig?.name).toBe('Mega');
    expect(component.shinyConfig?.name).toBe('Mega Shiny');
  });

  it('computes gender configs for regular pokedexType, only including non-null rows', () => {
    userSettings = { ...userSettings, pokedexType: 'regular' };
    searchStringServiceFake.getDefaultMaleSearchString.mockReturnValue('male-string');
    searchStringServiceFake.getShinyFemaleSearchString.mockReturnValue('shiny-female-string');

    component.ionViewWillEnter();

    expect(component.genderConfigs).toEqual([
      { name: 'Male (Non-Shiny)', value: 'male-string' },
      { name: 'Female (Shiny)', value: 'shiny-female-string' },
    ]);
  });

  it('computes gender configs for costume pokedexType only when costumeGenderEnabled', () => {
    userSettings = { ...userSettings, pokedexType: 'costume' };
    searchStringServiceFake.getDefaultMaleSearchString.mockReturnValue('costume-male-string');

    costumeGenderEnabled = false;
    component.ionViewWillEnter();
    expect(component.genderConfigs).toBeNull();

    costumeGenderEnabled = true;
    component.ionViewWillEnter();
    expect(component.genderConfigs).toEqual([
      { name: 'Male (Non-Shiny)', value: 'costume-male-string' },
    ]);
  });

  it('does not compute gender configs for non-regular, non-costume pokedexType', () => {
    userSettings = { ...userSettings, pokedexType: 'mega' };
    searchStringServiceFake.getDefaultMaleSearchString.mockReturnValue('should-not-appear');

    component.ionViewWillEnter();

    expect(component.genderConfigs).toBeNull();
  });

  it('merges default and shiny alt-region maps into separate labeled rows, only for regular pokedexType', () => {
    userSettings = { ...userSettings, pokedexType: 'regular' };
    searchStringServiceFake.getAltRegionSearchStrings.mockImplementation((palette?: string) =>
      palette === 'shiny'
        ? new Map([['alola', 'shiny-alola-string']])
        : new Map([['alola', 'alola-string']])
    );

    component.ionViewWillEnter();

    expect(component.altRegionConfigs).toEqual([
      { name: 'Alola', value: 'alola-string' },
      { name: 'Alola (Shiny)', value: 'shiny-alola-string' },
    ]);
  });

  it('does not compute alt-region configs for non-regular pokedexType', () => {
    userSettings = { ...userSettings, pokedexType: 'xxl' };

    component.ionViewWillEnter();

    expect(component.altRegionConfigs).toBeNull();
  });

  it('ionViewWillEnter seeds excludedSearchTerms from the current pokedexType', () => {
    userSettings = {
      ...userSettings,
      pokedexType: 'mega',
      excludedSearchTermsByPokedex: {
        ...userSettings.excludedSearchTermsByPokedex,
        mega: [{ kind: 'tag', value: 'Trade' }],
      },
    };

    component.ionViewWillEnter();

    expect(component.excludedSearchTerms).toEqual([{ kind: 'tag', value: 'Trade' }]);
  });

  it('excludedSearchTermsChanged persists the merged per-pokedex map and re-runs search string generation', () => {
    userSettings = { ...userSettings, pokedexType: 'regular' };
    component.ionViewWillEnter();
    searchStringServiceFake.init.mockClear();

    component.excludedSearchTermsChanged([{ kind: 'keyword', value: 'shadow' }]);

    expect(component.excludedSearchTerms).toEqual([{ kind: 'keyword', value: 'shadow' }]);
    expect(updateUserSettings).toHaveBeenCalledWith({
      excludedSearchTermsByPokedex: {
        ...DEFAULT_SETTINGS.excludedSearchTermsByPokedex,
        regular: [{ kind: 'keyword', value: 'shadow' }],
      },
    });
    expect(searchStringServiceFake.init).toHaveBeenCalled();
  });
});
