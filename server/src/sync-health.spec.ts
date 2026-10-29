import type { AvailabilityStatus } from '@go-gather/shared';
import BetterSqlite3 from 'better-sqlite3';
import type { FcmSendPayload, FcmSendResult } from './fcm';
import {
  SYNC_HEALTH_SCHEMA,
  alertMessage,
  availabilityHealth,
  transition,
  updateSyncHealth,
  type HealthCheck,
} from './sync-health';

const NOW = new Date('2026-10-29T16:00:00Z');

let database: BetterSqlite3.Database;
type LogMock = ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;

let logger: { warn: LogMock; error: LogMock };
let send: ReturnType<
  typeof vi.fn<(tokens: string[], payload: FcmSendPayload) => Promise<FcmSendResult>>
>;

function sent(successCount = 1, invalidTokens: string[] = []): FcmSendResult {
  return { successCount, failureCount: invalidTokens.length, invalidTokens };
}

function addToken(token: string, isActive = 1): void {
  database
    .prepare(
      `INSERT INTO fcm_tokens (token, platform, is_active, last_seen_at, created_at, updated_at)
       VALUES (?, 'android', ?, 'x', 'x', 'x')`
    )
    .run(token, isActive);
}

function storedState(source: string): { state: string; detail: string | null } | undefined {
  return database.prepare('SELECT state, detail FROM sync_health WHERE source = ?').get(source) as
    { state: string; detail: string | null } | undefined;
}

function update(checks: HealthCheck[], isFcmConfigured = () => true) {
  return updateSyncHealth(database, checks, { logger, send, isFcmConfigured, now: NOW });
}

const speciesFailing: HealthCheck = {
  source: 'availability:species',
  state: 'failing',
  detail: 'Bulbapedia: species 772 are neither dated nor listed as unreleased',
};

