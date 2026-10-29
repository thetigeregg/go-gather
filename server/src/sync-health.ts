/**
 * Tracks whether each data feed is updating, so a failure reaches the user
 * instead of waiting to be noticed in the logs or on the Settings page. One
 * row per source in `sync_health`: a scheduled job (`job:catalog`) or a
 * Bulbapedia availability dataset (`availability:species`).
 *
 * Every unhealthy source is logged at `warn` on every run. A push goes to
 * every active device only when a source's state changes — starts failing,
 * goes stale, or recovers — so a feed failing for days sends one alert, not
 * one per run. The states live in SQLite, so a restart doesn't re-alert.
 *
 * Takes the database handle as a parameter (like availability-store.ts), so
 * tests can run against an in-memory database. FCM is passed in too, so
 * db.ts (which includes this module's schema) doesn't load firebase-admin.
 */
import { AVAILABILITY_DATASET_LABELS, type AvailabilityStatus } from '@go-gather/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';
import type { sendFcmMulticast } from './fcm.js';

/** Included in db.ts's initSchema(). `changed_at` is when `state` last
 * changed, i.e. when its alert was sent; `detail` is the latest run's. */
export const SYNC_HEALTH_SCHEMA = `
  CREATE TABLE IF NOT EXISTS sync_health (
    source TEXT PRIMARY KEY,
    state TEXT NOT NULL CHECK (state IN ('ok', 'failing', 'stale')),
    detail TEXT,
    changed_at TEXT NOT NULL
  );
`;

export type HealthState = 'ok' | 'failing' | 'stale';

export interface HealthCheck {
  /** `job:<job name>` or `availability:<dataset>`. */
  source: string;
  state: HealthState;
  /** The error behind a failing state, if known. */
  detail?: string | null;
}

export type AlertKind = 'failing' | 'stale' | 'recovered';

const JOB_LABELS: Record<string, string> = {
  'calendar-events': 'Calendar events',
  season: 'Season',
  'pokemon-stats': 'Pokémon stats',
  catalog: 'Catalog',
};

const MAX_DETAIL_LENGTH = 150;

/**
 * An availability dataset's state from its Settings status row. A dataset
 * whose last attempt failed is `failing`, escalating to `stale` once its
 * saved data is a week old; saved data that old without an error (the
 * catalog job stopped reaching it) is `stale` too.
 */
export function availabilityHealth(status: AvailabilityStatus): HealthCheck {
  const source = `availability:${status.dataset}`;
  if (status.stale) {
    return { source, state: 'stale', detail: status.lastError };
  }
  if (status.lastError !== null) {
    return { source, state: 'failing', detail: status.lastError };
  }
  return { source, state: 'ok' };
}

/** The alert a change from `previous` to `current` sends, if any. A source
 * never checked before counts as having been `ok`. */
export function transition(
  previous: HealthState | undefined,
  current: HealthState
): AlertKind | null {
  const from = previous ?? 'ok';
  if (from === current) {
    return null;
  }
  return current === 'ok' ? 'recovered' : current;
}

