import type { FastifyBaseLogger } from 'fastify';
import { checkAndSendDueNotifications } from './notification-scheduler';
import { startNotificationScheduler } from './notification-scheduler-loop';

vi.mock('./notification-scheduler', () => ({
  DEFAULT_MULTI_DAY_MAX_SPAN_DAYS: 4,
  checkAndSendDueNotifications: vi.fn(() => Promise.resolve()),
}));

const check = vi.mocked(checkAndSendDueNotifications);
const logger = { error: vi.fn() } as unknown as FastifyBaseLogger;

describe('startNotificationScheduler', () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    check.mockClear();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.unstubAllEnvs();
  });

  it('passes the default multi-day span limit when the env var is unset', () => {
    vi.stubEnv('NOTIFICATION_MULTI_DAY_MAX_SPAN_DAYS', '');
    stop = startNotificationScheduler(logger);

    expect(check).toHaveBeenCalledWith(4);
  });

  it('passes a valid NOTIFICATION_MULTI_DAY_MAX_SPAN_DAYS override', () => {
    vi.stubEnv('NOTIFICATION_MULTI_DAY_MAX_SPAN_DAYS', '7');
    stop = startNotificationScheduler(logger);

    expect(check).toHaveBeenCalledWith(7);
  });

  it('falls back to the default for a non-positive or non-numeric value', () => {
    vi.stubEnv('NOTIFICATION_MULTI_DAY_MAX_SPAN_DAYS', '0');
    stop = startNotificationScheduler(logger);
    stop();

    vi.stubEnv('NOTIFICATION_MULTI_DAY_MAX_SPAN_DAYS', 'abc');
    stop = startNotificationScheduler(logger);

    expect(check.mock.calls).toEqual([[4], [4]]);
  });

  it('logs a tick failure instead of throwing', async () => {
    check.mockRejectedValueOnce(new Error('boom'));
    stop = startNotificationScheduler(logger);
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) as Error }),
        'notification scheduler tick failed'
      );
    });
  });
});
