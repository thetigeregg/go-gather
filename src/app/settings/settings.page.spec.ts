import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_SETTINGS, UserSettings } from '@go-gather/shared';
import { SettingsPage } from './settings.page';
import { UserDataService } from '../core/services/user-data.service';
import { ChipListInputComponent } from '../features/chip-list-input/chip-list-input.component';

describe('SettingsPage', () => {
  let component: SettingsPage;
  let fixture: ComponentFixture<SettingsPage>;
  let userSettings: UserSettings;
  let updateUserSettingsCalls: Partial<UserSettings>[];

  beforeEach(async () => {
    userSettings = {
      ...DEFAULT_SETTINGS,
      excludedNamePatterns: ['existing-pattern'],
      excludedDexNumbers: [493],
      excludedShinyDexNumbers: [25],
      excludedShinyNamePatterns: ['existing-shiny-pattern'],
      userTags: ['existing-tag'],
    };
    updateUserSettingsCalls = [];

    TestBed.configureTestingModule({
      providers: [
        {
          provide: UserDataService,
          useValue: {
            getUserSettings: () => userSettings,
            updateUserSettings: (partial: Partial<UserSettings>) => {
              updateUserSettingsCalls.push(partial);
            },
          },
        },
      ],
    });
    TestBed.overrideComponent(SettingsPage, { set: { template: '<div></div>', styleUrls: [] } });
    TestBed.overrideComponent(ChipListInputComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(SettingsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('hydrates the 5 fields from UserDataService on ionViewWillEnter', () => {
    component.ionViewWillEnter();

    expect(component.patterns).toEqual(['existing-pattern']);
    expect(component.dexNumbers).toEqual(['493']);
    expect(component.shinyDexNumbers).toEqual(['25']);
    expect(component.shinyPatterns).toEqual(['existing-shiny-pattern']);
    expect(component.userTags).toEqual(['existing-tag']);
  });

  it('patternsChanged updates excludedNamePatterns immediately', () => {
    component.patternsChanged(['a', 'b']);

    expect(component.patterns).toEqual(['a', 'b']);
    expect(updateUserSettingsCalls).toEqual([{ excludedNamePatterns: ['a', 'b'] }]);
  });

  it('shinyPatternsChanged updates excludedShinyNamePatterns immediately', () => {
    component.shinyPatternsChanged(['x']);

    expect(updateUserSettingsCalls).toEqual([{ excludedShinyNamePatterns: ['x'] }]);
  });

  it('userTagsChanged updates userTags immediately', () => {
    component.userTagsChanged(['tag1', 'tag2']);

    expect(updateUserSettingsCalls).toEqual([{ userTags: ['tag1', 'tag2'] }]);
  });

  it('dexNumbersChanged drops non-numeric entries before storing', () => {
    component.dexNumbersChanged(['493', 'not-a-number', '7']);

    expect(component.dexNumbers).toEqual(['493', '7']);
    expect(updateUserSettingsCalls).toEqual([{ excludedDexNumbers: [493, 7] }]);
  });

  it('shinyDexNumbersChanged drops non-numeric entries before storing', () => {
    component.shinyDexNumbersChanged(['25', 'oops']);

    expect(component.shinyDexNumbers).toEqual(['25']);
    expect(updateUserSettingsCalls).toEqual([{ excludedShinyDexNumbers: [25] }]);
  });
});
