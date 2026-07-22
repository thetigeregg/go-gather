import type { FastifyBaseLogger } from 'fastify';
import { main as syncCatalog } from './sync.js';
import { main as syncCalendarEvents } from './sync-calendar-events.js';
import { main as syncSeason } from './sync-season.js';
import { main as syncPokemonStats } from './sync-pokemon-stats.js';

const HOUR_MS = 60 * 60 * 1000;

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

interface ScheduledJob {
  name: string;
  run: () => Promise<void>;
  intervalHours: number;
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
    },
  ];
}

async function runJob(job: ScheduledJob, logger: FastifyBaseLogger): Promise<void> {
  const startedAt = Date.now();
  logger.info({ job: job.name }, 'scheduled sync starting');
  try {
    await job.run();
    logger.info({ job: job.name, durationMs: Date.now() - startedAt }, 'scheduled sync completed');
  } catch (err: unknown) {
    logger.error(
      { job: job.name, durationMs: Date.now() - startedAt, err },
      'scheduled sync failed'
    );
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
