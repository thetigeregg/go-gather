import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PogoEvent } from '@go-gather/shared';
import { db, initSchema } from './db.js';

// See pogo-cal's src/stores/events.ts — this is the same live feed pogo-cal
// itself fetches client-side; go-gather instead proxies it through its own
// server so the app never depends on a third-party feed directly (mirrors
// the Pokemon catalog's sync.ts precedent).
const EVENTS_URL =
  'https://raw.githubusercontent.com/Drumstix42/ScrapedDuck/refs/heads/data/events.min.json';

async function fetchEvents(): Promise<PogoEvent[]> {
  const response = await fetch(EVENTS_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch events.min.json: ${String(response.status)} ${response.statusText}`
    );
  }
  // The feed's shape already matches PogoEvent field-for-field (confirmed
  // against a live fetch) — unlike the Pokemon catalog, there's no flattening/
  // backfill transform needed here.
  return (await response.json()) as PogoEvent[];
}

function upsertCalendarEvents(events: readonly PogoEvent[]): void {
  const insert = db.prepare(`
    INSERT INTO pokemon_go_events (event_id, event_type, start, end, payload)
    VALUES (@eventId, @eventType, @start, @end, @payload)
  `);

  const replaceAll = db.transaction((rows: readonly PogoEvent[]) => {
    db.exec('DELETE FROM pokemon_go_events');
    for (const event of rows) {
      insert.run({
        eventId: event.eventID,
        eventType: event.eventType,
        start: event.start,
        end: event.end,
        payload: JSON.stringify(event),
      });
    }
  });

  replaceAll(events);
}

function markCalendarEventsSynced(): void {
  db.prepare(
    `INSERT INTO sync_meta (key, value) VALUES ('calendarEventsSyncedAt', @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run({ value: new Date().toISOString() });
}

export async function main(): Promise<void> {
  initSchema();

  console.log('Fetching events.min.json from ScrapedDuck...');
  const events = await fetchEvents();
  console.log(`Fetched ${String(events.length)} events.`);

  upsertCalendarEvents(events);
  markCalendarEventsSynced();

  console.log(`Synced ${String(events.length)} calendar events.`);
}

// Guarded so this module can be imported (e.g. by scheduled-sync.ts) without
// triggering a sync run as an import side effect — only runs when invoked
// directly, e.g. `tsx src/sync-calendar-events.ts` / `npm run sync:calendar-events`.
const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  main().catch((err: unknown) => {
    console.error('Calendar events sync failed:', err);
    process.exitCode = 1;
  });
}