beforeEach(() => {
  database = new BetterSqlite3(':memory:');
  database.exec(SYNC_HEALTH_SCHEMA);
  database.exec(`
    CREATE TABLE fcm_tokens (
      token TEXT PRIMARY KEY, platform TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
      timezone TEXT, app_version TEXT, user_agent TEXT,
      last_seen_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  addToken('device-a');
  logger = {
    warn: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
  };
  send = vi.fn(() => Promise.resolve(sent()));
});

describe('availabilityHealth', () => {
  function status(overrides: Partial<AvailabilityStatus>): AvailabilityStatus {
    return {
      dataset: 'species',
      fetchedAt: '2026-10-28T10:00:00Z',
      lastAttemptAt: '2026-10-29T10:00:00Z',
      lastError: null,
      stale: false,
      ...overrides,
    };
  }

  it.each([
    [{}, { state: 'ok' }],
    [{ lastError: 'boom' }, { state: 'failing', detail: 'boom' }],
    [
      { lastError: 'boom', stale: true },
      { state: 'stale', detail: 'boom' },
    ],
    [{ stale: true }, { state: 'stale', detail: null }],
    [
      { fetchedAt: null, lastError: 'never parsed' },
      { state: 'failing', detail: 'never parsed' },
    ],
  ])('maps %j to %j', (overrides, expected) => {
    expect(availabilityHealth(status(overrides))).toEqual({
      source: 'availability:species',
      ...expected,
    });
  });
});

describe('transition', () => {
  it.each([
    [undefined, 'ok', null],
    [undefined, 'failing', 'failing'],
    ['ok', 'failing', 'failing'],
    ['ok', 'stale', 'stale'],
    ['failing', 'stale', 'stale'],
    ['failing', 'failing', null],
    ['failing', 'ok', 'recovered'],
    ['stale', 'ok', 'recovered'],
  ] as const)('%s → %s alerts %s', (previous, current, expected) => {
    expect(transition(previous, current)).toBe(expected);
  });
});

describe('alertMessage', () => {
  it('names a single failing source and includes its error', () => {
    expect(alertMessage('failing', [speciesFailing])).toEqual({
      title: 'Sync failing: Species data',
      body: speciesFailing.detail,
    });
  });

  it('truncates a long error', () => {
    const { body } = alertMessage('failing', [{ ...speciesFailing, detail: 'x'.repeat(400) }]);

    expect(body).toHaveLength(150);
    expect(body.endsWith('…')).toBe(true);
  });

  it('lists every source in a grouped alert', () => {
    expect(
      alertMessage('failing', [
        speciesFailing,
        { source: 'availability:unreleasedForms', state: 'failing', detail: 'boom' },
        { source: 'job:calendar-events', state: 'failing' },
      ]).title
    ).toBe('Sync failing: Species data, Unreleased forms data, Calendar events sync');
  });

  it('falls back to the raw name for an unknown source', () => {
    expect(alertMessage('recovered', [{ source: 'job:new-feed', state: 'ok' }]).title).toBe(
      'Sync recovered: new-feed sync'
    );
  });

  it.each([
    ['stale', 'Over a week old: Species data'],
    ['recovered', 'Sync recovered: Species data'],
  ] as const)('titles a %s alert', (kind, title) => {
    expect(alertMessage(kind, [{ source: 'availability:species', state: 'ok' }]).title).toBe(title);
  });
});

describe('updateSyncHealth', () => {
  it('alerts once when a source starts failing, not on later runs', async () => {
    await update([speciesFailing]);
    await update([speciesFailing]);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(['device-a'], {
      title: 'Sync failing: Species data',
      body: speciesFailing.detail,
      data: { kind: 'sync-health', route: '/settings' },
    });
    expect(storedState('availability:species')).toEqual({
      state: 'failing',
      detail: speciesFailing.detail,
    });
  });

  it('logs every unhealthy source at warn on every run', async () => {
    const jobOk: HealthCheck = { source: 'job:catalog', state: 'ok' };

    await update([jobOk, speciesFailing]);
    const unhealthy = await update([jobOk, speciesFailing]);

    expect(unhealthy).toEqual([speciesFailing]);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      { source: 'availability:species', state: 'failing', detail: speciesFailing.detail },
      'sync source unhealthy'
    );
  });

  it('sends nothing for a source that has always been ok', async () => {
    await update([{ source: 'job:catalog', state: 'ok' }]);

    expect(send).not.toHaveBeenCalled();
    expect(storedState('job:catalog')).toBeUndefined();
  });

  it('escalates once to stale, then alerts on recovery', async () => {
    await update([speciesFailing]);
    await update([{ ...speciesFailing, state: 'stale' }]);
    await update([{ source: 'availability:species', state: 'ok' }]);

    expect(send.mock.calls.map(([, payload]) => payload.title)).toEqual([
      'Sync failing: Species data',
      'Over a week old: Species data',
      'Sync recovered: Species data',
    ]);
    expect(storedState('availability:species')?.state).toBe('ok');
  });

  it('groups sources making the same change into one push per kind', async () => {
    await update([{ source: 'availability:shiny', state: 'failing' }]);
    send.mockClear();

    await update([
      speciesFailing,
      { source: 'availability:mega', state: 'failing', detail: 'boom' },
      { source: 'availability:shiny', state: 'ok' },
    ]);

    expect(send.mock.calls.map(([, payload]) => payload.title)).toEqual([
      'Sync failing: Species data, Mega data',
      'Sync recovered: Shiny data',
    ]);
  });

  it('only sends to active devices', async () => {
    addToken('device-b');
    addToken('device-old', 0);

    await update([speciesFailing]);

    expect(send).toHaveBeenCalledWith(['device-a', 'device-b'], expect.anything());
  });

  it('retries an alert that reached no device', async () => {
    send.mockResolvedValueOnce(sent(0));

    await update([speciesFailing]);
    expect(storedState('availability:species')).toBeUndefined();

    await update([speciesFailing]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(storedState('availability:species')?.state).toBe('failing');
  });

  it('retries an alert whose send threw, logging the error', async () => {
    send.mockRejectedValueOnce(new Error('network down'));

    await update([speciesFailing]);

    expect(storedState('availability:species')).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'failing', sources: ['availability:species'] }),
      'sync health alert failed'
    );
  });

  it('deactivates invalid tokens and does not retry when every token was invalid', async () => {
    send.mockResolvedValueOnce(sent(0, ['device-a']));

    await update([speciesFailing]);

    const row = database
      .prepare('SELECT is_active FROM fcm_tokens WHERE token = ?')
      .get('device-a');
    expect(row).toEqual({ is_active: 0 });
    expect(storedState('availability:species')?.state).toBe('failing');
  });

  it('saves the state without retrying when there are no devices', async () => {
    database.exec('DELETE FROM fcm_tokens');

    await update([speciesFailing]);

    expect(send).toHaveBeenCalledWith([], expect.anything());
    expect(storedState('availability:species')?.state).toBe('failing');
  });

  it('saves states without sending when FCM is not configured', async () => {
    await update([speciesFailing], () => false);

    expect(send).not.toHaveBeenCalled();
    expect(storedState('availability:species')?.state).toBe('failing');
  });
});
