import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Router } from '@angular/router';
import { DEFAULT_SETTINGS, PresetQuery, UserSettings } from '@go-gather/shared';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { Clipboard } from '@capacitor/clipboard';
import { PresetQueriesPage } from './preset-queries.page';
import { UserDataService } from '../core/services/user-data.service';

vi.mock('@capacitor/clipboard', () => ({
  Clipboard: { write: vi.fn().mockResolvedValue(undefined) },
}));

function makePreset(overrides: Partial<PresetQuery> = {}): PresetQuery {
  return {
    id: 'preset-1',
    name: 'Shundo Regionals',
    groups: [
      {
        id: 'group-1',
        rules: [{ id: 'rule-1', term: { kind: 'region', value: 'alola' }, negate: false }],
      },
    ],
    ...overrides,
  };
}

describe('PresetQueriesPage', () => {
  let component: PresetQueriesPage;
  let fixture: ComponentFixture<PresetQueriesPage>;
  let userSettings: UserSettings;
  let updateUserSettingsCalls: Partial<UserSettings>[];
  let navigateSpy: ReturnType<typeof vi.fn>;
  let alertCreateSpy: ReturnType<typeof vi.fn>;
  let alertPresentSpy: ReturnType<typeof vi.fn>;
  let lastAlertButtons: { text: string; role?: string; handler?: () => void }[];
  let toastPresentSpy: ReturnType<typeof vi.fn>;
  let toastCreateSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    userSettings = { ...DEFAULT_SETTINGS, presetQueries: [makePreset()] };
    updateUserSettingsCalls = [];
    navigateSpy = vi.fn().mockResolvedValue(true);
    alertPresentSpy = vi.fn().mockResolvedValue(undefined);
    lastAlertButtons = [];
    alertCreateSpy = vi.fn().mockImplementation((options: { buttons: typeof lastAlertButtons }) => {
      lastAlertButtons = options.buttons;
      return Promise.resolve({ present: alertPresentSpy });
    });
    toastPresentSpy = vi.fn().mockResolvedValue(undefined);
    toastCreateSpy = vi.fn().mockResolvedValue({ present: toastPresentSpy });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- mocked static method, not called unbound
    vi.mocked(Clipboard.write).mockClear();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: UserDataService,
          useValue: {
            getUserSettings: () => userSettings,
            updateUserSettings: (partial: Partial<UserSettings>) => {
              updateUserSettingsCalls.push(partial);
              userSettings = { ...userSettings, ...partial };
            },
          },
        },
        { provide: Router, useValue: { navigate: navigateSpy } },
        { provide: AlertController, useValue: { create: alertCreateSpy } },
        { provide: ToastController, useValue: { create: toastCreateSpy } },
      ],
    });
    TestBed.overrideComponent(PresetQueriesPage, {
      set: { template: '<div></div>', styleUrls: [] },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(PresetQueriesPage);
    component = fixture.componentInstance;
  });

  it('loads rows with compiled preview strings on ionViewWillEnter', () => {
    component.ionViewWillEnter();

    expect(component.rows).toHaveLength(1);
    expect(component.rows[0].preset.id).toBe('preset-1');
    expect(component.rows[0].config.name).toBe('Shundo Regionals');
    expect(component.rows[0].config.value).toContain('alola');
  });

  it('shows a placeholder value for a preset with no rules', () => {
    userSettings = { ...userSettings, presetQueries: [makePreset({ groups: [] })] };

    component.ionViewWillEnter();

    expect(component.rows[0].config.value).toBe('(no rules yet)');
  });

  it('shows a fallback value instead of crashing for a preset that fails to compile', () => {
    userSettings = {
      ...userSettings,
      presetQueries: [
        makePreset({
          groups: [
            {
              id: 'group-1',
              rules: [
                {
                  id: 'rule-1',
                  term: { kind: 'numeric', field: 'cp', value: {} },
                  negate: false,
                },
              ],
            },
          ],
        }),
      ],
    };

    expect(() => {
      component.ionViewWillEnter();
    }).not.toThrow();
    expect(component.rows[0].config.value).toBe('(invalid preset — edit to fix)');
  });

  it('newPreset navigates to the create-mode editor route', () => {
    component.newPreset();

    expect(navigateSpy).toHaveBeenCalledWith(['/preset-queries', 'new', 'edit']);
  });

  it('editPreset navigates to the edit route for that preset id', () => {
    component.editPreset(makePreset());

    expect(navigateSpy).toHaveBeenCalledWith(['/preset-queries', 'preset-1', 'edit']);
  });

  it('deletePreset presents a confirm alert and only deletes when confirmed', async () => {
    component.ionViewWillEnter();

    await component.deletePreset(makePreset());

    expect(alertCreateSpy).toHaveBeenCalled();
    expect(alertPresentSpy).toHaveBeenCalled();
    expect(updateUserSettingsCalls).toHaveLength(0);

    const deleteButton = lastAlertButtons.find((button) => button.text === 'Delete');
    deleteButton?.handler?.();

    expect(updateUserSettingsCalls).toEqual([{ presetQueries: [] }]);
    expect(component.rows).toHaveLength(0);
  });

  it('copy writes the value to the clipboard and shows a toast', async () => {
    await component.copy('!shiny&+bulbasaur');

    // eslint-disable-next-line @typescript-eslint/unbound-method -- mocked static method, not called unbound
    expect(Clipboard.write).toHaveBeenCalledWith({ string: '!shiny&+bulbasaur' });
    expect(toastCreateSpy).toHaveBeenCalledWith({
      message: 'Copied!',
      duration: 1000,
      position: 'bottom',
    });
    expect(toastPresentSpy).toHaveBeenCalled();
  });
});
