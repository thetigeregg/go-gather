import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { DEFAULT_SETTINGS, type UserSettings } from '@go-gather/shared';
import { db } from './db';
import { findExpiredHiddenEventIds, pruneExpiredHiddenEvents } from './hidden-event-pruning';

dayjs.extend(utc);

vi.mock('./db', async () => {
  const { default: Database } = await import('better-sqlite3');
  return { db: new Database(':memory:') };
});

const NOW = dayjs.utc('2026-06-14T20:00:00.000Z');

describe('findExpiredHiddenEventIds', () => {
  const events = [
    { eventId: 'ended', end: '2026-06-14T19:59:00.000Z' },
    { eventId: 'ending-now', end: '2026-06-14T20:00:00.000Z' },
    { eventId: 'ongoing', end: '2026-06-20T18:00:00.000Z' },
    // 17:00 New York (EDT) = 21:00 UTC, still running; 17:00 UTC has ended.
    { eventId: 'local-time', end: '2026-06-14T17:00:00.000' },
  ];

  it('returns ended events and keeps ongoing ones and one ending exactly now', () => {
    expect(
      findExpiredHiddenEventIds(['ended', 'ending-now', 'ongoing'], events, NOW, 'UTC')
    ).toEqual(['ended']);
  });

  it('reads a bare end timestamp as wall-clock time in the user timezone', () => {
    expect(findExpiredHiddenEventIds(['local-time'], events, NOW, 'America/New_York')).toEqual([]);
    expect(findExpiredHiddenEventIds(['local-time'], events, NOW, 'UTC')).toEqual(['local-time']);
  });

  it('resolves pseudo-event IDs by their own date while the parent still exists', () => {
    const hidden = [
      'ongoing-raid-hour-2026-06-13-0',
      'ongoing-spotlight-hour-2026-06-16-2',
      'ongoing-daily-bonus-2026-06-14',
      'ongoing-daily-bonus-2026-06-13',
    ];
    expect(findExpiredHiddenEventIds(hidden, events, NOW, 'UTC')).toEqual([
      'ongoing-raid-hour-2026-06-13-0',
      'ongoing-daily-bonus-2026-06-13',
    ]);
  });

  it('judges a pseudo-event day in the user timezone', () => {
    // 20:00 UTC on 06-14 is still 06-14 in New York but already 06-15 in Tokyo.
    const hidden = ['ongoing-daily-bonus-2026-06-14'];
    expect(findExpiredHiddenEventIds(hidden, events, NOW, 'America/New_York')).toEqual([]);
    expect(findExpiredHiddenEventIds(hidden, events, NOW, 'Asia/Tokyo')).toEqual(hidden);
  });

  it('returns IDs matching no event, including pseudo-events whose parent is gone', () => {
    expect(
      findExpiredHiddenEventIds(['gone', 'gone-raid-hour-2026-06-20-0'], events, NOW, 'UTC')
    ).toEqual(['gone', 'gone-raid-hour-2026-06-20-0']);
  });

  it('returns nothing when the events table is empty or nothing is hidden', () => {
    expect(findExpiredHiddenEventIds(['anything'], [], NOW, 'UTC')).toEqual([]);
    expect(findExpiredHiddenEventIds([], events, NOW, 'UTC')).toEqual([]);
  });
});

