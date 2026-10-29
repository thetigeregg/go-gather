import type { FastifyBaseLogger } from 'fastify';
import { AVAILABILITY_SOURCES_SCHEMA } from './availability-store';
import { db } from './db';
import { sendFcmMulticast } from './fcm';
import { runJob, startScheduledSync, type ScheduledJob } from './scheduled-sync';
import { SYNC_HEALTH_SCHEMA } from './sync-health';

vi.mock('./db', async () => {
  const { default: Database } = await import('better-sqlite3');
  return { db: new Database(':memory:') };
});
vi.mock('./fcm', () => ({
  hasConfiguredFcm: () => true,
  sendFcmMulticast: vi.fn(() =>
    Promise.resolve({ successCount: 1, failureCount: 0, invalidTokens: [] })
  ),
}));
vi.mock('./sync', () => ({ main: vi.fn() }));
vi.mock('./sync-calendar-events', () => ({ main: vi.fn() }));
vi.mock('./sync-season', () => ({ main: vi.fn() }));
vi.mock('./sync-pokemon-stats', () => ({ main: vi.fn() }));

const send = vi.mocked(sendFcmMulticast);
let logger: {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

function job(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return { name: 'catalog', run: () => Promise.resolve(), intervalHours: 24, ...overrides };
}

function run(scheduledJob: ScheduledJob): Promise<void> {
  return runJob(scheduledJob, logger as unknown as FastifyBaseLogger);
}

function logMessages(level: 'info' | 'warn' | 'error'): string[] {
  return logger[level].mock.calls.map((call: unknown[]) => call[1] as string);
}

beforeAll(() => {
  db.exec(AVAILABILITY_SOURCES_SCHEMA);
  db.exec(SYNC_HEALTH_SCHEMA);
  db.exec(`
    CREATE TABLE fcm_tokens (
      token TEXT PRIMARY KEY, platform TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
      timezone TEXT, app_version TEXT, user_agent TEXT,
      last_seen_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    INSERT INTO fcm_tokens (token, platform, last_seen_at, created_at, updated_at)
    VALUES ('device-a', 'android', 'x', 'x', 'x');
  `);
});

beforeEach(() => {
  db.exec('DELETE FROM sync_health');
  send.mockClear();
  logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
});

describe('runJob', () => {
  it('logs a clean run as completed at info', async () => {
    await run(job({ checkHealth: () => [{ source: 'availability:species', state: 'ok' }] }));

    expect(logMessages('info')).toEqual(['scheduled sync starting', 'scheduled sync completed']);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('logs a run with an unhealthy source at warn and alerts', async () => {
    await run(
      job({
        checkHealth: () => [{ source: 'availability:species', state: 'failing', detail: 'boom' }],
      })
    );

    expect(logMessages('info')).toEqual(['scheduled sync starting']);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'catalog', unhealthy: ['availability:species'] }),
      'scheduled sync completed with failures'
    );
    expect(send).toHaveBeenCalledWith(
      ['device-a'],
      expect.objectContaining({ title: 'Sync failing: Released Pokémon data', body: 'boom' })
    );
  });

  it('records a failed job, alerts, and still checks the sources it updates', async () => {
    const checkHealth = vi.fn(() => [{ source: 'availability:species', state: 'ok' as const }]);

    await run(
      job({
        name: 'calendar-events',
        run: () => Promise.reject(new Error('ScrapedDuck 503')),
        checkHealth,
      })
    );

    expect(logMessages('error')).toEqual(['scheduled sync failed']);
    expect(logMessages('info')).toEqual(['scheduled sync starting']);
    expect(checkHealth).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      ['device-a'],
      expect.objectContaining({
        title: 'Sync failing: Calendar events sync',
        body: 'ScrapedDuck 503',
      })
    );
    expect(
      db.prepare('SELECT state FROM sync_health WHERE source = ?').get('job:calendar-events')
    ).toEqual({
      state: 'failing',
    });
  });

  it('still records and alerts a failed job when its health check throws', async () => {
    await run(
      job({
        name: 'calendar-events',
        run: () => Promise.reject(new Error('ScrapedDuck 503')),
        checkHealth: () => {
          throw new Error('database locked');
        },
      })
    );

    expect(logMessages('error')).toEqual(['scheduled sync failed', 'sync health check failed']);
    expect(send).toHaveBeenCalledWith(
      ['device-a'],
      expect.objectContaining({ title: 'Sync failing: Calendar events sync' })
    );
    expect(
      db.prepare('SELECT state FROM sync_health WHERE source = ?').get('job:calendar-events')
    ).toEqual({ state: 'failing' });
  });

  it('logs a health check error without letting it escape', async () => {
    await run(
      job({
        checkHealth: () => {
          throw new Error('database locked');
        },
      })
    );

    expect(logMessages('error')).toEqual(['sync health check failed']);
    expect(logMessages('info')).toEqual(['scheduled sync starting', 'scheduled sync completed']);
  });

  it('logs a health update error without letting it escape', async () => {
    db.exec('DROP TABLE sync_health');
    try {
      await run(job({ checkHealth: () => [{ source: 'availability:species', state: 'failing' }] }));
    } finally {
      db.exec(SYNC_HEALTH_SCHEMA);
    }

    expect(logMessages('error')).toEqual(['sync health update failed']);
    expect(logMessages('info')).toEqual(['scheduled sync starting', 'scheduled sync completed']);
  });
});

describe('startScheduledSync', () => {
  afterEach(() => {
    db.exec('DELETE FROM availability_sources');
  });

  it("checks the catalog job's availability datasets", async () => {
    db.prepare(
      `INSERT INTO availability_sources (dataset, fetched_at, last_attempt_at, last_error)
       VALUES ('species', ?, ?, 'boom')`
    ).run(new Date().toISOString(), new Date().toISOString());

    const stop = startScheduledSync(logger as unknown as FastifyBaseLogger);
    try {
      await vi.waitFor(() => {
        expect(send).toHaveBeenCalledWith(
          ['device-a'],
          expect.objectContaining({ title: 'Sync failing: Released Pokémon data', body: 'boom' })
        );
      });
    } finally {
      stop();
    }
  });
});
