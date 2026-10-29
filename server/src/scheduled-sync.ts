import type { FastifyBaseLogger } from 'fastify';
import { availabilityStatus } from './availability-store.js';
import { db } from './db.js';
import { main as syncCatalog } from './sync.js';
import { main as syncCalendarEvents } from './sync-calendar-events.js';
import { main as syncSeason } from './sync-season.js';
import { main as syncPokemonStats } from './sync-pokemon-stats.js';
import { availabilityHealth, updateSyncHealth, type HealthCheck } from './sync-health.js';

const HOUR_MS = 60 * 60 * 1000;

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export interface ScheduledJob {
  name: string;
  run: () => Promise<void>;
  intervalHours: number;
  /** Health of the sources the job updates beyond itself — checked after
   * every run, even a failed one, since some may have updated first. */
  checkHealth?: () => HealthCheck[];
}

/**
 * Events/season rotate roughly weekly in-game, so a shorter default interval
 * keeps them fresh; the catalog and pokemon-stats reference data only change
 * alongside real game content updates, so a daily default is plenty.
 *
 * Order matters for the startup pass (see startScheduledSync): catalog is by
 * far the heaviest job (fetches the full pokedex, then downloads thousands
 * of sprites on a cold cache), so it runs last — otherwise it'd block the
 * three lightweight JSON-only feeds (including calendar-events, the one
 * that actually motivated this feature) for minutes on a fresh deploy.
 */
function buildJobs(): ScheduledJob[] {
  return [
    {
      name: 'calendar-events',
      run: syncCalendarEvents,
      intervalHours: readPositiveIntegerEnv('SYNC_CALENDAR_EVENTS_INTERVAL_HOURS', 6),
    },
    {
      name: 'season',
      run: syncSeason,
      intervalHours: readPositiveIntegerEnv('SYNC_SEASON_INTERVAL_HOURS', 6),
    },
    {
      name: 'pokemon-stats',
      run: syncPokemonStats,
      intervalHours: readPositiveIntegerEnv('SYNC_POKEMON_STATS_INTERVAL_HOURS', 24),
    },
    {
      name: 'catalog',
      run: syncCatalog,
      intervalHours: readPositiveIntegerEnv('SYNC_CATALOG_INTERVAL_HOURS', 24),
      // The catalog sync records Bulbapedia failures per dataset and carries
      // on with the saved data, so they never fail the job itself.
      checkHealth: () => availabilityStatus(db).map(availabilityHealth),
    },
  ];
}

/**
 * Runs one job, then records its health and that of the sources it updates
 * (see sync-health.ts). A run that succeeded while one of those sources
 * failed logs at `warn`, so it can't pass for a clean run.
 */
export async function runJob(job: ScheduledJob, logger: FastifyBaseLogger): Promise<void> {
  const startedAt = Date.now();
  logger.info({ job: job.name }, 'scheduled sync starting');
  const source = `job:${job.name}`;
  let jobHealth: HealthCheck = { source, state: 'ok' };
  try {
    await job.run();
  } catch (err: unknown) {
    logger.error(
      { job: job.name, durationMs: Date.now() - startedAt, err },
      'scheduled sync failed'
    );
    jobHealth = {
      source,
      state: 'failing',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  const durationMs = Date.now() - startedAt;

  let unhealthy: HealthCheck[] = [];
  try {
    unhealthy = await updateSyncHealth(db, [jobHealth, ...(job.checkHealth?.() ?? [])], {
      logger,
    });
  } catch (err: unknown) {
    logger.error({ job: job.name, err }, 'sync health check failed');
  }

  if (jobHealth.state !== 'ok') {
    return;
  }
  if (unhealthy.length > 0) {
    logger.warn(
      { job: job.name, durationMs, unhealthy: unhealthy.map((check) => check.source) },
      'scheduled sync completed with failures'
    );
  } else {
    logger.info({ job: job.name, durationMs }, 'scheduled sync completed');
  }
}

/**
 * Runs all data-feed syncs once at startup (so a fresh deploy — empty
 * SQLite file, no NAS data volume yet — is immediately usable instead of
 * showing empty calendar/catalog data until someone remembers to run the
 * manual `npm run sync*` scripts), then keeps re-running each on its own
 * interval. One feed failing (rate limit, upstream outage) never blocks the
 * others or crashes the server — see runJob's catch.
 */
export function startScheduledSync(logger: FastifyBaseLogger): () => void {
  const jobs = buildJobs();

  // Sequential at startup — avoids hammering multiple external hosts at once
  // the moment the container comes up. Fired without awaiting here so it
  // never delays app.listen().
  void (async () => {
    for (const job of jobs) {
      await runJob(job, logger);
    }
  })();

  const timers = jobs.map((job) =>
    setInterval(() => {
      void runJob(job, logger);
    }, job.intervalHours * HOUR_MS)
  );

  return function stopScheduledSync(): void {
    for (const timer of timers) {
      clearInterval(timer);
    }
  };
}
