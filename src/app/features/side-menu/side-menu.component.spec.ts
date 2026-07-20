import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DEFAULT_SETTINGS, UserSettings } from '@go-gather/shared';
import { SideMenuComponent } from './side-menu.component';
import { UserDataService } from '../../core/services/user-data.service';

describe('SideMenuComponent', () => {
  let fixture: ComponentFixture<SideMenuComponent>;
  let component: SideMenuComponent;
  let userSettings: UserSettings;
  let updateUserSettingsCalls: UserSettings[];

  beforeEach(async () => {
    userSettings = { ...DEFAULT_SETTINGS };
    updateUserSettingsCalls = [];

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
      ],
    });
    TestBed.overrideComponent(SideMenuComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(SideMenuComponent);
    component = fixture.componentInstance;
  });

  it('builds toggle options reflecting current settings on init', () => {
    userSettings = {
      ...userSettings,
      pokedexType: 'mega',
      shinyFilter: 'shiny',
      showGender: false,
    };
    fixture.detectChanges();

    expect(component.toggleOptions.find((o) => o.label === 'Gender Forms')?.isOn).toBe(false);
  });

  it('onPokedexTypeChange updates settings', () => {
    fixture.detectChanges();

    component.onPokedexTypeChange('xxl');

    expect(updateUserSettingsCalls).toHaveLength(1);
    expect(updateUserSettingsCalls[0].pokedexType).toBe('xxl');
  });

  it('onShinyFilterChange updates settings', () => {
    fixture.detectChanges();

    component.onShinyFilterChange('non-shiny');

    expect(updateUserSettingsCalls[0].shinyFilter).toBe('non-shiny');
  });

  it('onRegionFilterChange updates settings', () => {
    fixture.detectChanges();

    component.onRegionFilterChange('alola');

    expect(updateUserSettingsCalls[0].regionFilter).toBe('alola');
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
