import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { AppComponent } from './app.component';
import { SideMenuComponent } from './features/side-menu/side-menu.component';
import { NavMenuComponent } from './features/nav-menu/nav-menu.component';
import { CalendarFilterMenuComponent } from './features/calendar-filter-menu/calendar-filter-menu.component';
import { AvailabilityChangesModalComponent } from './features/availability-changes/availability-changes-modal.component';
import { AvailabilityChangesService } from './core/services/availability-changes.service';
import { AvailabilityChange } from './core/services/availability-changes.util';
import { LiveUpdateService } from './core/services/live-update.service';
import { NotificationService } from './core/services/notification.service';
import { UserDataService } from './core/services/user-data.service';
import { DEFAULT_SETTINGS } from '@go-gather/shared';

/** An Ionic overlay stand-in whose dismissal the test controls. */
function fakeOverlay(log: string[], name: string) {
  let dismiss!: () => void;
  const dismissed = new Promise<void>((resolve) => {
    dismiss = () => {
      log.push(`dismiss ${name}`);
      resolve();
    };
  });
  return {
    present: vi.fn(() => {
      log.push(`present ${name}`);
      return Promise.resolve();
    }),
    onDidDismiss: () => dismissed,
    dismiss: () => {
      dismiss();
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const CHANGE: AvailabilityChange = {
  id: 'weavile-dmax',
  name: 'Weavile (Dynamax)',
  pokedexType: 'dmax',
  isShiny: false,
  order: 1,
  kind: 'available',
  releasedOn: '2026-10-19',
  seenState: 'announced',
  seenReleasedOn: '2026-10-19',
};

describe('AppComponent', () => {
  let log: string[];
  let staged$: Subject<{ semver: string }>;
  let pending$: Subject<void>;
  let pending: AvailabilityChange[];
  let alert: ReturnType<typeof fakeOverlay>;
  let modal: ReturnType<typeof fakeOverlay>;
  let modalCreate: ReturnType<typeof vi.fn>;
  let availabilityChanges: {
    pending$: Subject<void>;
    checkForDateChanges: ReturnType<typeof vi.fn>;
    takePending: () => Promise<AvailabilityChange[]>;
    acknowledge: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    log = [];
    staged$ = new Subject();
    pending$ = new Subject();
    pending = [CHANGE];
    alert = fakeOverlay(log, 'alert');
    modal = fakeOverlay(log, 'modal');
    modalCreate = vi.fn(() => Promise.resolve(modal));
    availabilityChanges = {
      pending$,
      checkForDateChanges: vi.fn(() => Promise.resolve()),
      takePending: () => Promise.resolve(pending),
      acknowledge: vi.fn((shown: AvailabilityChange[]) => {
        log.push(`acknowledge ${String(shown.length)}`);
        return Promise.resolve();
      }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: UserDataService,
          useValue: {
            getUserSettings: () => ({ ...DEFAULT_SETTINGS }),
            updateUserSettings: () => undefined,
          },
        },
        {
          provide: LiveUpdateService,
          useValue: {
            markReady: () => Promise.resolve(),
            reload: () => Promise.resolve(),
            staged$,
          },
        },
        { provide: NotificationService, useValue: { initialize: () => Promise.resolve() } },
        { provide: AvailabilityChangesService, useValue: availabilityChanges },
        { provide: AlertController, useValue: { create: () => Promise.resolve(alert) } },
        { provide: ModalController, useValue: { create: modalCreate } },
      ],
    });
    TestBed.overrideComponent(AppComponent, { set: { template: '<div></div>' } });
    TestBed.overrideComponent(SideMenuComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(NavMenuComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(CalendarFilterMenuComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();
  });

  function createApp() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('should create the app', () => {
    expect(createApp().componentInstance).toBeTruthy();
  });

  it('checks for availability changes by date on launch', () => {
    createApp();

    expect(availabilityChanges.checkForDateChanges).toHaveBeenCalledTimes(1);
  });

  it('checks again when the device date rolls over', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 18, 23, 59, 30) });
    try {
      createApp();

      vi.advanceTimersByTime(60_000);

      expect(availabilityChanges.checkForDateChanges).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('logs a failed availability check instead of throwing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    availabilityChanges.checkForDateChanges.mockReturnValueOnce(Promise.reject(new Error('db')));

    createApp();
    await flush();

    expect(consoleError).toHaveBeenCalledWith('availability_changes.check_failed', {
      error: 'db',
    });
    consoleError.mockRestore();
  });

  it('shows the availability sheet with grouped changes, then acknowledges them', async () => {
    createApp();

    pending$.next();
    await flush();

    expect(modalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        component: AvailabilityChangesModalComponent,
        componentProps: {
          sections: [
            {
              kind: 'available',
              groups: [
                {
                  pokedexType: 'dmax',
                  items: [{ name: 'Weavile (Dynamax)', isShiny: false, releasedOn: '2026-10-19' }],
                },
              ],
            },
          ],
        },
      })
    );
    expect(availabilityChanges.acknowledge).not.toHaveBeenCalled();

    modal.dismiss();
    await flush();
    expect(log).toEqual(['present modal', 'dismiss modal', 'acknowledge 1']);
  });

  it('waits for the OTA alert before showing the sheet, without acknowledging early', async () => {
    createApp();

    staged$.next({ semver: '0.23.0' });
    pending$.next();
    await flush();
    // Reload from here would restart the app with the changes still pending.
    expect(log).toEqual(['present alert']);
    expect(availabilityChanges.acknowledge).not.toHaveBeenCalled();

    alert.dismiss();
    await flush();
    expect(log).toEqual(['present alert', 'dismiss alert', 'present modal']);
  });

  it('waits for the sheet before showing the OTA alert', async () => {
    createApp();

    pending$.next();
    staged$.next({ semver: '0.23.0' });
    await flush();
    expect(log).toEqual(['present modal']);

    modal.dismiss();
    await flush();
    expect(log).toEqual(['present modal', 'dismiss modal', 'acknowledge 1', 'present alert']);
  });

  it('acknowledges without a popup when exclusion patterns hide every change', async () => {
    TestBed.inject(UserDataService).getUserSettings = () => ({
      ...DEFAULT_SETTINGS,
      excludedNamePatterns: ['weavile'],
    });
    createApp();

    pending$.next();
    await flush();

    expect(modalCreate).not.toHaveBeenCalled();
    expect(log).toEqual(['acknowledge 1']);
  });
});
