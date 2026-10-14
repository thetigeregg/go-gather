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
  type AvailabilityData,
  type AvailabilityDataset,
} from './bulbapedia.js';

/** Included in db.ts's initSchema(). `payload` (that dataset's JSON array
 * from `AvailabilityData`) and `fetched_at` only change on a successful parse; `last_attempt_at` and
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

/** A dataset has never been fetched successfully, so there's nothing saved
 * to load — the one load failure loadAvailability tolerates for species,
 * Mega and shiny data. */
class NoSavedAvailabilityError extends Error {}

/**
 * Fetches each Bulbapedia page once and saves every dataset parsed from it.
 * A fetch or parse failure is recorded against that dataset (keeping its
 * previous payload) and logged — never thrown — so callers can always go
 * on to read whatever data is saved. Returns the datasets that failed.
 */
export async function syncAvailability(
  database: Database,
  fetchPage: (page: string) => Promise<string> = fetchWikitext,
  now: Date = new Date()
): Promise<AvailabilityDataset[]> {
  const attemptedAt = now.toISOString();
  const failed: AvailabilityDataset[] = [];
  // Every distinct page is fetched at once, before any dataset is parsed,
  // so the requests run in parallel. Each fetch gets a no-op handler right
  // away: a page that fails before the loop reaches it would otherwise be
  // an unhandled rejection, which crashes the server. The loop still awaits
  // each one and records its failure.
  const pages = new Map<string, Promise<string>>();
  const sources = AVAILABILITY_DATASETS.map((source) => {
    let wikitext = pages.get(source.page);
    if (!wikitext) {
      wikitext = fetchPage(source.page);
      wikitext.catch(() => undefined);
      pages.set(source.page, wikitext);
    }
    return { ...source, wikitext };
  });
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

  for (const { dataset, parse, wikitext } of sources) {
    try {
      const releases = parse(await wikitext);
      saveSuccess.run({ dataset, payload: JSON.stringify(releases), attemptedAt });
      console.log(`Availability ${dataset}: ${String(releases.length)} entries saved.`);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      saveFailure.run({ dataset, attemptedAt, error });
      failed.push(dataset);
      console.warn(`Availability ${dataset}: update failed, keeping saved data — ${error}`);
    }
  }
  return failed;
}

function loadDataset<K extends AvailabilityDataset>(
  database: Database,
  dataset: K,
  now: Date
): AvailabilityData[K] {
  const row = database
    .prepare('SELECT payload, fetched_at, last_error FROM availability_sources WHERE dataset = ?')
    .get(dataset) as AvailabilitySourceRow | undefined;
  // With nothing saved yet there's no way to tell "Bulbapedia unreachable"
  // apart from "nothing released", so this is the one case that still has
  // to stop the catalog sync.
  if (!row?.payload || !row.fetched_at) {
    throw new NoSavedAvailabilityError(
      `No saved ${dataset} availability yet — Bulbapedia has never been fetched successfully (last error: ${row?.last_error ?? 'none recorded'}).`
    );
  }

  const ageDays = Math.floor((now.getTime() - Date.parse(row.fetched_at)) / DAY_MS);
  if (ageDays >= STALE_AFTER_DAYS) {
    console.warn(
      `Availability ${dataset}: saved data is ${String(ageDays)} days old (last error: ${row.last_error ?? 'none'}).`
    );
  }

  const saved = JSON.parse(row.payload) as AvailabilityData[K];
  console.log(
    `Availability ${dataset}: ${String(saved.length)} entries (data from ${row.fetched_at}).`
  );
  return saved;
}

/** Datasets that may not have been saved yet without stopping the catalog
 * sync — see loadAvailability. */
type OptionalDataset = 'species' | 'mega' | 'shiny';

/** `AvailabilityData`, except species, Mega and shiny data may not exist
 * yet — see loadAvailability. */
export type LoadedAvailability = Omit<AvailabilityData, OptionalDataset> & {
  [K in OptionalDataset]: AvailabilityData[K] | null;
};

/** Like loadDataset, but returns null (and warns) instead of throwing when
 * the dataset has never been saved. A corrupt payload or a database error
 * still throws: falling back on those would silently date entries wrongly. */
function loadOptionalDataset<K extends OptionalDataset>(
  database: Database,
  dataset: K,
  now: Date,
  fallbackNote: string
): AvailabilityData[K] | null {
  try {
    return loadDataset(database, dataset, now);
  } catch (err: unknown) {
    if (!(err instanceof NoSavedAvailabilityError)) {
      throw err;
    }
    console.warn(`${err.message} ${fallbackNote}`);
    return null;
  }
}

/**
 * Every saved dataset, with release dates kept — including announced
 * releases still in the future. The catalog sync stamps those dates onto
 * catalog entries (release-dates.ts) and the app decides what's out on the
 * device's own date, so nothing here filters by date.
 *
 * Throws if the Dynamax or Gigantamax data has never been fetched
 * successfully, since the DMax/GMax dexes can't be built without it.
 * Species, Mega and shiny data that has never been fetched comes back as null
 * instead, and release-dates.ts falls back to how those entries were dated
 * before that dataset existed, rather than holding up the whole catalog
 * sync (e.g. on the first sync after upgrading) until Bulbapedia parses.
 */
export function loadAvailability(database: Database, now: Date = new Date()): LoadedAvailability {
  return {
    dynamax: loadDataset(database, 'dynamax', now),
    gigantamax: loadDataset(database, 'gigantamax', now),
    species: loadOptionalDataset(
      database,
      'species',
      now,
      'Treating every species as released until it is.'
    ),
    mega: loadOptionalDataset(
      database,
      'mega',
      now,
      "Dating Megas by their species' debut until it is."
    ),
    shiny: loadOptionalDataset(
      database,
      'shiny',
      now,
      'Treating shinies as released along with their Pokemon until it is.'
    ),
  };
}
