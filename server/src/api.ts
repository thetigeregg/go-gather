import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import Fastify from 'fastify';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CatalogEntry, ImplicitlyExcludedSearchTerm, UserSettings } from '@go-gather/shared';
import { db } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Duplicated from sync.ts rather than imported: sync.ts is a standalone
// script whose main() runs immediately as a side effect of import (no
// export guard), so importing anything from it here would trigger a full
// sync pipeline run every time the API server starts.
const SYNC_OVERRIDES_PATH = join(__dirname, 'sync-overrides.json');

interface CatalogRow {
  id: string;
  dex_nr: number;
  generation: number;
  species_id: string;
  form_id: string;
  name: string;
  species_name: string;
  img_url: string;
  is_shiny: number;
  is_female: number;
  form: string | null;
  costume: string | null;
  region: string | null;
  primary_type: string;
  secondary_type: string | null;
  pokemon_class: string | null;
  is_base_form: number;
  pokedex_type: string;
  order: number;
}

function catalogRowToEntry(row: CatalogRow): CatalogEntry {
  return {
    id: row.id,
    dexNr: row.dex_nr,
    generation: row.generation,
    speciesId: row.species_id,
    formId: row.form_id,
    name: row.name,
    speciesName: row.species_name,
    imgUrl: row.img_url,
    isShiny: !!row.is_shiny,
    isFemale: !!row.is_female,
    form: row.form,
    costume: row.costume,
    region: row.region as CatalogEntry['region'],
    primaryType: row.primary_type,
    secondaryType: row.secondary_type,
    pokemonClass: row.pokemon_class as CatalogEntry['pokemonClass'],
    isBaseForm: !!row.is_base_form,
    pokedexType: row.pokedex_type as CatalogEntry['pokedexType'],
    order: row.order,
  };
}

/**
 * Local-first sync types (adapted from game-shelf's Postgres
 * `server/src/sync.ts`, scaled down to go-gather's two entity types and
 * SQLite). See docs/progress/phase-4-catalog-pipeline.md.
 */
interface ProgressPayload {
  catalogEntryId: string;
  caught: boolean;
  updatedAt: string;
}

type ClientSyncEntityType = 'progress' | 'settings';

interface ClientSyncOperation {
  opId: string;
  entityType: ClientSyncEntityType;
  operation: 'upsert';
  payload: ProgressPayload | UserSettings;
  clientTimestamp: string;
}

interface SyncPushResult {
  opId: string;
  status: 'applied' | 'duplicate' | 'failed';
  message?: string;
}

interface SyncChangeEvent {
  eventId: string;
  entityType: ClientSyncEntityType;
  operation: 'upsert';
  payload: ProgressPayload | UserSettings;
  serverTimestamp: string;
}

function applyProgressUpsert(payload: ProgressPayload): void {
  db.prepare(
    `INSERT INTO user_progress (catalog_entry_id, caught, updated_at)
     VALUES (@catalogEntryId, @caught, @updatedAt)
     ON CONFLICT(catalog_entry_id) DO UPDATE SET
       caught = excluded.caught,
       updated_at = excluded.updated_at`
  ).run({
    catalogEntryId: payload.catalogEntryId,
    caught: payload.caught ? 1 : 0,
    updatedAt: payload.updatedAt,
  });
}

function applySettingsUpsert(payload: UserSettings): void {
  db.prepare(
    `UPDATE user_settings SET
      pokedex_type = @pokedexType,
      shiny_filter = @shinyFilter,
      region_filter = @regionFilter,
      show_regional = @showRegional,
      show_alternate = @showAlternate,
      show_gender = @showGender,
      show_uncaught_only = @showUncaughtOnly,
      excluded_name_patterns = @excludedNamePatterns,
      excluded_dex_numbers = @excludedDexNumbers,
      excluded_shiny_dex_numbers = @excludedShinyDexNumbers,
      excluded_shiny_name_patterns = @excludedShinyNamePatterns,
      user_tags = @userTags,
      preset_queries = @presetQueries
    WHERE id = 1`
  ).run({
    pokedexType: payload.pokedexType,
    shinyFilter: payload.shinyFilter,
    regionFilter: payload.regionFilter,
    showRegional: payload.showRegional ? 1 : 0,
    showAlternate: payload.showAlternate ? 1 : 0,
    showGender: payload.showGender ? 1 : 0,
    showUncaughtOnly: payload.showUncaughtOnly ? 1 : 0,
    excludedNamePatterns: JSON.stringify(payload.excludedNamePatterns),
    excludedDexNumbers: JSON.stringify(payload.excludedDexNumbers),
    excludedShinyDexNumbers: JSON.stringify(payload.excludedShinyDexNumbers),
    excludedShinyNamePatterns: JSON.stringify(payload.excludedShinyNamePatterns),
    userTags: JSON.stringify(payload.userTags),
    presetQueries: JSON.stringify(payload.presetQueries),
  });
}

function entityKeyFor(operation: ClientSyncOperation): string {
  return operation.entityType === 'progress'
    ? (operation.payload as ProgressPayload).catalogEntryId
    : 'settings';
}

