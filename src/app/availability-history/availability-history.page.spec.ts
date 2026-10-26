import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { DEFAULT_SETTINGS, UserSettings } from '@go-gather/shared';
import { AvailabilityChangesService } from '../core/services/availability-changes.service';
import {
  AvailabilityChange,
  AvailabilityLogEntry,
} from '../core/services/availability-changes.util';
import { UserDataService } from '../core/services/user-data.service';
import { AvailabilitySectionsComponent } from '../features/availability-changes/availability-sections.component';
import { AvailabilityHistoryPage } from './availability-history.page';

function change(id: string, overrides: Partial<AvailabilityChange> = {}): AvailabilityChange {
  return {
    id,
    name: id,
    pokedexType: 'regular',
    isShiny: false,
    order: 0,
    kind: 'available',
    releasedOn: '2016-07-06',
    seenState: 'hidden',
    seenReleasedOn: null,
    ...overrides,
  };
}

describe('AvailabilityHistoryPage', () => {
  let fixture: ComponentFixture<AvailabilityHistoryPage>;
  let page: AvailabilityHistoryPage;
  let log: AvailabilityLogEntry[];
  let settings: UserSettings;
  let logged$: Subject<void>;

  beforeEach(async () => {
    log = [];
    settings = { ...DEFAULT_SETTINGS };
    logged$ = new Subject<void>();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AvailabilityChangesService,
          useValue: { getLog: () => Promise.resolve(log), logged$ },
        },
        { provide: UserDataService, useValue: { getUserSettings: () => settings } },
      ],
    });
    TestBed.overrideComponent(AvailabilityHistoryPage, {
      set: { template: '<div></div>', styleUrls: [] },
    });
    TestBed.overrideComponent(AvailabilitySectionsComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(AvailabilityHistoryPage);
    page = fixture.componentInstance;
  });

  const enter = async () => {
    page.ionViewWillEnter();
    await fixture.whenStable();
  };

  it('is empty until loaded, then with an empty log', async () => {
    expect(page.loaded).toBe(false);

    await enter();

    expect(page.loaded).toBe(true);
    expect(page.days).toEqual([]);
  });

  it('lists each logged date with its grouped changes, in log order', async () => {
    log = [
      { loggedOn: '2026-10-16', changes: [change('b', { kind: 'unavailable', releasedOn: null })] },
      { loggedOn: '2026-10-15', changes: [change('a')] },
    ];

    await enter();

    expect(page.days).toEqual([
      {
        date: '2026-10-16',
        sections: [
          {
            kind: 'unavailable',
            groups: [
              { pokedexType: 'regular', items: [{ name: 'b', isShiny: false, releasedOn: null }] },
            ],
          },
        ],
      },
      {
        date: '2026-10-15',
        sections: [
          {
            kind: 'available',
            groups: [
              {
                pokedexType: 'regular',
                items: [{ name: 'a', isShiny: false, releasedOn: '2016-07-06' }],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('leaves out dates whose changes the exclusion patterns all hide', async () => {
    settings = { ...settings, excludedNamePatterns: ['hidden'] };
    log = [
      { loggedOn: '2026-10-16', changes: [change('hidden')] },
      { loggedOn: '2026-10-15', changes: [change('a')] },
    ];

    await enter();

    expect(page.days.map(({ date }) => date)).toEqual(['2026-10-15']);
  });

  it('reloads when changes are logged', async () => {
    await enter();
    log = [{ loggedOn: '2026-10-15', changes: [change('a')] }];

    logged$.next();
    await fixture.whenStable();

    expect(page.days.map(({ date }) => date)).toEqual(['2026-10-15']);
  });

  it('formats a day as a local date with weekday and year', () => {
    expect(page.formatDay('2026-10-26')).toBe(
      new Date(2026, 9, 26).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    );
  });
});
