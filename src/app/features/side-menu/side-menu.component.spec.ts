import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DEFAULT_SETTINGS, UserSettings } from '@go-gather/shared';
import { SideMenuComponent } from './side-menu.component';
import { UserDataService } from '../../core/services/user-data.service';
import { PreferenceStorageService } from '../../core/storage/preference-storage.service';

describe('SideMenuComponent', () => {
  let fixture: ComponentFixture<SideMenuComponent>;
  let component: SideMenuComponent;
  let userSettings: UserSettings;
  let updateUserSettingsCalls: UserSettings[];
  let preferences: Map<string, string>;

  beforeEach(async () => {
    userSettings = { ...DEFAULT_SETTINGS };
    updateUserSettingsCalls = [];
    preferences = new Map();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: UserDataService,
          useValue: {
            getUserSettings: () => userSettings,
            updateUserSettings: (settings: UserSettings) => {
              updateUserSettingsCalls.push(settings);
              userSettings = settings;
            },
          },
        },
        {
          provide: PreferenceStorageService,
          useValue: {
            getItem: (key: string) => Promise.resolve(preferences.get(key) ?? null),
            setItem: (key: string, value: string) => {
              preferences.set(key, value);
              return Promise.resolve();
            },
          },
        },
      ],
    });
    TestBed.overrideComponent(SideMenuComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(SideMenuComponent);
    component = fixture.componentInstance;
  });

  it('builds headers and toggle options reflecting current settings on init', () => {
    userSettings = {
      ...userSettings,
      pokedexType: 'mega',
      shinyFilter: 'shiny',
      showGender: false,
    };
    fixture.detectChanges();

    expect(component.pokedexTypeHeader).toBe('Pokedex: Mega Pokedex');
    expect(component.shinyFilterHeader).toBe('Shiny Filter: Shiny Only');
    expect(component.toggleOptions.find((o) => o.label === 'Gender Forms')?.isOn).toBe(false);
  });

  it('loads persisted accordion open-sections on init', async () => {
    preferences.set('sidebarAccordionState', JSON.stringify(['pokedexType', 'options']));
    fixture.detectChanges();
    await Promise.resolve();

    expect(component.openSections).toEqual(['pokedexType', 'options']);
  });

  it('defaults to no open sections when nothing is persisted', async () => {
    fixture.detectChanges();
    await Promise.resolve();

    expect(component.openSections).toEqual([]);
  });

  it('defaults to no open sections when the persisted value is malformed', async () => {
    preferences.set('sidebarAccordionState', 'not json');
    fixture.detectChanges();
    await Promise.resolve();

    expect(component.openSections).toEqual([]);
  });

  it('onAccordionChange normalizes and persists the open section list', () => {
    fixture.detectChanges();

    component.onAccordionChange('pokedexType');
    expect(component.openSections).toEqual(['pokedexType']);
    expect(preferences.get('sidebarAccordionState')).toBe(JSON.stringify(['pokedexType']));

    component.onAccordionChange(['shinyFilter', 'options']);
    expect(component.openSections).toEqual(['shinyFilter', 'options']);

    component.onAccordionChange(undefined);
    expect(component.openSections).toEqual([]);
  });

  it('onPokedexTypeChange updates settings and refreshes the header', () => {
    fixture.detectChanges();

    component.onPokedexTypeChange('xxl');

    expect(updateUserSettingsCalls).toHaveLength(1);
    expect(updateUserSettingsCalls[0].pokedexType).toBe('xxl');
    expect(component.pokedexTypeHeader).toBe('Pokedex: XXL Pokedex');
  });

  it('onShinyFilterChange updates settings', () => {
    fixture.detectChanges();

    component.onShinyFilterChange('non-shiny');

    expect(updateUserSettingsCalls[0].shinyFilter).toBe('non-shiny');
    expect(component.shinyFilterHeader).toBe('Shiny Filter: Non-Shiny Only');
  });

  it('onRegionFilterChange updates settings', () => {
    fixture.detectChanges();

    component.onRegionFilterChange('alola');

    expect(updateUserSettingsCalls[0].regionFilter).toBe('alola');
    expect(component.regionFilterHeader).toBe('Region: Alola');
  });

  it("a toggle option's command flips its boolean setting", () => {
    fixture.detectChanges();
    const uncaughtOnly = component.toggleOptions.find((o) => o.label === 'Uncaught Only');
    expect(uncaughtOnly?.isOn).toBe(false);

    uncaughtOnly?.command();

    expect(updateUserSettingsCalls[0].showUncaughtOnly).toBe(true);
    expect(component.toggleOptions.find((o) => o.label === 'Uncaught Only')?.isOn).toBe(true);
  });
});
