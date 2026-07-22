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
      preset_queries TEXT NOT NULL
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
  `);

  // `CREATE TABLE IF NOT EXISTS` above is a no-op against a pre-existing
  // gogather.db from before `pokedex_type` was introduced, so add it here
  // if missing rather than requiring a manual DB reset.
  const columns = db.prepare(`PRAGMA table_info(pokemon_catalog)`).all() as { name: string }[];
  if (!columns.some((c) => c.name === 'pokedex_type')) {
    db.exec(`ALTER TABLE pokemon_catalog ADD COLUMN pokedex_type TEXT NOT NULL DEFAULT 'regular'`);
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
      user_tags, preset_queries
    ) VALUES (
      1, @pokedexType, @shinyFilter, @regionFilter,
      @showRegional, @showAlternate, @showGender, @showUncaughtOnly,
      @excludedNamePatterns, @excludedDexNumbers,
      @excludedShinyDexNumbers, @excludedShinyNamePatterns,
      @userTags, @presetQueries
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
  });
}
