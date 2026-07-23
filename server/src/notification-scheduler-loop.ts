import type { FastifyBaseLogger } from 'fastify';
import { checkAndSendDueNotifications } from './notification-scheduler.js';

const MINUTE_MS = 60 * 1000;

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function runTick(logger: FastifyBaseLogger): Promise<void> {
  const startedAt = Date.now();
  try {
    await checkAndSendDueNotifications();
  } catch (err: unknown) {
    logger.error({ durationMs: Date.now() - startedAt, err }, 'notification scheduler tick failed');
  }
}

/**
 * Separate, minute-granularity loop from scheduled-sync.ts's hourly
 * data-feed jobs — a distinct concern ("what's due right now") that doesn't
 * benefit from sharing that job runner's hour-granularity type. Runs once
 * immediately at startup (so a restart catches up on anything that became
 * due while the server was down — the notification_log reservation table is
 * what makes that safe, not this interval) and then on its own interval.
 */
export function startNotificationScheduler(logger: FastifyBaseLogger): () => void {
  const intervalMinutes = readPositiveIntegerEnv('NOTIFICATION_CHECK_INTERVAL_MINUTES', 2);

  void runTick(logger);

  const timer = setInterval(() => {
    void runTick(logger);
  }, intervalMinutes * MINUTE_MS);

  return function stopNotificationScheduler(): void {
    clearInterval(timer);
  };
}
