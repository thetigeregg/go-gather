/**
 * Last-good copies of the availability data parsed from Bulbapedia (see
 * bulbapedia.ts), one row per dataset in `availability_sources`. The catalog
 * sync reads releases from here rather than from Bulbapedia directly, so an
 * outage or a page-layout change only stops that dataset from updating — it
 * never blocks the catalog sync, and other datasets keep updating.
 *
 * Takes the database handle as a parameter instead of importing db.ts
 * (which opens the real SQLite file on import), so tests can run against an
 * in-memory database. sync.ts and sync-availability.ts pass db.ts's handle.
 */
import type { Database } from 'better-sqlite3';
import {
  AVAILABILITY_DATASETS,
  fetchWikitext,
  type AvailabilityDataset,
  type DatedMaxRelease,
  type MaxRelease,
  type MaxReleases,
} from './bulbapedia.js';

/** Included in db.ts's initSchema(). `payload` (a JSON `DatedMaxRelease[]`)
 * and `fetched_at` only change on a successful parse; `last_attempt_at` and
 * `last_error` record every attempt, for a future sync-status view. */
export const AVAILABILITY_SOURCES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS availability_sources (
    dataset TEXT PRIMARY KEY,
    payload TEXT,
    fetched_at TEXT,
    last_attempt_at TEXT NOT NULL,
    last_error TEXT
  );
`;

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_DAYS = 7;

interface AvailabilitySourceRow {
  payload: string | null;
  fetched_at: string | null;
  last_error: string | null;
}

/**
 * Fetches each Bulbapedia page once and saves every dataset parsed from it.
 * A fetch or parse failure is recorded against that dataset (keeping its
 * previous payload) and logged — never thrown — so callers can always go
 * on to read whatever data is saved.
 */
export async function syncAvailability(
  database: Database,
  fetchPage: (page: string) => Promise<string> = fetchWikitext,
  now: Date = new Date()
): Promise<void> {
  const attemptedAt = now.toISOString();
  const pages = new Map<string, Promise<string>>();
  const saveSuccess = database.prepare(`
    INSERT INTO availability_sources (dataset, payload, fetched_at, last_attempt_at, last_error)
    VALUES (@dataset, @payload, @attemptedAt, @attemptedAt, NULL)
    ON CONFLICT(dataset) DO UPDATE SET
      payload = excluded.payload,
      fetched_at = excluded.fetched_at,
      last_attempt_at = excluded.last_attempt_at,
      last_error = NULL
  `);
  const saveFailure = database.prepare(`
    INSERT INTO availability_sources (dataset, payload, fetched_at, last_attempt_at, last_error)
    VALUES (@dataset, NULL, NULL, @attemptedAt, @error)
    ON CONFLICT(dataset) DO UPDATE SET
      last_attempt_at = excluded.last_attempt_at,
      last_error = excluded.last_error
  `);

  for (const { dataset, page, parse } of AVAILABILITY_DATASETS) {
    try {
      let wikitext = pages.get(page);
      if (!wikitext) {
        wikitext = fetchPage(page);
        pages.set(page, wikitext);
      }
      const releases = parse(await wikitext);
      saveSuccess.run({ dataset, payload: JSON.stringify(releases), attemptedAt });
      console.log(`Availability ${dataset}: ${String(releases.length)} entries saved.`);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      saveFailure.run({ dataset, attemptedAt, error });
      console.warn(`Availability ${dataset}: update failed, keeping saved data — ${error}`);
    }
  }
}

/** `YYYY-MM-DD` of `date` in `timeZone` — the server's own zone by default
 * (docker-compose.yml sets `TZ`), since Bulbapedia's dates are event dates,
 * not UTC dates. */
export function localDate(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function loadDataset(
  database: Database,
  dataset: AvailabilityDataset,
  asOf: Date,
  timeZone: string | undefined
): MaxRelease[] {
  const row = database
    .prepare('SELECT payload, fetched_at, last_error FROM availability_sources WHERE dataset = ?')
    .get(dataset) as AvailabilitySourceRow | undefined;
  // With nothing saved yet there's no way to tell "Bulbapedia unreachable"
  // apart from "nothing released", so this is the one case that still has
  // to stop the catalog sync.
  if (!row?.payload || !row.fetched_at) {
    throw new Error(
      `No saved ${dataset} availability yet — Bulbapedia has never been fetched successfully (last error: ${row?.last_error ?? 'none recorded'}).`
    );
  }

  const ageDays = Math.floor((asOf.getTime() - Date.parse(row.fetched_at)) / DAY_MS);
  if (ageDays >= STALE_AFTER_DAYS) {
    console.warn(
      `Availability ${dataset}: saved data is ${String(ageDays)} days old (last error: ${row.last_error ?? 'none'}).`
    );
  }

  // Announced releases count from their release date, so they still go
  // live on schedule even while Bulbapedia can't be reached.
  const today = localDate(asOf, timeZone);
  const saved = JSON.parse(row.payload) as DatedMaxRelease[];
  const released = saved.filter((release) => release.releasedOn <= today);
  console.log(
    `Availability ${dataset}: ${String(released.length)} released, ${String(saved.length - released.length)} upcoming (data from ${row.fetched_at}).`
  );
  return released.map(({ dexNr, form }) => ({ dexNr, form }));
}

/** Releases out as of `asOf`, read from the saved datasets. Throws only if a
 * dataset has never been fetched successfully. */
export function loadMaxReleases(database: Database, asOf: Date, timeZone?: string): MaxReleases {
  return {
    dynamax: loadDataset(database, 'dynamax', asOf, timeZone),
    gigantamax: loadDataset(database, 'gigantamax', asOf, timeZone),
  };
}
