import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { db } from './db.js';
import { sendFcmMulticast } from './fcm.js';
import {
  clampTextWithEllipsis,
  MAX_NOTIFICATION_BODY,
  MAX_NOTIFICATION_TITLE,
} from './notification-copy-policy.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const DEFAULT_LOOKBACK_MINUTES = 60;
const DEFAULT_TIMEZONE = 'UTC';

export interface CandidateEvent {
  eventId: string;
  eventType: string;
  name: string;
  heading: string;
  start: string;
}

export interface NotificationPreferences {
  notificationsEnabled: boolean;
  notificationTimedEventOffsetMinutes: number;
  notificationAllDayEventTime: string;
  hiddenEventIds: string[];
  disabledEventTypes: string[];
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
  lookbackMinutes: number = DEFAULT_LOOKBACK_MINUTES
): DueNotification[] {
  if (!settings.notificationsEnabled) {
    return [];
  }

  const [allDayHour, allDayMinute] = parseTimeOfDay(settings.notificationAllDayEventTime);
  const due: DueNotification[] = [];

  for (const event of events) {
    if (settings.hiddenEventIds.includes(event.eventId)) {
      continue;
    }
    if (settings.disabledEventTypes.includes(event.eventType)) {
      continue;
    }

    // Matches the client's parseEventDate(): a 'Z'-suffixed timestamp is
    // UTC and must be converted into the device's timezone; a bare
    // timestamp is already expressed in that timezone.
    const startInTz = event.start.endsWith('Z')
      ? dayjs.utc(event.start).tz(effectiveTimezone)
      : dayjs.tz(event.start, effectiveTimezone);

    // "All-day" is defined on the CONVERTED local time, never raw UTC — a
    // start that's midnight UTC but not midnight in effectiveTimezone is
    // still a timed event.
    const isAllDay = startInTz.hour() === 0 && startInTz.minute() === 0;
    const category: 'timed' | 'all-day' = isAllDay ? 'all-day' : 'timed';
    const notifyAt = isAllDay
      ? startInTz.startOf('day').hour(allDayHour).minute(allDayMinute).second(0).millisecond(0)
      : startInTz.subtract(settings.notificationTimedEventOffsetMinutes, 'minute');

    if (notifyAt.isAfter(now)) {
      continue;
    }
    if (notifyAt.isBefore(now.subtract(lookbackMinutes, 'minute'))) {
      continue;
    }

    due.push({
      eventId: event.eventId,
      eventType: event.eventType,
      category,
      eventKey: `${event.eventId}:${category}`,
      notifyAt,
      title: clampTextWithEllipsis(event.name, MAX_NOTIFICATION_TITLE),
      body: clampTextWithEllipsis(event.heading || event.eventType, MAX_NOTIFICATION_BODY),
    });
  }

  return due;
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
}

interface EventRow {
  event_id: string;
  event_type: string;
  start: string;
  payload: string;
}

function readSettings(): NotificationPreferences | null {
  const row = db
    .prepare(
      `SELECT notifications_enabled, notification_timed_event_offset_minutes,
              notification_all_day_event_time, hidden_event_ids, disabled_event_types
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
  };
}

function readEffectiveTimezone(): string {
  const row = db
    .prepare(
      `SELECT timezone FROM fcm_tokens
       WHERE is_active = 1 AND timezone IS NOT NULL
       ORDER BY last_seen_at DESC LIMIT 1`
    )
    .get() as { timezone: string } | undefined;

  return row?.timezone ?? DEFAULT_TIMEZONE;
}

function readCandidateEvents(): CandidateEvent[] {
  const rows = db
    .prepare(`SELECT event_id, event_type, start, payload FROM pokemon_go_events`)
    .all() as EventRow[];

  return rows.map((row) => {
    const payload = JSON.parse(row.payload) as { name: string; heading: string };
    return {
      eventId: row.event_id,
      eventType: row.event_type,
      start: row.start,
      name: payload.name,
      heading: payload.heading,
    };
  });
}

/**
 * Reserves and sends every currently-due notification. Reservation happens
 * BEFORE the send attempt so a scheduler restart/re-run never double-sends;
 * the reservation is only released again if the send outright failed (not
 * merely because every token was already invalid), allowing a legitimate
 * retry next tick.
 */
export async function checkAndSendDueNotifications(): Promise<void> {
  const settings = readSettings();
  if (!settings || !settings.notificationsEnabled) {
    return;
  }

  const effectiveTimezone = readEffectiveTimezone();
  const events = readCandidateEvents();
  const now = dayjs();
  const due = computeDueNotifications(events, settings, now, effectiveTimezone);

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
