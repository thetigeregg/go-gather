import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import type {
  PogoEvent,
  RaidScheduleEntry,
  Season,
  SpotlightScheduleEntry,
} from '@go-gather/shared';
import { AppDb } from '../data/app-db';
import { DexieStorageEngine } from '../data/dexie-storage-engine';
import { StorageEngineFactory } from '../data/storage-engine.factory';
import { CalendarEventsService, getEventTypeInfo } from './calendar-events.service';
import { SyncService } from './sync.service';

vi.mock(
  '../data/storage-transaction-context',
  () => import('../data/storage-transaction-context.node')
);

function makeCalendarEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'community-day-january-2026',
    name: 'Community Day: January 2026',
    eventType: 'community-day',
    heading: 'Community Day',
    link: 'https://leekduck.com/events/community-day-january-2026/',
    image: 'https://example.com/community-day.png',
    start: '2026-01-11T14:00:00.000Z',
    end: '2026-01-11T17:00:00.000Z',
    ...overrides,
  };
}

function makeSeason(overrides: Partial<Season> = {}): Season {
  return {
    name: 'Forever Forward',
    eventID: 'season-23-forever-forward',
    link: 'https://leekduck.com/events/season-23-forever-forward/',
    start: '2026-06-02T10:00:00.000',
    end: '2026-09-08T10:00:00.000',
    note: null,
    dailyBonuses: [],
    seasonBonuses: [],
    ...overrides,
  };
}

