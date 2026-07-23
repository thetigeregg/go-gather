import type { FastifyInstance } from 'fastify';
import { db } from './db.js';

interface RegisterBody {
  token?: unknown;
  platform?: unknown;
  appVersion?: unknown;
  userAgent?: unknown;
  timezone?: unknown;
}

interface UnregisterBody {
  token?: unknown;
}

export function registerNotificationRoutes(app: FastifyInstance): void {
  app.post('/api/notifications/fcm/register', async (request, reply) => {
    const body = (request.body ?? {}) as RegisterBody;
    const token = normalizeToken(body.token);

    if (token === null) {
      reply.code(400).send({ error: 'Invalid token.' });
      return;
    }

    const platform = normalizePlatform(body.platform);
    const appVersion = normalizeOptionalString(body.appVersion, 64);
    const userAgent = normalizeOptionalString(body.userAgent, 512);
    const timezone = normalizeOptionalString(body.timezone, 128);
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO fcm_tokens (token, platform, is_active, timezone, app_version, user_agent, last_seen_at, created_at, updated_at)
       VALUES (@token, @platform, 1, @timezone, @appVersion, @userAgent, @now, @now, @now)
       ON CONFLICT(token) DO UPDATE SET
         platform = excluded.platform,
         is_active = 1,
         timezone = excluded.timezone,
         app_version = excluded.app_version,
         user_agent = excluded.user_agent,
         last_seen_at = excluded.last_seen_at,
         updated_at = excluded.updated_at`
    ).run({ token, platform, timezone, appVersion, userAgent, now });

    reply.send({ ok: true });
  });

  app.post('/api/notifications/fcm/unregister', async (request, reply) => {
    const body = (request.body ?? {}) as UnregisterBody;
    const token = normalizeToken(body.token);

    if (token === null) {
      reply.code(400).send({ error: 'Invalid token.' });
      return;
    }

    db.prepare(`UPDATE fcm_tokens SET is_active = 0, updated_at = @now WHERE token = @token`).run({
      token,
      now: new Date().toISOString(),
    });

    reply.send({ ok: true });
  });
}

function normalizeToken(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length >= 16 && normalized.length <= 512 ? normalized : null;
}

function normalizePlatform(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (normalized === 'web' || normalized === 'android' || normalized === 'ios') {
    return normalized;
  }

  return 'unknown';
}

function normalizeOptionalString(value: unknown, maxLength: number): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';

  if (normalized.length === 0) {
    return null;
  }

  return normalized.slice(0, maxLength);
}
