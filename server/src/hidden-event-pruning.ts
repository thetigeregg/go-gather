import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { UserSettings } from '@go-gather/shared';
import { db } from './db.js';
import { readEffectiveTimezone } from './notification-scheduler.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export interface StoredEventEnd {
  eventId: string;
  end: string;
}

/** Client-generated pseudo-event IDs: `${parent}-<kind>-YYYY-MM-DD[-index]`
 * (see the app's calendar-sub-events.util.ts and
 * timeline-season-daily-bonus-events.util.ts). The server never stores these,
 * so they're resolved through their parent event and their own date. */
const PSEUDO_EVENT_ID =
  /^(.+)-(?:raid-hour|spotlight-hour|daily-bonus)-(\d{4}-\d{2}-\d{2})(?:-\d+)?$/;

/** Same rule as the app's parseEventDate()/the notification scheduler: a
 * 'Z'-suffixed timestamp is UTC, a bare one is wall-clock time in the
 * user's timezone. */
function parseInTimezone(value: string, effectiveTimezone: string): Dayjs {
  return value.endsWith('Z')
    ? dayjs.utc(value).tz(effectiveTimezone)
    : dayjs.tz(value, effectiveTimezone);
}

/**
 * Pure: hidden IDs to drop because their event has ended, or because they
 * match no event in `events` at all — the calendar sync replaces the whole
 * events table from the feed, so an ID the feed has dropped can never match
 * again. A pseudo-event (raid hour, spotlight hour, season daily bonus)
 * counts as ended once its own day is over in `effectiveTimezone`, and as an
 * orphan once its parent is gone.
 *
 * An empty `events` list means the table hasn't been populated (fresh
 * database), not that every event is gone, so nothing is reported then.
 */
export function findExpiredHiddenEventIds(
  hiddenEventIds: readonly string[],
  events: readonly StoredEventEnd[],
  now: Dayjs,
  effectiveTimezone: string
): string[] {
  if (hiddenEventIds.length === 0 || events.length === 0) {
    return [];
  }

  const endById = new Map(events.map((event) => [event.eventId, event.end]));

  return hiddenEventIds.filter((eventId) => {
    const end = endById.get(eventId);
    if (end !== undefined) {
      return parseInTimezone(end, effectiveTimezone).isBefore(now);
    }

    const pseudo = PSEUDO_EVENT_ID.exec(eventId);
    if (pseudo && endById.has(pseudo[1])) {
      return dayjs.tz(pseudo[2], effectiveTimezone).endOf('day').isBefore(now);
    }

    return true;
  });
}

/**
 * Drops expired hidden IDs from the server's settings and appends a settings
 * change to `sync_events`, so devices pick up the shorter list on their next
 * pull. Runs right after a successful calendar sync, against the freshly
 * replaced events table and the server clock.
 *
 * The appended payload is the latest synced settings payload with only
 * `hiddenEventIds` changed — every other field stays exactly as the user last
 * synced it. With no settings change ever synced, `hidden_event_ids` is still
 * the seeded empty list, so there is nothing to prune.
 *
 * Returns how many IDs were removed.
 */
export function pruneExpiredHiddenEvents(now: Dayjs = dayjs()): number {
  const prune = db.transaction((): number => {
    const latest = db
      .prepare(
        `SELECT payload FROM sync_events WHERE entity_type = 'settings'
         ORDER BY event_id DESC LIMIT 1`
      )
      .get() as { payload: string } | undefined;
    if (!latest) {
      return 0;
    }

    const settings = JSON.parse(latest.payload) as UserSettings;
    const events = (
      db.prepare(`SELECT event_id, end FROM pokemon_go_events`).all() as {
        event_id: string;
        end: string;
      }[]
    ).map((row) => ({ eventId: row.event_id, end: row.end }));

    const expired = new Set(
      findExpiredHiddenEventIds(settings.hiddenEventIds, events, now, readEffectiveTimezone())
    );
    if (expired.size === 0) {
      return 0;
    }

    const pruned: UserSettings = {
      ...settings,
      hiddenEventIds: settings.hiddenEventIds.filter((id) => !expired.has(id)),
    };

    db.prepare(`UPDATE user_settings SET hidden_event_ids = @hiddenEventIds WHERE id = 1`).run({
      hiddenEventIds: JSON.stringify(pruned.hiddenEventIds),
    });
    db.prepare(
      `INSERT INTO sync_events (entity_type, entity_key, operation, payload, server_timestamp)
       VALUES ('settings', 'settings', 'upsert', @payload, @serverTimestamp)`
    ).run({ payload: JSON.stringify(pruned), serverTimestamp: new Date().toISOString() });

    return expired.size;
  });

  return prune();
}