describe('pruneExpiredHiddenEvents', () => {
  beforeEach(() => {
    db.exec(`
      CREATE TABLE user_settings (id INTEGER PRIMARY KEY, hidden_event_ids TEXT NOT NULL);
      CREATE TABLE pokemon_go_events (event_id TEXT PRIMARY KEY, end TEXT NOT NULL);
      CREATE TABLE fcm_tokens (timezone TEXT, is_active INTEGER, last_seen_at TEXT);
      CREATE TABLE sync_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        server_timestamp TEXT NOT NULL
      );
    `);
    db.prepare(`INSERT INTO pokemon_go_events VALUES ('ended', '2026-06-14T12:00:00.000Z')`).run();
    db.prepare(
      `INSERT INTO pokemon_go_events VALUES ('ongoing', '2026-06-20T12:00:00.000Z')`
    ).run();
  });

  afterEach(() => {
    db.exec(`
      DROP TABLE user_settings; DROP TABLE pokemon_go_events;
      DROP TABLE fcm_tokens; DROP TABLE sync_events;
    `);
  });

  function syncSettings(settings: UserSettings): void {
    db.prepare(`INSERT INTO user_settings VALUES (1, ?)`).run(
      JSON.stringify(settings.hiddenEventIds)
    );
    db.prepare(
      `INSERT INTO sync_events (entity_type, entity_key, operation, payload, server_timestamp)
       VALUES ('settings', 'settings', 'upsert', ?, '2026-06-01T00:00:00.000Z')`
    ).run(JSON.stringify(settings));
  }

  function settingsEvents(): UserSettings[] {
    return (
      db
        .prepare(`SELECT payload FROM sync_events WHERE entity_type = 'settings' ORDER BY event_id`)
        .all() as { payload: string }[]
    ).map((row) => JSON.parse(row.payload) as UserSettings);
  }

  it('removes expired IDs, keeps every other synced field, and publishes the change', () => {
    syncSettings({
      ...DEFAULT_SETTINGS,
      notificationsEnabled: true,
      userTags: ['trade'],
      hiddenEventIds: ['ended', 'ongoing', 'gone'],
    });

    expect(pruneExpiredHiddenEvents(NOW)).toBe(2);

    const stored = db.prepare(`SELECT hidden_event_ids FROM user_settings`).get() as {
      hidden_event_ids: string;
    };
    expect(JSON.parse(stored.hidden_event_ids)).toEqual(['ongoing']);

    const published = settingsEvents();
    expect(published).toHaveLength(2);
    expect(published[1]).toEqual({
      ...DEFAULT_SETTINGS,
      notificationsEnabled: true,
      userTags: ['trade'],
      hiddenEventIds: ['ongoing'],
    });
  });

  it('writes nothing when no hidden ID has expired', () => {
    syncSettings({ ...DEFAULT_SETTINGS, hiddenEventIds: ['ongoing'] });

    expect(pruneExpiredHiddenEvents(NOW)).toBe(0);
    expect(settingsEvents()).toHaveLength(1);
  });

  it('does nothing when settings were never synced', () => {
    db.prepare(`INSERT INTO user_settings VALUES (1, '[]')`).run();

    expect(pruneExpiredHiddenEvents(NOW)).toBe(0);
    expect(settingsEvents()).toEqual([]);
  });

  it('reads hidden IDs from the settings column when the latest payload predates them', () => {
    const { hiddenEventIds: _omitted, ...legacy } = DEFAULT_SETTINGS;
    db.prepare(`INSERT INTO user_settings VALUES (1, '["ended","ongoing"]')`).run();
    db.prepare(
      `INSERT INTO sync_events (entity_type, entity_key, operation, payload, server_timestamp)
       VALUES ('settings', 'settings', 'upsert', ?, '2026-01-01T00:00:00.000Z')`
    ).run(JSON.stringify(legacy));

    expect(pruneExpiredHiddenEvents(NOW)).toBe(1);
    expect(settingsEvents()[1]).toEqual({ ...DEFAULT_SETTINGS, hiddenEventIds: ['ongoing'] });
  });

  it('does nothing when the settings row is missing', () => {
    syncSettings({ ...DEFAULT_SETTINGS, hiddenEventIds: ['ended'] });
    db.exec(`DELETE FROM user_settings`);

    expect(pruneExpiredHiddenEvents(NOW)).toBe(0);
    expect(settingsEvents()).toHaveLength(1);
  });

  it('uses the most recently seen device timezone', () => {
    db.prepare(`INSERT INTO pokemon_go_events VALUES ('local', '2026-06-14T17:00:00.000')`).run();
    db.prepare(
      `INSERT INTO fcm_tokens VALUES ('America/New_York', 1, '2026-06-14T00:00:00.000Z')`
    ).run();
    syncSettings({ ...DEFAULT_SETTINGS, hiddenEventIds: ['local'] });

    expect(pruneExpiredHiddenEvents(NOW)).toBe(0);
  });
});
