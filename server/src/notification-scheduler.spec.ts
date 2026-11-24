import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { db } from './db';
import {
  CandidateEvent,
  NotificationPreferences,
  computeDueNotifications,
  readEffectiveTimezone,
  readKnownTimezone,
} from './notification-scheduler';

dayjs.extend(utc);
dayjs.extend(timezone);

vi.mock('./db', async () => {
  const { default: Database } = await import('better-sqlite3');
  return { db: new Database(':memory:') };
});

const ZONE = 'America/Chicago';

function baseSettings(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    notificationsEnabled: true,
    notificationTimedEventOffsetMinutes: 15,
    notificationAllDayEventTime: '09:00',
    hiddenEventIds: [],
    disabledEventTypes: [],
    disabledSeasonDailyBonusDays: [],
    notificationMultiDayDailyEnabled: true,
    ...overrides,
  };
}

function event(overrides: Partial<CandidateEvent> = {}): CandidateEvent {
  return {
    eventId: 'event-1',
    eventType: 'community-day',
    name: 'Community Day',
    heading: 'Featured Pokemon appear more often',
    start: '2026-03-15T18:00:00Z',
    ...overrides,
  };
}

describe('computeDueNotifications', () => {
  it('returns nothing when notifications are disabled', () => {
    const now = dayjs.tz('2026-03-15T17:45:00', ZONE);
    const due = computeDueNotifications(
      [event()],
      baseSettings({ notificationsEnabled: false }),
      now,
      ZONE
    );
    expect(due).toEqual([]);
  });

  it('classifies a non-midnight-local start as timed and fires at start minus the offset', () => {
    // 18:00 UTC on 2026-03-15 is 13:00 in America/Chicago (CDT, UTC-5) — not midnight local.
    const now = dayjs.tz('2026-03-15T12:45:00', ZONE);
    const due = computeDueNotifications([event()], baseSettings(), now, ZONE);

    expect(due).toHaveLength(1);
    expect(due[0].category).toBe('timed');
    expect(due[0].notifyAt.format()).toBe(dayjs.tz('2026-03-15T12:45:00', ZONE).format());
  });

  it('classifies a start that is midnight UTC but NOT midnight local as timed, never all-day', () => {
    // Midnight UTC on 2026-03-15 is 19:00 the prior day in America/Chicago
    // (CDT, UTC-5) — a real hour, not all-day.
    const midnightUtcEvent = event({ start: '2026-03-15T00:00:00Z' });
    const now = dayjs.tz('2026-03-14T19:00:00', ZONE);
    const due = computeDueNotifications(
      [midnightUtcEvent],
      baseSettings({ notificationTimedEventOffsetMinutes: 0 }),
      now,
      ZONE
    );

    expect(due).toHaveLength(1);
    expect(due[0].category).toBe('timed');
  });

  it('classifies a start that is exactly midnight local as all-day and fires at the configured time-of-day', () => {
    // 06:00 UTC on 2026-03-15 is 01:00 in Chicago... use a start whose UTC
    // instant IS local midnight in America/Chicago (05:00 UTC during CDT).
    const allDayEvent = event({ start: '2026-03-15T05:00:00Z' });
    const now = dayjs.tz('2026-03-15T09:00:00', ZONE);
    const due = computeDueNotifications(
      [allDayEvent],
      baseSettings({ notificationAllDayEventTime: '09:00' }),
      now,
      ZONE
    );

    expect(due).toHaveLength(1);
    expect(due[0].category).toBe('all-day');
    expect(due[0].notifyAt.format('HH:mm')).toBe('09:00');
    expect(due[0].notifyAt.format('YYYY-MM-DD')).toBe('2026-03-15');
  });

  it('excludes events in hiddenEventIds before any fire-time computation', () => {
    const now = dayjs.tz('2026-03-15T12:45:00', ZONE);
    const due = computeDueNotifications(
      [event({ eventId: 'hidden-event' })],
      baseSettings({ hiddenEventIds: ['hidden-event'] }),
      now,
      ZONE
    );
    expect(due).toEqual([]);
  });

  it('excludes events whose type is in disabledEventTypes', () => {
    const now = dayjs.tz('2026-03-15T12:45:00', ZONE);
    const due = computeDueNotifications(
      [event({ eventType: 'season' })],
      baseSettings({ disabledEventTypes: ['season'] }),
      now,
      ZONE
    );
    expect(due).toEqual([]);
  });

  it('excludes a season-daily-bonus event whose dayOfWeek is in disabledSeasonDailyBonusDays', () => {
    const now = dayjs.tz('2026-03-15T09:00:00', ZONE);
    const fridayBonus = event({
      eventType: 'season-daily-bonus',
      dayOfWeek: 5,
      start: '2026-03-13T00:00:00', // a Friday, local midnight
    });
    const due = computeDueNotifications(
      [fridayBonus],
      baseSettings({ disabledSeasonDailyBonusDays: [5] }),
      now,
      ZONE
    );
    expect(due).toEqual([]);
  });

  it('still fires a season-daily-bonus event whose dayOfWeek is NOT disabled, as an all-day category', () => {
    const now = dayjs.tz('2026-03-13T09:00:00', ZONE);
    const fridayBonus = event({
      eventType: 'season-daily-bonus',
      dayOfWeek: 5,
      start: '2026-03-13T00:00:00', // a Friday, local midnight
    });
    const due = computeDueNotifications(
      [fridayBonus],
      baseSettings({ disabledSeasonDailyBonusDays: [0] }),
      now,
      ZONE
    );
    expect(due).toHaveLength(1);
    expect(due[0].category).toBe('all-day');
  });

  it('excludes an event whose notifyAt is still in the future', () => {
    const now = dayjs.tz('2026-03-15T10:00:00', ZONE);
    const due = computeDueNotifications([event()], baseSettings(), now, ZONE);
    expect(due).toEqual([]);
  });

  it('excludes an event whose notifyAt is outside the lookback window', () => {
    const now = dayjs.tz('2026-03-15T18:00:00', ZONE);
    const due = computeDueNotifications([event()], baseSettings(), now, ZONE, 5);
    expect(due).toEqual([]);
  });

  it('clamps title and body to the notification copy policy limits', () => {
    const now = dayjs.tz('2026-03-15T12:45:00', ZONE);
    const longEvent = event({
      name: 'A'.repeat(80),
      heading: 'B'.repeat(120),
    });
    const due = computeDueNotifications([longEvent], baseSettings(), now, ZONE);

    expect(due).toHaveLength(1);
    expect(due[0].title.length).toBeLessThanOrEqual(40);
    expect(due[0].body.length).toBeLessThanOrEqual(90);
  });
});

