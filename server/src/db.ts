import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { DEFAULT_SETTINGS } from '@go-gather/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

export const dbPath = join(dataDir, 'gogather.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pokemon_catalog (
      id TEXT PRIMARY KEY,
      dex_nr INTEGER NOT NULL,
      generation INTEGER NOT NULL,
      species_id TEXT NOT NULL,
      form_id TEXT NOT NULL,
      name TEXT NOT NULL,
      species_name TEXT NOT NULL,
      img_url TEXT NOT NULL,
      is_shiny INTEGER NOT NULL,
      is_female INTEGER NOT NULL,
      form TEXT,
      costume TEXT,
      region TEXT,
      primary_type TEXT NOT NULL,
      secondary_type TEXT,
      pokemon_class TEXT,
      is_base_form INTEGER NOT NULL,
      pokedex_type TEXT NOT NULL DEFAULT 'regular',
      "order" INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_progress (
      catalog_entry_id TEXT PRIMARY KEY,
      caught INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      pokedex_type TEXT NOT NULL,
      shiny_filter TEXT NOT NULL,
      region_filter TEXT NOT NULL,
      show_regional INTEGER NOT NULL,
      show_alternate INTEGER NOT NULL,
      show_gender INTEGER NOT NULL,
      show_uncaught_only INTEGER NOT NULL,
      excluded_name_patterns TEXT NOT NULL,
      excluded_dex_numbers TEXT NOT NULL,
      excluded_shiny_dex_numbers TEXT NOT NULL,
      excluded_shiny_name_patterns TEXT NOT NULL,
      user_tags TEXT NOT NULL,
      preset_queries TEXT NOT NULL,
      excluded_search_terms_by_pokedex TEXT NOT NULL,
      hidden_event_ids TEXT NOT NULL DEFAULT '[]',
      disabled_event_types TEXT NOT NULL DEFAULT '["go-pass","season"]',
      notifications_enabled INTEGER NOT NULL DEFAULT 0,
      notification_timed_event_offset_minutes INTEGER NOT NULL DEFAULT 15,
      notification_all_day_event_time TEXT NOT NULL DEFAULT '09:00'
    );

    -- Local-first sync support (adapted from game-shelf's Postgres
    -- idempotency_keys/sync_events pair, see docs/progress/phase-4-catalog-pipeline.md):
    -- op_id dedup so a retried push is a no-op, and an append-only change
    -- log so clients can pull by cursor.
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      op_id TEXT PRIMARY KEY,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      server_timestamp TEXT NOT NULL
    );

    -- Server-side key/value metadata (e.g. when the catalog was last synced),
    -- distinct from the client's local syncMeta StorageEngine scope.
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Pokemon GO community events (Calendar tab), synced from a scraped
    -- feed by sync-calendar-events.ts. Unlike pokemon_catalog, PogoEvent's
    -- extraData is deeply nested and varies by event type, so the full
    -- entity is stored as a JSON payload column rather than decomposed into
    -- flat columns — event_type/start/end are duplicated out as plain
    -- columns only because GET /api/calendar-events orders by them.
    CREATE TABLE IF NOT EXISTS pokemon_go_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      start TEXT NOT NULL,
      end TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    -- Pokemon GO Season "Daily Discovery" data (Calendar tab), synced from a
    -- separate feed by sync-season.ts. Single current-season row, same
    -- singleton pattern as user_settings.
    CREATE TABLE IF NOT EXISTS pokemon_go_season (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL
    );

    -- Pokemon base-stat reference data (CP calculation for Timeline raid
    -- sprites), synced from a third-party static-data feed by
    -- sync-pokemon-stats.ts. The whole dataset is stored as one JSON payload
    -- row, same singleton pattern as pokemon_go_season — the client wants
    -- the entire array at once for its own in-memory lookup, not per-row
    -- server queries.
    CREATE TABLE IF NOT EXISTS pokemon_stats (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL
    );

    -- FCM device registrations for calendar-event push notifications. No
    -- userId/deviceId concept exists elsewhere in this schema (single-user
    -- app) — a "device" IS a token row; multiple rows exist only because one
    -- user may have this app installed on more than one device.
    CREATE TABLE IF NOT EXISTS fcm_tokens (
      token TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      timezone TEXT,
      app_version TEXT,
      user_agent TEXT,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Reservation/idempotency log for the notification scheduler (mirrors
    -- game-shelf's release_notification_log pattern) — one row reserved
    -- BEFORE a push send is attempted, per (event, category) pair, so a
    -- scheduler restart/re-run never double-sends.
    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('timed', 'all-day')),
      event_key TEXT NOT NULL UNIQUE,
      sent_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  // `CREATE TABLE IF NOT EXISTS` above is a no-op against a pre-existing
  // gogather.db from before `pokedex_type` was introduced, so add it here
  // if missing rather than requiring a manual DB reset.
  const columns = db.prepare(`PRAGMA table_info(pokemon_catalog)`).all() as { name: string }[];
  if (!columns.some((c) => c.name === 'pokedex_type')) {
    db.exec(`ALTER TABLE pokemon_catalog ADD COLUMN pokedex_type TEXT NOT NULL DEFAULT 'regular'`);
  }

  // Same rationale as above, for a pre-existing gogather.db from before
  // per-pokedex search exclusions were introduced. Column is added nullable
  // (SQLite's ALTER TABLE DEFAULT clause can't hold a computed JSON value)
  // then immediately backfilled with the actual seeded defaults — not an
  // empty object — so upgrading users see no change in generated search
  // strings.
  const settingsColumns = db.prepare(`PRAGMA table_info(user_settings)`).all() as {
    name: string;
  }[];
  if (!settingsColumns.some((c) => c.name === 'excluded_search_terms_by_pokedex')) {
    db.exec(`ALTER TABLE user_settings ADD COLUMN excluded_search_terms_by_pokedex TEXT`);
    db.prepare(
      `UPDATE user_settings SET excluded_search_terms_by_pokedex = @value WHERE id = 1`
    ).run({ value: JSON.stringify(DEFAULT_SETTINGS.excludedSearchTermsByPokedex) });
  }

  // Same rationale as above, for a pre-existing gogather.db from before
  // calendar-event push notifications were introduced. hidden_event_ids
  // needs no backfill ('[]' is correct for every existing install, since
  // this state never existed server-side before); disabled_event_types is
  // backfilled to match DEFAULT_SETTINGS so upgrading users keep the same
  // event types they already had hidden from the calendar/timeline view.
  if (!settingsColumns.some((c) => c.name === 'hidden_event_ids')) {
    db.exec(`ALTER TABLE user_settings ADD COLUMN hidden_event_ids TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!settingsColumns.some((c) => c.name === 'disabled_event_types')) {
    db.exec(`ALTER TABLE user_settings ADD COLUMN disabled_event_types TEXT NOT NULL DEFAULT '[]'`);
    db.prepare(`UPDATE user_settings SET disabled_event_types = @value WHERE id = 1`).run({
      value: JSON.stringify(DEFAULT_SETTINGS.disabledEventTypes),
    });
  }
  if (!settingsColumns.some((c) => c.name === 'notifications_enabled')) {
    db.exec(
      `ALTER TABLE user_settings ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 0`
    );
  }
  if (!settingsColumns.some((c) => c.name === 'notification_timed_event_offset_minutes')) {
    db.exec(
      `ALTER TABLE user_settings ADD COLUMN notification_timed_event_offset_minutes INTEGER NOT NULL DEFAULT 15`
    );
  }
  if (!settingsColumns.some((c) => c.name === 'notification_all_day_event_time')) {
    db.exec(
      `ALTER TABLE user_settings ADD COLUMN notification_all_day_event_time TEXT NOT NULL DEFAULT '09:00'`
    );
  }

  // Single-row settings table (id is always 1) — seeded once from
  // DEFAULT_SETTINGS on first run; `INSERT OR IGNORE` is a no-op on every
  // subsequent startup once the row exists.
  db.prepare(
    `INSERT OR IGNORE INTO user_settings (
      id, pokedex_type, shiny_filter, region_filter,
      show_regional, show_alternate, show_gender, show_uncaught_only,
      excluded_name_patterns, excluded_dex_numbers,
      excluded_shiny_dex_numbers, excluded_shiny_name_patterns,
      user_tags, preset_queries, excluded_search_terms_by_pokedex,
      hidden_event_ids, disabled_event_types, notifications_enabled,
      notification_timed_event_offset_minutes, notification_all_day_event_time
    ) VALUES (
      1, @pokedexType, @shinyFilter, @regionFilter,
      @showRegional, @showAlternate, @showGender, @showUncaughtOnly,
      @excludedNamePatterns, @excludedDexNumbers,
      @excludedShinyDexNumbers, @excludedShinyNamePatterns,
      @userTags, @presetQueries, @excludedSearchTermsByPokedex,
      @hiddenEventIds, @disabledEventTypes, @notificationsEnabled,
      @notificationTimedEventOffsetMinutes, @notificationAllDayEventTime
    )`
  ).run({
    pokedexType: DEFAULT_SETTINGS.pokedexType,
    shinyFilter: DEFAULT_SETTINGS.shinyFilter,
    regionFilter: DEFAULT_SETTINGS.regionFilter,
    showRegional: DEFAULT_SETTINGS.showRegional ? 1 : 0,
    showAlternate: DEFAULT_SETTINGS.showAlternate ? 1 : 0,
    showGender: DEFAULT_SETTINGS.showGender ? 1 : 0,
    showUncaughtOnly: DEFAULT_SETTINGS.showUncaughtOnly ? 1 : 0,
    excludedNamePatterns: JSON.stringify(DEFAULT_SETTINGS.excludedNamePatterns),
    excludedDexNumbers: JSON.stringify(DEFAULT_SETTINGS.excludedDexNumbers),
    excludedShinyDexNumbers: JSON.stringify(DEFAULT_SETTINGS.excludedShinyDexNumbers),
    excludedShinyNamePatterns: JSON.stringify(DEFAULT_SETTINGS.excludedShinyNamePatterns),
    userTags: JSON.stringify(DEFAULT_SETTINGS.userTags),
    presetQueries: JSON.stringify(DEFAULT_SETTINGS.presetQueries),
    excludedSearchTermsByPokedex: JSON.stringify(DEFAULT_SETTINGS.excludedSearchTermsByPokedex),
    hiddenEventIds: JSON.stringify(DEFAULT_SETTINGS.hiddenEventIds),
    disabledEventTypes: JSON.stringify(DEFAULT_SETTINGS.disabledEventTypes),
    notificationsEnabled: DEFAULT_SETTINGS.notificationsEnabled ? 1 : 0,
    notificationTimedEventOffsetMinutes: DEFAULT_SETTINGS.notificationTimedEventOffsetMinutes,
    notificationAllDayEventTime: DEFAULT_SETTINGS.notificationAllDayEventTime,
  });
}
