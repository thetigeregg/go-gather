import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
  CandidateEvent,
  NotificationPreferences,
  computeDueNotifications,
} from './notification-scheduler';

dayjs.extend(utc);
dayjs.extend(timezone);

const ZONE = 'America/Chicago';

function baseSettings(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    notificationsEnabled: true,
    notificationTimedEventOffsetMinutes: 15,
    notificationAllDayEventTime: '09:00',
    hiddenEventIds: [],
    disabledEventTypes: [],
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