describe('computeDueNotifications — multi-day daily reminders', () => {
  // Shaped like the feed's Wild Area 2026 entry: 10:00–18:00 local on both days.
  function wildArea(overrides: Partial<CandidateEvent> = {}): CandidateEvent {
    return event({
      eventId: 'wild-area',
      eventType: 'wild-area',
      name: 'Wild Area 2026',
      heading: 'Wild Area',
      start: '2026-11-14T10:00:00.000',
      end: '2026-11-15T18:00:00.000',
      ...overrides,
    });
  }

  it('keeps the original key and title for the start-day notification', () => {
    const now = dayjs.tz('2026-11-14T09:45:00', ZONE);
    const due = computeDueNotifications([wildArea()], baseSettings(), now, ZONE);

    expect(due).toHaveLength(1);
    expect(due[0].eventKey).toBe('wild-area:timed');
    expect(due[0].title).toBe('Wild Area 2026');
  });

  it("fires on a later day at the start's clock time minus the offset, with a per-day key", () => {
    const now = dayjs.tz('2026-11-15T09:45:00', ZONE);
    const due = computeDueNotifications([wildArea()], baseSettings(), now, ZONE);

    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      eventId: 'wild-area',
      eventType: 'wild-area',
      category: 'timed',
      eventKey: 'wild-area:timed:2026-11-15',
      title: 'Wild Area 2026 Day 2/2',
      body: 'Wild Area',
    });
    expect(due[0].notifyAt.toISOString()).toBe(dayjs.tz('2026-11-15T09:45:00', ZONE).toISOString());
  });

  it('sends nothing on later days when the setting is off', () => {
    const now = dayjs.tz('2026-11-15T09:45:00', ZONE);
    const due = computeDueNotifications(
      [wildArea()],
      baseSettings({ notificationMultiDayDailyEnabled: false }),
      now,
      ZONE
    );
    expect(due).toEqual([]);
  });

  it('sends nothing on later days of a hidden event', () => {
    const now = dayjs.tz('2026-11-15T09:45:00', ZONE);
    const due = computeDueNotifications(
      [wildArea()],
      baseSettings({ hiddenEventIds: ['wild-area'] }),
      now,
      ZONE
    );
    expect(due).toEqual([]);
  });

  it('skips events spanning more days than the limit, and honours a raised limit', () => {
    const fiveDays = wildArea({ end: '2026-11-18T18:00:00.000' });
    const now = dayjs.tz('2026-11-15T09:45:00', ZONE);

    expect(computeDueNotifications([fiveDays], baseSettings(), now, ZONE)).toEqual([]);

    const due = computeDueNotifications([fiveDays], baseSettings(), now, ZONE, 60, 5);
    expect(due).toHaveLength(1);
    expect(due[0].title).toBe('Wild Area 2026 Day 2/5');
  });

  it('counts only real days toward the limit, not a final partial day', () => {
    // Four full days — 10:00 day 1 to 09:59 day 5 — touches five calendar
    // days, but day 5 ends before its 10:00 start and is dropped first.
    const fourDays = wildArea({ end: '2026-11-18T09:59:00.000' });
    const now = dayjs.tz('2026-11-15T09:45:00', ZONE);
    const due = computeDueNotifications([fourDays], baseSettings(), now, ZONE);

    expect(due).toHaveLength(1);
    expect(due[0].title).toBe('Wild Area 2026 Day 2/4');
  });

  it('drops a final all-day day that ends before the all-day notification time', () => {
    const endsEarly = event({
      eventId: 'early',
      name: 'Early',
      start: '2027-02-27T00:00:00.000',
      end: '2027-02-28T06:00:00.000',
    });
    const now = dayjs.tz('2027-02-28T09:00:00', ZONE);
    const due = computeDueNotifications([endsEarly], baseSettings(), now, ZONE);

    expect(due).toEqual([]);
  });

  it('treats an end at exactly local midnight as ending the previous day', () => {
    const now = dayjs.tz('2026-11-15T09:45:00', ZONE);
    const due = computeDueNotifications(
      [wildArea({ end: '2026-11-15T00:00:00.000' })],
      baseSettings(),
      now,
      ZONE
    );
    expect(due).toEqual([]);
  });

  it('drops a final day whose projected start is past the end, and counts days accordingly', () => {
    // Shaped like an in-person Tour with UTC timestamps: 10:00 CST Feb 18
    // through 09:59 CST Feb 21 — four calendar days, but day 4 ends before
    // its 10:00 projected start.
    const tour = event({
      eventId: 'tour',
      name: 'Tour',
      start: '2027-02-18T16:00:00.000Z',
      end: '2027-02-21T15:59:59.000Z',
    });

    const dayThree = computeDueNotifications(
      [tour],
      baseSettings(),
      dayjs.tz('2027-02-20T09:45:00', ZONE),
      ZONE
    );
    expect(dayThree).toHaveLength(1);
    expect(dayThree[0].title).toBe('Tour Day 3/3');

    const dayFour = computeDueNotifications(
      [tour],
      baseSettings(),
      dayjs.tz('2027-02-21T09:45:00', ZONE),
      ZONE
    );
    expect(dayFour).toEqual([]);
  });

  it('uses the all-day time on later days of an all-day event', () => {
    const allDay = event({
      eventId: 'tour-global',
      name: 'Tour Global',
      start: '2027-02-27T00:00:00.000',
      end: '2027-02-28T23:59:59.000',
    });
    const now = dayjs.tz('2027-02-28T08:30:00', ZONE);
    const due = computeDueNotifications(
      [allDay],
      baseSettings({ notificationAllDayEventTime: '08:30' }),
      now,
      ZONE
    );

    expect(due).toHaveLength(1);
    expect(due[0].category).toBe('all-day');
    expect(due[0].eventKey).toBe('tour-global:all-day:2027-02-28');
    expect(due[0].notifyAt.format('YYYY-MM-DD HH:mm')).toBe('2027-02-28 08:30');
  });

  it('keeps the local clock time when a DST change falls between days', () => {
    // US DST ends 02:00 on 2026-11-01 in America/Chicago (CDT -> CST).
    const acrossDst = wildArea({
      start: '2026-10-31T10:00:00.000',
      end: '2026-11-01T18:00:00.000',
    });
    const now = dayjs.tz('2026-11-01T09:45:00', ZONE);
    const due = computeDueNotifications([acrossDst], baseSettings(), now, ZONE);

    expect(due).toHaveLength(1);
    expect(due[0].notifyAt.toISOString()).toBe('2026-11-01T15:45:00.000Z');
  });

  it('ignores an end that precedes the start', () => {
    const now = dayjs.tz('2026-11-15T09:45:00', ZONE);
    const due = computeDueNotifications(
      [wildArea({ end: '2026-11-13T18:00:00.000' })],
      baseSettings(),
      now,
      ZONE
    );
    expect(due).toEqual([]);
  });
});

describe('device timezone lookup', () => {
  beforeEach(() => {
    db.exec(`CREATE TABLE fcm_tokens (timezone TEXT, is_active INTEGER, last_seen_at TEXT)`);
  });

  afterEach(() => {
    db.exec(`DROP TABLE fcm_tokens`);
  });

  function addToken(timezone: string | null, isActive: number, lastSeenAt: string): void {
    db.prepare(`INSERT INTO fcm_tokens VALUES (?, ?, ?)`).run(timezone, isActive, lastSeenAt);
  }

  it('reports no known timezone, and UTC for notifications, when no device has one', () => {
    addToken(null, 1, '2026-06-14T00:00:00.000Z');
    addToken('Asia/Tokyo', 0, '2026-06-15T00:00:00.000Z');

    expect(readKnownTimezone()).toBeNull();
    expect(readEffectiveTimezone()).toBe('UTC');
  });

  it('uses the most recently seen active device timezone', () => {
    addToken('America/Chicago', 1, '2026-06-13T00:00:00.000Z');
    addToken('America/New_York', 1, '2026-06-14T00:00:00.000Z');

    expect(readKnownTimezone()).toBe('America/New_York');
    expect(readEffectiveTimezone()).toBe('America/New_York');
  });
});
