import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { Season } from '@go-gather/shared';
import { db } from './db.js';
import { sendFcmMulticast } from './fcm.js';
import {
  clampTextWithEllipsis,
  clampTitleWithSuffix,
  MAX_NOTIFICATION_BODY,
  MAX_NOTIFICATION_TITLE,
} from './notification-copy-policy.js';
import { generateSeasonDailyBonusCandidateEvents } from './season-daily-bonus-notifications.util.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const DEFAULT_LOOKBACK_MINUTES = 60;
const DEFAULT_TIMEZONE = 'UTC';
/** Longest multi-day event, in local days, that still gets a reminder on
 * each day after its first — a final day the event ends on before its daily
 * start (or fire) time doesn't count. Longer events — week-long raid
 * rotations, GO Battle League seasons, the season itself — only get the
 * start-day notification. Overridable via NOTIFICATION_MULTI_DAY_MAX_SPAN_DAYS
 * (see notification-scheduler-loop.ts). */
export const DEFAULT_MULTI_DAY_MAX_SPAN_DAYS = 4;

export interface CandidateEvent {
  eventId: string;
  eventType: string;
  name: string;
  heading: string;
  start: string;
  /** Absent for synthetic `season-daily-bonus` candidates, which are already
   * single-day. */
  end?: string;
  /** Set only for synthetic `season-daily-bonus` candidates (see
   * season-daily-bonus-notifications.util.ts) — 0=Sunday..6=Saturday,
   * matching `SeasonDailyBonus.dayOfWeek`. */
  dayOfWeek?: number;
}

export interface NotificationPreferences {
  notificationsEnabled: boolean;
  notificationTimedEventOffsetMinutes: number;
  notificationAllDayEventTime: string;
  hiddenEventIds: string[];
  disabledEventTypes: string[];
  disabledSeasonDailyBonusDays: number[];
  notificationMultiDayDailyEnabled: boolean;
}

export interface DueNotification {
  eventId: string;
  eventType: string;
  category: 'timed' | 'all-day';
  eventKey: string;
  notifyAt: Dayjs;
  title: string;
  body: string;
}

/**
 * Pure fire-time computation — no DB, no network — so the DST/timezone
 * classification logic can be unit-tested in isolation. Filtering out
 * hidden/disabled-type events happens here, BEFORE any fire-time math or
 * send attempt, since a push can't be recalled once delivered.
 */
export function computeDueNotifications(
  events: CandidateEvent[],
  settings: NotificationPreferences,
  now: Dayjs,
  effectiveTimezone: string,
  lookbackMinutes: number = DEFAULT_LOOKBACK_MINUTES,
  multiDayMaxSpanDays: number = DEFAULT_MULTI_DAY_MAX_SPAN_DAYS
): DueNotification[] {
  if (!settings.notificationsEnabled) {
    return [];
  }

  const [allDayHour, allDayMinute] = parseTimeOfDay(settings.notificationAllDayEventTime);
  const windowStart = now.subtract(lookbackMinutes, 'minute');
  const isDue = (notifyAt: Dayjs): boolean =>
    !notifyAt.isAfter(now) && !notifyAt.isBefore(windowStart);
  const due: DueNotification[] = [];

  for (const event of events) {
    if (settings.hiddenEventIds.includes(event.eventId)) {
      continue;
    }
    if (settings.disabledEventTypes.includes(event.eventType)) {
      continue;
    }
    if (
      event.eventType === 'season-daily-bonus' &&
      event.dayOfWeek !== undefined &&
      settings.disabledSeasonDailyBonusDays.includes(event.dayOfWeek)
    ) {
      continue;
    }

    const startInTz = parseInTimezone(event.start, effectiveTimezone);

    // "All-day" is defined on the CONVERTED local time, never raw UTC — a
    // start that's midnight UTC but not midnight in effectiveTimezone is
    // still a timed event.
    const isAllDay = startInTz.hour() === 0 && startInTz.minute() === 0;
    const category: 'timed' | 'all-day' = isAllDay ? 'all-day' : 'timed';
    const fireTimeFor = (occurrenceStart: Dayjs): Dayjs =>
      isAllDay
        ? occurrenceStart
            .startOf('day')
            .hour(allDayHour)
            .minute(allDayMinute)
            .second(0)
            .millisecond(0)
        : occurrenceStart.subtract(settings.notificationTimedEventOffsetMinutes, 'minute');
    const body = clampTextWithEllipsis(event.heading || event.eventType, MAX_NOTIFICATION_BODY);

    const startNotifyAt = fireTimeFor(startInTz);
    if (isDue(startNotifyAt)) {
      due.push({
        eventId: event.eventId,
        eventType: event.eventType,
        category,
        // Unchanged from before daily reminders existed, so an in-progress
        // event's already-logged start notification is never re-sent.
        eventKey: `${event.eventId}:${category}`,
        notifyAt: startNotifyAt,
        title: clampTextWithEllipsis(event.name, MAX_NOTIFICATION_TITLE),
        body,
      });
    }

    if (!settings.notificationMultiDayDailyEnabled || !event.end) {
      continue;
    }

    const laterOccurrences = laterDayOccurrences(
      startInTz,
      parseInTimezone(event.end, effectiveTimezone),
      effectiveTimezone,
      multiDayMaxSpanDays,
      fireTimeFor
    );
    const totalDays = laterOccurrences.length + 1;

    laterOccurrences.forEach((occurrence, index) => {
      if (!isDue(occurrence.notifyAt)) {
        return;
      }
      due.push({
        eventId: event.eventId,
        eventType: event.eventType,
        category,
        eventKey: `${event.eventId}:${category}:${occurrence.date}`,
        notifyAt: occurrence.notifyAt,
        title: clampTitleWithSuffix({
          baseTitle: event.name,
          suffix: `Day ${String(index + 2)}/${String(totalDays)}`,
        }),
        body,
      });
    });
  }

  return due;
}

