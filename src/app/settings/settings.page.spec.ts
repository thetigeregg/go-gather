import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { DEFAULT_SETTINGS, ExportBundle, ProgressEntry, UserSettings } from '@go-gather/shared';
import { ToastController } from '@ionic/angular/standalone';
import { SettingsPage } from './settings.page';
import { NotificationService } from '../core/services/notification.service';
import { UserDataService } from '../core/services/user-data.service';
import { ChipListInputComponent } from '../features/chip-list-input/chip-list-input.component';
import { presentShareFile } from '../core/utils/share-file.util';
import { pickJsonTextFile } from '../core/utils/pick-file.util';

vi.mock('../core/utils/share-file.util', () => ({
  presentShareFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../core/utils/pick-file.util', () => ({
  pickJsonTextFile: vi.fn(),
}));

describe('SettingsPage', () => {
  let component: SettingsPage;
  let fixture: ComponentFixture<SettingsPage>;
  let userSettings: UserSettings;
  let updateUserSettingsCalls: Partial<UserSettings>[];
  let exportBundleMock: ReturnType<typeof vi.fn>;
  let importBundleMock: ReturnType<typeof vi.fn>;
  let toastCreateSpy: ReturnType<typeof vi.fn>;
  let toastPresentSpy: ReturnType<typeof vi.fn>;
  let isPushSupportedMock: ReturnType<typeof vi.fn>;
  let requestPermissionAndRegisterMock: ReturnType<typeof vi.fn>;
  let unregisterCurrentDeviceMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    userSettings = {
      ...DEFAULT_SETTINGS,
      excludedNamePatterns: ['existing-pattern'],
      excludedDexNumbers: [493],
      excludedShinyDexNumbers: [25],
      excludedShinyNamePatterns: ['existing-shiny-pattern'],
      userTags: ['existing-tag'],
      notificationsEnabled: false,
      notificationTimedEventOffsetMinutes: 15,
      notificationAllDayEventTime: '09:00',
    };
    updateUserSettingsCalls = [];
    vi.mocked(presentShareFile).mockClear().mockResolvedValue(undefined);
    vi.mocked(pickJsonTextFile).mockReset();
    exportBundleMock = vi.fn();
    importBundleMock = vi.fn();
    toastPresentSpy = vi.fn().mockResolvedValue(undefined);
    toastCreateSpy = vi.fn().mockResolvedValue({ present: toastPresentSpy });
    isPushSupportedMock = vi.fn().mockReturnValue(true);
    requestPermissionAndRegisterMock = vi
      .fn()
      .mockResolvedValue({ ok: true, message: 'Notifications enabled on this device.' });
    unregisterCurrentDeviceMock = vi
      .fn()
      .mockResolvedValue({ ok: true, message: 'Notifications disabled on this device.' });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: UserDataService,
          useValue: {
            getUserSettings: () => userSettings,
            updateUserSettings: (partial: Partial<UserSettings>) => {
              updateUserSettingsCalls.push(partial);
            },
            exportBundle: exportBundleMock,
            importBundle: importBundleMock,
          },
        },
        {
          provide: NotificationService,
          useValue: {
            isPushSupported: isPushSupportedMock,
            requestPermissionAndRegister: requestPermissionAndRegisterMock,
            unregisterCurrentDevice: unregisterCurrentDeviceMock,
          },
        },
        { provide: ToastController, useValue: { create: toastCreateSpy } },
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

  describe('notifications', () => {
    it('hydrates notification fields from UserDataService on ionViewWillEnter', () => {
      userSettings = {
        ...userSettings,
        notificationsEnabled: true,
        notificationTimedEventOffsetMinutes: 30,
        notificationAllDayEventTime: '08:15',
      };

      component.ionViewWillEnter();

      expect(component.notificationsEnabled).toBe(true);
      expect(component.notificationTimedEventOffsetMinutes).toBe(30);
      expect(component.notificationAllDayEventTime).toBe('08:15');
    });

    it('enabling requests permission, registers the device, and persists the setting on success', async () => {
      const event = new CustomEvent<{ checked: boolean }>('ionChange', {
        detail: { checked: true },
      });

      await component.notificationsEnabledChanged(event);

      expect(requestPermissionAndRegisterMock).toHaveBeenCalled();
      expect(component.notificationsEnabled).toBe(true);
      expect(updateUserSettingsCalls).toEqual([{ notificationsEnabled: true }]);
    });

    it('enabling reverts and shows a toast when permission/registration fails', async () => {
      requestPermissionAndRegisterMock.mockResolvedValue({
        ok: false,
        message: 'Notification permission was not granted.',
      });
      const event = new CustomEvent<{ checked: boolean }>('ionChange', {
        detail: { checked: true },
      });

      await component.notificationsEnabledChanged(event);

      expect(component.notificationsEnabled).toBe(false);
      expect(updateUserSettingsCalls).toEqual([]);
      expect(toastCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Notification permission was not granted.' })
      );
    });

    it('disabling unregisters the device and persists the setting', async () => {
      const event = new CustomEvent<{ checked: boolean }>('ionChange', {
        detail: { checked: false },
      });

      await component.notificationsEnabledChanged(event);

      expect(unregisterCurrentDeviceMock).toHaveBeenCalled();
      expect(component.notificationsEnabled).toBe(false);
      expect(updateUserSettingsCalls).toEqual([{ notificationsEnabled: false }]);
    });

    it('timedOffsetChanged persists a valid non-negative integer', () => {
      const event = new CustomEvent<{ value?: string | null }>('ionChange', {
        detail: { value: '45' },
      });

      component.timedOffsetChanged(event);

      expect(component.notificationTimedEventOffsetMinutes).toBe(45);
      expect(updateUserSettingsCalls).toEqual([{ notificationTimedEventOffsetMinutes: 45 }]);
    });

    it('timedOffsetChanged accepts 0 as a valid offset', () => {
      const event = new CustomEvent<{ value?: string | null }>('ionChange', {
        detail: { value: '0' },
      });

      component.timedOffsetChanged(event);

      expect(component.notificationTimedEventOffsetMinutes).toBe(0);
      expect(updateUserSettingsCalls).toEqual([{ notificationTimedEventOffsetMinutes: 0 }]);
    });

    it('timedOffsetChanged ignores a negative or non-numeric value', () => {
      component.timedOffsetChanged(
        new CustomEvent<{ value?: string | null }>('ionChange', { detail: { value: '-5' } })
      );
      component.timedOffsetChanged(
        new CustomEvent<{ value?: string | null }>('ionChange', { detail: { value: null } })
      );

      expect(updateUserSettingsCalls).toEqual([]);
    });

    it('allDayTimeChanged extracts and persists the HH:mm portion of the ISO value', () => {
      const event = new CustomEvent<{ value?: string | string[] | null }>('ionChange', {
        detail: { value: '2000-01-01T14:30:00' },
      });

      component.allDayTimeChanged(event);

      expect(component.notificationAllDayEventTime).toBe('14:30');
      expect(updateUserSettingsCalls).toEqual([{ notificationAllDayEventTime: '14:30' }]);
    });

    it('notificationAllDayEventTimeIso wraps the stored HH:mm as a full ISO string', () => {
      component.notificationAllDayEventTime = '09:00';
      expect(component.notificationAllDayEventTimeIso).toBe('2000-01-01T09:00:00');
    });
  });

  describe('exportBundle', () => {
    it('shares the exported bundle as a timestamped JSON file', async () => {
      const bundle: ExportBundle = {
        version: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        progress: [
          {
            catalogEntryId: 'bulbasaur-regular',
            caught: true,
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        excludedNamePatterns: [],
        excludedDexNumbers: [],
        excludedShinyDexNumbers: [],
        excludedShinyNamePatterns: [],
        userTags: [],
        presetQueries: [],
        excludedSearchTermsByPokedex: DEFAULT_SETTINGS.excludedSearchTermsByPokedex,
      };
      exportBundleMock.mockReturnValue(bundle);

      await component.exportBundle();

      expect(presentShareFile).toHaveBeenCalledWith(
        expect.objectContaining({
          content: JSON.stringify(bundle, null, 2),
          mimeType: 'application/json',
        })
      );
      const call = vi.mocked(presentShareFile).mock.calls[0][0];
      expect(call.filename).toMatch(/^go-gather-backup-.*\.json$/);
    });
  });

  describe('triggerImport', () => {
    const makeBundle = (): ExportBundle => ({
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      progress: [],
      excludedNamePatterns: [],
      excludedDexNumbers: [],
      excludedShinyDexNumbers: [],
      excludedShinyNamePatterns: [],
      userTags: [],
      presetQueries: [],
      excludedSearchTermsByPokedex: DEFAULT_SETTINGS.excludedSearchTermsByPokedex,
    });

    it('does nothing when the file picker is cancelled', async () => {
      vi.mocked(pickJsonTextFile).mockResolvedValue({ status: 'cancelled' });

      await component.triggerImport();

      expect(importBundleMock).not.toHaveBeenCalled();
      expect(toastCreateSpy).not.toHaveBeenCalled();
    });

    it('imports a full ExportBundle, refreshes fields, and shows a success toast', async () => {
      const bundle = makeBundle();
      vi.mocked(pickJsonTextFile).mockResolvedValue({
        status: 'picked',
        text: JSON.stringify(bundle),
        name: 'backup.json',
      });
      importBundleMock.mockReturnValue(of<ProgressEntry[]>([]));
      userSettings = { ...userSettings, excludedNamePatterns: ['post-import-pattern'] };

      await component.triggerImport();
      // showToast() is fire-and-forget from inside the subscribe callback
      // (RxJS doesn't await async next/error handlers) — flush the
      // microtask queue so its own internal awaits settle before asserting.
      await Promise.resolve();
      await Promise.resolve();

      expect(importBundleMock).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
      expect(component.patterns).toEqual(['post-import-pattern']);
      expect(toastCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Import complete.' })
      );
      expect(toastPresentSpy).toHaveBeenCalled();
    });

    it('back-compat parses a legacy bare progress-entry array', async () => {
      const legacyProgress: ProgressEntry[] = [
        {
          catalogEntryId: 'bulbasaur-regular',
          caught: true,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      vi.mocked(pickJsonTextFile).mockResolvedValue({
        status: 'picked',
        text: JSON.stringify(legacyProgress),
        name: 'legacy-backup.json',
      });
      importBundleMock.mockReturnValue(of<ProgressEntry[]>([]));

      await component.triggerImport();

      expect(importBundleMock).toHaveBeenCalledWith(
        expect.objectContaining({ progress: legacyProgress })
      );
    });

    it('shows a failure toast for an unrecognized file format', async () => {
      vi.mocked(pickJsonTextFile).mockResolvedValue({
        status: 'picked',
        text: JSON.stringify({ not: 'a bundle' }),
        name: 'garbage.json',
      });

      await component.triggerImport();

      expect(importBundleMock).not.toHaveBeenCalled();
      expect(toastCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Failed to read import file.' })
      );
    });

    it('shows a failure toast when importBundle errors', async () => {
      const bundle = makeBundle();
      vi.mocked(pickJsonTextFile).mockResolvedValue({
        status: 'picked',
        text: JSON.stringify(bundle),
        name: 'backup.json',
      });
      importBundleMock.mockReturnValue(throwError(() => new Error('write failed')));

      await component.triggerImport();

      expect(toastCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Failed to import data.' })
      );
    });
  });
});