describe('CalendarEventsService', () => {
  let db: AppDb;
  let engine: DexieStorageEngine;
  let service: CalendarEventsService;
  let calendarEventsSync$: Subject<void>;

  beforeEach(async () => {
    calendarEventsSync$ = new Subject<void>();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AppDb,
        DexieStorageEngine,
        StorageEngineFactory,
        {
          provide: SyncService,
          useValue: {
            listenForCalendarEventsSync: () => calendarEventsSync$.asObservable(),
          },
        },
      ],
    });

    db = TestBed.inject(AppDb);
    engine = TestBed.inject(DexieStorageEngine);
    await TestBed.inject(StorageEngineFactory).initialize();
    service = TestBed.inject(CalendarEventsService);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('events/season are empty before load is called', () => {
    expect(service.events).toEqual([]);
    expect(service.season).toBeUndefined();
  });

  it('loadCalendarEvents reads from StorageEngine and populates the events getter', async () => {
    await engine.bulkPutCalendarEvents([
      makeCalendarEvent(),
      makeCalendarEvent({ eventID: 'raid-day-january-2026', name: 'Raid Day' }),
    ]);

    const result = await new Promise<readonly PogoEvent[]>((resolve) => {
      service.loadCalendarEvents().subscribe(resolve);
    });

    expect(result).toHaveLength(2);
    expect(service.events).toHaveLength(2);
  });

  it('does not re-read StorageEngine on a second call when nothing has synced in between', async () => {
    await engine.putCalendarEvent(makeCalendarEvent());

    await new Promise<readonly PogoEvent[]>((resolve) => {
      service.loadCalendarEvents().subscribe(resolve);
    });
    expect(service.events).toHaveLength(1);

    // Added directly to storage, bypassing a sync pull — the cached
    // expansion should not pick this up until invalidated.
    await engine.putCalendarEvent(
      makeCalendarEvent({ eventID: 'raid-day-january-2026', name: 'Raid Day' })
    );

    await new Promise<readonly PogoEvent[]>((resolve) => {
      service.loadCalendarEvents().subscribe(resolve);
    });
    expect(service.events).toHaveLength(1);
  });

  it('re-reads StorageEngine once SyncService signals a new calendar-events pull', async () => {
    await engine.putCalendarEvent(makeCalendarEvent());

    await new Promise<readonly PogoEvent[]>((resolve) => {
      service.loadCalendarEvents().subscribe(resolve);
    });
    expect(service.events).toHaveLength(1);

    await engine.putCalendarEvent(
      makeCalendarEvent({ eventID: 'raid-day-january-2026', name: 'Raid Day' })
    );
    calendarEventsSync$.next();

    await new Promise<readonly PogoEvent[]>((resolve) => {
      service.loadCalendarEvents().subscribe(resolve);
    });
    expect(service.events).toHaveLength(2);
  });

  it('rebuilds isPastEvent/isFutureEvent fresh on every call, even without a new sync', async () => {
    // Only fake `Date` (not timers/tasks) — fake-indexeddb's internals rely
    // on real setTimeout/microtask scheduling to resolve, so faking those
    // too would deadlock every `await engine.*` call below.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-11T13:00:00.000Z'));

    try {
      await engine.putCalendarEvent(makeCalendarEvent());

      await new Promise<readonly PogoEvent[]>((resolve) => {
        service.loadCalendarEvents().subscribe(resolve);
      });
      expect(service.eventMetadata['community-day-january-2026'].isPastEvent).toBe(false);

      // No sync signal fired — only the clock moved. The cached expansion
      // should still be reused, but metadata must reflect the new "now".
      vi.setSystemTime(new Date('2026-01-11T18:00:00.000Z'));

      await new Promise<readonly PogoEvent[]>((resolve) => {
        service.loadCalendarEvents().subscribe(resolve);
      });
      expect(service.eventMetadata['community-day-january-2026'].isPastEvent).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('computes EventMetadata for each loaded event, keyed by eventID', async () => {
    await engine.putCalendarEvent(makeCalendarEvent());

    await new Promise<readonly PogoEvent[]>((resolve) => {
      service.loadCalendarEvents().subscribe(resolve);
    });

    const metadata = service.eventMetadata['community-day-january-2026'];
    expect(metadata).toBeDefined();
    expect(metadata.displayName).toBe('Community Day: January 2026');
    expect(metadata.typeInfo.name).toBe('Community Day');
    expect(metadata.isSingleDayEvent).toBe(true);
  });

  it('expands a raid schedule into individual Raid Hour sub-events', async () => {
    const raidSchedule: RaidScheduleEntry[] = [
      {
        date: 'Monday, January 12',
        bosses: [],
        raidHours: [
          {
            time: '6:00 p.m. to 7:00 p.m. local time',
            bosses: [{ name: 'Lugia', image: 'https://example.com/lugia.png', canBeShiny: true }],
          },
        ],
      },
    ];

    await engine.putCalendarEvent(
      makeCalendarEvent({
        eventID: 'raid-weekend-january-2026',
        eventType: 'event',
        start: '2026-01-10T00:00:00.000Z',
        end: '2026-01-12T23:59:59.000Z',
        extraData: { raidSchedule },
      })
    );

    const result = await new Promise<readonly PogoEvent[]>((resolve) => {
      service.loadCalendarEvents().subscribe(resolve);
    });

    const subEvent = result.find((event) => event.extraData?.isRaidHourSubEvent);
    expect(subEvent).toBeDefined();
    expect(subEvent?.name).toBe('Lugia Raid Hour');
    expect(subEvent?.extraData?.parentEventId).toBe('raid-weekend-january-2026');
  });

  it('expands a spotlight schedule into individual Spotlight Hour sub-events', async () => {
    const spotlightSchedule: SpotlightScheduleEntry[] = [
      {
        date: 'Tuesday, January 13',
        time: '6:00 p.m. to 7:00 p.m. local time',
        pokemon: { name: 'Eevee', image: 'https://example.com/eevee.png', canBeShiny: true },
      },
    ];

    await engine.putCalendarEvent(
      makeCalendarEvent({
        eventID: 'spotlight-hour-january-2026',
        eventType: 'event',
        start: '2026-01-13T00:00:00.000Z',
        end: '2026-01-13T23:59:59.000Z',
        extraData: { spotlightSchedule },
      })
    );

    const result = await new Promise<readonly PogoEvent[]>((resolve) => {
      service.loadCalendarEvents().subscribe(resolve);
    });

    const subEvent = result.find((event) => event.extraData?.isSpotlightSubEvent);
    expect(subEvent).toBeDefined();
    expect(subEvent?.name).toBe('Eevee Spotlight Hour');
    expect(subEvent?.extraData?.parentEventId).toBe('spotlight-hour-january-2026');
  });

  it('loadSeason reads from StorageEngine and populates the season getter', async () => {
    await engine.putSeason(makeSeason());

    const result = await new Promise<Season | undefined>((resolve) => {
      service.loadSeason().subscribe(resolve);
    });

    expect(result?.name).toBe('Forever Forward');
    expect(service.season?.name).toBe('Forever Forward');
  });
});

describe('getEventTypeInfo', () => {
  it('resolves a known event type', () => {
    expect(getEventTypeInfo('community-day')).toEqual({
      name: 'Community Day',
      priority: 88,
      category: 'community-and-raids',
    });
  });

  it('falls back to a generated name/priority/category for an unrecognized event type', () => {
    expect(getEventTypeInfo('some-new-event-type')).toEqual({
      name: 'Some New Event Type',
      priority: 5,
      category: 'events-and-misc',
    });
  });
});