/** Matches the client's parseEventDate(): a 'Z'-suffixed timestamp is UTC
 * and must be converted into the device's timezone; a bare timestamp is
 * already expressed in that timezone. */
function parseInTimezone(value: string, effectiveTimezone: string): Dayjs {
  return value.endsWith('Z')
    ? dayjs.utc(value).tz(effectiveTimezone)
    : dayjs.tz(value, effectiveTimezone);
}

interface DayOccurrence {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  notifyAt: Dayjs;
}

/**
 * Each local calendar day after the first that a multi-day event covers,
 * with the event's start clock time projected onto it (Wild Area's 10:00 on
 * both days) and turned into a fire time by `fireTimeFor`. A day is dropped
 * when the event has ended by its projected start or by its fire time (e.g.
 * an event ending 09:59, or an all-day event ending before the all-day
 * notification time) — only the last calendar day can be dropped this way.
 * Empty for single-day events and when the days that remain, counting the
 * first, exceed `maxSpanDays`.
 *
 * Dates are stepped as plain strings and rebuilt with dayjs.tz() rather than
 * via `.add(n, 'day')` on a zoned instance, which keeps the original UTC
 * offset and lands an hour off when a DST change falls between days.
 */
function laterDayOccurrences(
  startInTz: Dayjs,
  endInTz: Dayjs,
  effectiveTimezone: string,
  maxSpanDays: number,
  fireTimeFor: (occurrenceStart: Dayjs) => Dayjs
): DayOccurrence[] {
  // An end exactly at local midnight belongs to the previous day.
  const firstDate = startInTz.format('YYYY-MM-DD');
  const lastDate = endInTz.subtract(1, 'millisecond').format('YYYY-MM-DD');
  const spanDays = dayjs.utc(lastDate).diff(dayjs.utc(firstDate), 'day') + 1;

  // Dropping the last day is the most that can bring a span under the cap.
  if (spanDays < 2 || spanDays - 1 > maxSpanDays) {
    return [];
  }

  const clockTime = startInTz.format('HH:mm:ss');
  const occurrences: DayOccurrence[] = [];
  for (let offset = 1; offset < spanDays; offset++) {
    const date = dayjs.utc(firstDate).add(offset, 'day').format('YYYY-MM-DD');
    const start = dayjs.tz(`${date}T${clockTime}`, effectiveTimezone);
    const notifyAt = fireTimeFor(start);
    if (!start.isBefore(endInTz) || !notifyAt.isBefore(endInTz)) {
      continue;
    }
    occurrences.push({ date, notifyAt });
  }

  return occurrences.length + 1 > maxSpanDays ? [] : occurrences;
}

function parseTimeOfDay(value: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return [9, 0];
  }
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return [9, 0];
  }
  return [hour, minute];
}

interface SettingsRow {
  notifications_enabled: number;
  notification_timed_event_offset_minutes: number;
  notification_all_day_event_time: string;
  hidden_event_ids: string;
  disabled_event_types: string;
  disabled_season_daily_bonus_days: string;
  notification_multi_day_daily_enabled: number;
}

interface EventRow {
  event_id: string;
  event_type: string;
  start: string;
  end: string;
  payload: string;
}

function readSettings(): NotificationPreferences | null {
  const row = db
    .prepare(
      `SELECT notifications_enabled, notification_timed_event_offset_minutes,
              notification_all_day_event_time, hidden_event_ids, disabled_event_types,
              disabled_season_daily_bonus_days, notification_multi_day_daily_enabled
       FROM user_settings WHERE id = 1`
    )
    .get() as SettingsRow | undefined;

  if (!row) {
    return null;
  }

  return {
    notificationsEnabled: !!row.notifications_enabled,
    notificationTimedEventOffsetMinutes: row.notification_timed_event_offset_minutes,
    notificationAllDayEventTime: row.notification_all_day_event_time,
    hiddenEventIds: JSON.parse(row.hidden_event_ids) as string[],
    disabledEventTypes: JSON.parse(row.disabled_event_types) as string[],
    disabledSeasonDailyBonusDays: JSON.parse(row.disabled_season_daily_bonus_days) as number[],
    notificationMultiDayDailyEnabled: !!row.notification_multi_day_daily_enabled,
  };
}

