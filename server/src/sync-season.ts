import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Season } from '@go-gather/shared';
import { db, initSchema } from './db.js';

// See pogo-cal's src/stores/seasons.ts — a separate feed from events.min.json
// (own URL, own freshness cadence in the source app), kept fully separate
// here too rather than bundled with the calendar-events sync.
const SEASON_URL =
  'https://raw.githubusercontent.com/Drumstix42/ScrapedDuck/refs/heads/data/season.json';

async function fetchSeason(): Promise<Season | null> {
  const response = await fetch(SEASON_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch season.json: ${String(response.status)} ${response.statusText}`
    );
  }
  // Feed is an array (historically could list more than one), but only ever
  // has the current season at any given time — same assumption pogo-cal's
  // own seasons store makes. Shape matches Season field-for-field.
  const seasons = (await response.json()) as Season[];
  return seasons[0] ?? null;
}

function upsertSeason(season: Season): void {
  db.prepare(
    `INSERT INTO pokemon_go_season (id, payload) VALUES (1, @payload)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`
  ).run({ payload: JSON.stringify(season) });
}

function markSeasonSynced(): void {
  db.prepare(
    `INSERT INTO sync_meta (key, value) VALUES ('seasonSyncedAt', @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run({ value: new Date().toISOString() });
}

export async function main(): Promise<void> {
  initSchema();

  console.log('Fetching season.json from ScrapedDuck...');
  const season = await fetchSeason();

  if (!season) {
    console.log('No current season in feed — nothing to sync.');
    return;
  }

  upsertSeason(season);
  markSeasonSynced();

  console.log(`Synced season "${season.name}".`);
}

// Guarded so this module can be imported (e.g. by scheduled-sync.ts) without
// triggering a sync run as an import side effect — only runs when invoked
// directly, e.g. `tsx src/sync-season.ts` / `npm run sync:season`.
const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  main().catch((err: unknown) => {
    console.error('Season sync failed:', err);
    process.exitCode = 1;
  });
}