function applyOperation(operation: ClientSyncOperation): void {
  if (operation.entityType === 'progress') {
    applyProgressUpsert(operation.payload as ProgressPayload);
  } else {
    applySettingsUpsert(operation.payload as UserSettings);
  }

  db.prepare(
    `INSERT INTO sync_events (entity_type, entity_key, operation, payload, server_timestamp)
     VALUES (@entityType, @entityKey, @operation, @payload, @serverTimestamp)`
  ).run({
    entityType: operation.entityType,
    entityKey: entityKeyFor(operation),
    operation: operation.operation,
    payload: JSON.stringify(operation.payload),
    serverTimestamp: new Date().toISOString(),
  });
}

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: ['http://localhost:4200'],
  });

  app.register(staticPlugin, {
    root: join(__dirname, '..', 'data', 'images'),
    prefix: '/images/',
  });

  // Enveloped with `syncedAt` (not a bare array) so the client can track
  // catalog freshness in its local `syncMeta` scope without a separate
  // version-check round trip — see STORAGE-MIGRATION.md's syncMeta scope.
  app.get('/api/catalog', () => {
    const rows = db
      .prepare('SELECT * FROM pokemon_catalog ORDER BY dex_nr, "order"')
      .all() as CatalogRow[];
    const syncMetaRow = db
      .prepare(`SELECT value FROM sync_meta WHERE key = 'catalogSyncedAt'`)
      .get() as { value: string } | undefined;

    return {
      syncedAt: syncMetaRow?.value ?? null,
      entries: rows.map(catalogRowToEntry),
    };
  });

  // Reads sync-overrides.json fresh on every request (small file, matches
  // sync.ts's own "re-read fresh every time" behavior) rather than caching
  // — so editing the file and refreshing the app picks up a change
  // immediately, no npm run sync or server restart needed.
  app.get('/api/search-config', async () => {
    const raw = await readFile(SYNC_OVERRIDES_PATH, 'utf-8');
    const overrides = JSON.parse(raw) as {
      implicitlyExcludedSearchTerms: ImplicitlyExcludedSearchTerm[];
      costumeGenderEnabled: boolean;
    };
    return {
      implicitlyExcludedSearchTerms: overrides.implicitlyExcludedSearchTerms,
      costumeGenderEnabled: overrides.costumeGenderEnabled,
    };
  });

  // Local-first sync: the client is the one deciding what to write (via its
  // own outbox); this route's job is just idempotent apply + append to the
  // change log, not decide business logic. Ported/adapted from game-shelf's
  // Postgres `POST /v1/sync/push` to SQLite, scaled down: no jsonb partial
  // merge (progress/settings payloads are always sent whole) and no request
  // body batching (payloads are tiny).
  app.post<{ Body: { operations: ClientSyncOperation[] } }>(
    '/api/sync/push',
    async (request, reply) => {
      const { operations } = request.body;

      if (!Array.isArray(operations)) {
        return reply.status(400).send({ error: 'body must be { operations: [...] }' });
      }

      const results: SyncPushResult[] = [];

      const runPush = db.transaction((ops: ClientSyncOperation[]) => {
        for (const operation of ops) {
          const existing = db
            .prepare('SELECT result FROM idempotency_keys WHERE op_id = ?')
            .get(operation.opId) as { result: string } | undefined;

          if (existing) {
            const storedResult = JSON.parse(existing.result) as SyncPushResult;
            results.push({ ...storedResult, status: 'duplicate' });
            continue;
          }

          try {
            applyOperation(operation);
            const result: SyncPushResult = { opId: operation.opId, status: 'applied' };
            results.push(result);
            db.prepare(
              'INSERT INTO idempotency_keys (op_id, result, created_at) VALUES (?, ?, ?)'
            ).run(operation.opId, JSON.stringify(result), new Date().toISOString());
          } catch (error: unknown) {
            const failed: SyncPushResult = {
              opId: operation.opId,
              status: 'failed',
              message: error instanceof Error ? error.message : String(error),
            };
            results.push(failed);
            // Failures are ALSO recorded idempotently, so a permanently-invalid
            // op doesn't get retried forever by the client.
            db.prepare(
              'INSERT INTO idempotency_keys (op_id, result, created_at) VALUES (?, ?, ?)'
            ).run(operation.opId, JSON.stringify(failed), new Date().toISOString());
          }
        }
      });

      runPush(operations);

      return { results };
    }
  );

  // Cursor-based pull of the append-only change log. A new client pulling
  // from cursor 0 replays the entire history to reconstruct full state —
  // no separate "get everything" endpoint needed, matching game-shelf.
  app.post<{ Body: { cursor?: number } }>('/api/sync/pull', (request) => {
    const cursor = typeof request.body.cursor === 'number' ? request.body.cursor : 0;

    const rows = db
      .prepare(
        `SELECT event_id, entity_type, operation, payload, server_timestamp
         FROM sync_events WHERE event_id > ? ORDER BY event_id ASC LIMIT 1000`
      )
      .all(cursor) as {
      event_id: number;
      entity_type: ClientSyncEntityType;
      operation: 'upsert';
      payload: string;
      server_timestamp: string;
    }[];

    const changes: SyncChangeEvent[] = rows.map((row) => ({
      eventId: String(row.event_id),
      entityType: row.entity_type,
      operation: row.operation,
      payload: JSON.parse(row.payload) as ProgressPayload | UserSettings,
      serverTimestamp: row.server_timestamp,
    }));

    const nextCursor = changes.length > 0 ? changes[changes.length - 1].eventId : String(cursor);

    return { cursor: nextCursor, changes };
  });

  return app;
}

export type { ClientSyncOperation, SyncPushResult, SyncChangeEvent, ProgressPayload };