/** Timezone of the most recently seen device with an active push token, or
 * null when none has reported one (web-only use, or notifications never
 * enabled) — callers choose their own fallback. */
export function readKnownTimezone(): string | null {
  const row = db
    .prepare(
      `SELECT timezone FROM fcm_tokens
       WHERE is_active = 1 AND timezone IS NOT NULL
       ORDER BY last_seen_at DESC LIMIT 1`
    )
    .get() as { timezone: string } | undefined;

  return row?.timezone ?? null;
}

export function readEffectiveTimezone(): string {
  return readKnownTimezone() ?? DEFAULT_TIMEZONE;
}

function readCandidateEvents(): CandidateEvent[] {
  const rows = db
    .prepare(`SELECT event_id, event_type, start, end, payload FROM pokemon_go_events`)
    .all() as EventRow[];

  return rows.map((row) => {
    const payload = JSON.parse(row.payload) as { name: string; heading: string };
    return {
      eventId: row.event_id,
      eventType: row.event_type,
      start: row.start,
      end: row.end,
      name: payload.name,
      heading: payload.heading,
    };
  });
}

/** Second, parallel candidate source computed from the season feed rather
 * than `pokemon_go_events` — see season-daily-bonus-notifications.util.ts
 * for why daily bonuses are synthesized here instead of persisted as rows. */
function readSeasonDailyBonusCandidateEvents(): CandidateEvent[] {
  const row = db.prepare(`SELECT payload FROM pokemon_go_season WHERE id = 1`).get() as
    { payload: string } | undefined;

  if (!row) {
    return [];
  }

  const season = JSON.parse(row.payload) as Season;
  return generateSeasonDailyBonusCandidateEvents(season);
}

/**
 * Reserves and sends every currently-due notification. Reservation happens
 * BEFORE the send attempt so a scheduler restart/re-run never double-sends;
 * the reservation is only released again if the send outright failed (not
 * merely because every token was already invalid), allowing a legitimate
 * retry next tick.
 */
export async function checkAndSendDueNotifications(
  multiDayMaxSpanDays: number = DEFAULT_MULTI_DAY_MAX_SPAN_DAYS
): Promise<void> {
  const settings = readSettings();
  if (!settings || !settings.notificationsEnabled) {
    return;
  }

  const effectiveTimezone = readEffectiveTimezone();
  const events = [...readCandidateEvents(), ...readSeasonDailyBonusCandidateEvents()];
  const now = dayjs();
  const due = computeDueNotifications(
    events,
    settings,
    now,
    effectiveTimezone,
    DEFAULT_LOOKBACK_MINUTES,
    multiDayMaxSpanDays
  );

  for (const notification of due) {
    const reservation = db
      .prepare(
        `INSERT INTO notification_log (event_id, category, event_key, sent_count, created_at)
         VALUES (@eventId, @category, @eventKey, 0, @now)
         ON CONFLICT(event_key) DO NOTHING`
      )
      .run({
        eventId: notification.eventId,
        category: notification.category,
        eventKey: notification.eventKey,
        now: new Date().toISOString(),
      });

    if (reservation.changes !== 1) {
      continue;
    }

    const tokenRows = db.prepare(`SELECT token FROM fcm_tokens WHERE is_active = 1`).all() as {
      token: string;
    }[];
    const tokens = tokenRows.map((row) => row.token);

    const result = await sendFcmMulticast(tokens, {
      title: notification.title,
      body: notification.body,
      data: {
        eventId: notification.eventId,
        eventType: notification.eventType,
        route: '/tabs/calendar',
      },
    });

    db.prepare(
      `UPDATE notification_log SET sent_count = @sentCount WHERE event_key = @eventKey`
    ).run({ sentCount: result.successCount, eventKey: notification.eventKey });

    const allFailuresWereInvalidTokens =
      tokens.length > 0 && result.invalidTokens.length === tokens.length;
    if (result.successCount === 0 && tokens.length > 0 && !allFailuresWereInvalidTokens) {
      db.prepare(`DELETE FROM notification_log WHERE event_key = @eventKey`).run({
        eventKey: notification.eventKey,
      });
    }

    if (result.invalidTokens.length > 0) {
      const placeholders = result.invalidTokens.map(() => '?').join(',');
      db.prepare(
        `UPDATE fcm_tokens SET is_active = 0, updated_at = ? WHERE token IN (${placeholders})`
      ).run(new Date().toISOString(), ...result.invalidTokens);
    }
  }
}