function sourceLabel(source: string): string {
  const [kind, name = source] = source.split(':', 2);
  if (kind === 'availability') {
    return `${AVAILABILITY_DATASET_LABELS[name] ?? name} data`;
  }
  if (kind === 'job') {
    return `${JOB_LABELS[name] ?? name} sync`;
  }
  return source;
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

/** One push for every source that made the same change in a run — e.g. one
 * Bulbapedia outage failing several datasets at once. */
export function alertMessage(
  kind: AlertKind,
  checks: HealthCheck[]
): { title: string; body: string } {
  const labels = checks.map((check) => sourceLabel(check.source)).join(', ');
  switch (kind) {
    case 'failing': {
      const detail = checks.length === 1 ? checks[0].detail : null;
      return {
        title: `Sync failing: ${labels}`,
        body: detail
          ? truncate(detail, MAX_DETAIL_LENGTH)
          : 'Open Settings or the server logs for details.',
      };
    }
    case 'stale':
      return {
        title: `Over a week old: ${labels}`,
        body: 'Still not updating. Open Settings or the server logs for details.',
      };
    case 'recovered':
      return { title: `Sync recovered: ${labels}`, body: 'Updating normally again.' };
  }
}

export interface UpdateSyncHealthOptions {
  logger: Pick<FastifyBaseLogger, 'warn' | 'error'>;
  send: typeof sendFcmMulticast;
  isFcmConfigured: () => boolean;
  now?: Date;
}

/**
 * Logs every unhealthy check, alerts on every state change, and saves the
 * new states. A change whose push reached no device (other than because
 * every token was invalid) keeps its previous state, so it's retried on the
 * next run — the same rule as the notification scheduler's reservations.
 * With FCM not configured there's no one to alert, so the states are saved
 * without sending. Returns the unhealthy checks.
 */
export async function updateSyncHealth(
  database: Database,
  checks: HealthCheck[],
  { logger, send, isFcmConfigured, now = new Date() }: UpdateSyncHealthOptions
): Promise<HealthCheck[]> {
  const unhealthy = checks.filter((check) => check.state !== 'ok');
  for (const { source, state, detail } of unhealthy) {
    logger.warn({ source, state, detail }, 'sync source unhealthy');
  }

  const readState = database.prepare('SELECT state FROM sync_health WHERE source = ?');
  const changes = new Map<AlertKind, HealthCheck[]>();
  const unchanged: HealthCheck[] = [];
  for (const check of checks) {
    const previous = readState.get(check.source) as { state: HealthState } | undefined;
    const kind = transition(previous?.state, check.state);
    if (kind) {
      changes.set(kind, [...(changes.get(kind) ?? []), check]);
    } else {
      unchanged.push(check);
    }
  }

  // A source failing for days can fail for a different reason each run.
  const saveDetail = database.prepare('UPDATE sync_health SET detail = ? WHERE source = ?');
  for (const { source, detail } of unchanged) {
    saveDetail.run(detail ?? null, source);
  }

  const saveState = database.prepare(`
    INSERT INTO sync_health (source, state, detail, changed_at)
    VALUES (@source, @state, @detail, @changedAt)
    ON CONFLICT(source) DO UPDATE SET
      state = excluded.state,
      detail = excluded.detail,
      changed_at = excluded.changed_at
  `);
  for (const [kind, changed] of changes) {
    if (isFcmConfigured() && !(await alert(database, kind, changed, send, logger))) {
      continue;
    }
    for (const { source, state, detail } of changed) {
      saveState.run({ source, state, detail: detail ?? null, changedAt: now.toISOString() });
    }
  }
  return unhealthy;
}

/** Sends one alert to every active device. False if it should be retried. */
async function alert(
  database: Database,
  kind: AlertKind,
  checks: HealthCheck[],
  send: typeof sendFcmMulticast,
  logger: Pick<FastifyBaseLogger, 'error'>
): Promise<boolean> {
  const tokens = (
    database.prepare('SELECT token FROM fcm_tokens WHERE is_active = 1').all() as {
      token: string;
    }[]
  ).map((row) => row.token);
  try {
    const result = await send(tokens, {
      ...alertMessage(kind, checks),
      data: { kind: 'sync-health', route: '/settings' },
    });
    if (result.invalidTokens.length > 0) {
      const placeholders = result.invalidTokens.map(() => '?').join(',');
      database
        .prepare(
          `UPDATE fcm_tokens SET is_active = 0, updated_at = ? WHERE token IN (${placeholders})`
        )
        .run(new Date().toISOString(), ...result.invalidTokens);
    }
    const allInvalid = tokens.length > 0 && result.invalidTokens.length === tokens.length;
    return tokens.length === 0 || result.successCount > 0 || allInvalid;
  } catch (err: unknown) {
    logger.error(
      { kind, sources: checks.map((check) => check.source), err },
      'sync health alert failed'
    );
    return false;
  }
}
