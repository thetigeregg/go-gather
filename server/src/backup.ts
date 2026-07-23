import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyBaseLogger } from 'fastify';
import type {
  ExcludedSearchTerm,
  ExportBundle,
  PokedexType,
  PresetQuery,
  ProgressEntry,
} from '@go-gather/shared';
import { db } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUPS_DIR = join(__dirname, '..', 'backups');

interface ProgressRow {
  catalog_entry_id: string;
  caught: number;
  updated_at: string;
}

interface SettingsRow {
  excluded_name_patterns: string;
  excluded_dex_numbers: string;
  excluded_shiny_dex_numbers: string;
  excluded_shiny_name_patterns: string;
  user_tags: string;
  preset_queries: string;
  excluded_search_terms_by_pokedex: string;
}

/**
 * Server-side equivalent of the client's `UserDataService.exportBundle()`
 * (`src/app/core/services/user-data.service.ts`) — same `ExportBundle`
 * shape, built from the server's own copy of the same data
 * (`user_progress`/`user_settings`, kept in sync via `/api/sync/push`).
 * Unlike the client, which stamps every `progress[].updatedAt` to "now" at
 * export time (it never keeps the real per-entry timestamp in memory), this
 * uses the real `user_progress.updated_at` per row — same shape/keys, more
 * accurate values.
 */
function buildExportBundle(): ExportBundle {
  const progressRows = db
    .prepare('SELECT catalog_entry_id, caught, updated_at FROM user_progress')
    .all() as ProgressRow[];
  const progress: ProgressEntry[] = progressRows.map((row) => ({
    catalogEntryId: row.catalog_entry_id,
    caught: row.caught === 1,
    updatedAt: row.updated_at,
  }));

  const settingsRow = db
    .prepare(
      `SELECT excluded_name_patterns, excluded_dex_numbers, excluded_shiny_dex_numbers,
              excluded_shiny_name_patterns, user_tags, preset_queries,
              excluded_search_terms_by_pokedex
       FROM user_settings WHERE id = 1`
    )
    .get() as SettingsRow;

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    progress,
    excludedNamePatterns: JSON.parse(settingsRow.excluded_name_patterns) as string[],
    excludedDexNumbers: JSON.parse(settingsRow.excluded_dex_numbers) as number[],
    excludedShinyDexNumbers: JSON.parse(settingsRow.excluded_shiny_dex_numbers) as number[],
    excludedShinyNamePatterns: JSON.parse(settingsRow.excluded_shiny_name_patterns) as string[],
    userTags: JSON.parse(settingsRow.user_tags) as string[],
    presetQueries: JSON.parse(settingsRow.preset_queries) as PresetQuery[],
    excludedSearchTermsByPokedex: JSON.parse(
      settingsRow.excluded_search_terms_by_pokedex
    ) as Record<PokedexType, ExcludedSearchTerm[]>,
  };
}

/**
 * Exact match of the client's filename formula
 * (`src/app/settings/settings.page.ts`'s `exportBundle()`): colons become
 * hyphens for filesystem safety, milliseconds+`Z` are stripped.
 */
function backupFilename(now: Date): string {
  const timestamp = now
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d+Z$/, '');
  return `go-gather-backup-${timestamp}.json`;
}

function readSyncMeta(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value;
}

function writeSyncMeta(key: string, value: string): void {
  db.prepare(
    `INSERT INTO sync_meta (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run({ key, value });
}

const LAST_BACKUP_PROGRESS_COUNT_KEY = 'lastBackupProgressCount';

function countProgressSyncEvents(): number {
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM sync_events WHERE entity_type = 'progress'`)
    .get() as { count: number };
  return row.count;
}

/**
 * Writes one backup file, matching the client's exported format/filename
 * scheme byte-for-byte in shape. Never throws — a failed write (e.g. the
 * mounted backups volume isn't writable) must not crash the server or a
 * `/api/sync/push` request, just get logged.
 */
export function writeBackup(logger: FastifyBaseLogger): void {
  try {
    mkdirSync(BACKUPS_DIR, { recursive: true });
    const bundle = buildExportBundle();
    const filename = backupFilename(new Date());
    writeFileSync(join(BACKUPS_DIR, filename), JSON.stringify(bundle, null, 2), 'utf-8');
    writeSyncMeta(LAST_BACKUP_PROGRESS_COUNT_KEY, String(countProgressSyncEvents()));
    logger.info({ filename, progressEntries: bundle.progress.length }, 'wrote server-side backup');
  } catch (err: unknown) {
    logger.error({ err }, 'failed to write server-side backup');
  }
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Triggers an extra backup once enough catch-status modifications
 * (`sync_events` rows with entity_type='progress' — one per add/remove,
 * inserted by `applyOperation` in api.ts) have accumulated since the last
 * backup. Disabled by default (`BACKUP_AFTER_N_MODIFICATIONS=0`) — nothing
 * beyond the startup backup happens unless explicitly configured.
 */
export function maybeBackupAfterModifications(logger: FastifyBaseLogger): void {
  const threshold = readPositiveIntegerEnv('BACKUP_AFTER_N_MODIFICATIONS', 0);
  if (threshold <= 0) {
    return;
  }

  const total = countProgressSyncEvents();
  const lastBackupCount = Number(readSyncMeta(LAST_BACKUP_PROGRESS_COUNT_KEY) ?? '0');

  if (total - lastBackupCount >= threshold) {
    writeBackup(logger);
  }
}
