import { InjectionToken } from '@angular/core';
import type { CatalogEntry, ProgressEntry, UserSettings } from '@go-gather/shared';

/**
 * Logical stores that can participate in a storage transaction.
 *
 * No `outbox` scope: unlike game-shelf, go-gather has no per-write
 * push-sync of progress/settings to a server — the only server interaction
 * is periodic catalog pulls, tracked via `syncMeta`. Add an `outbox` scope
 * later if a "back up my progress to my own server" feature is added.
 */
export type StorageScope = 'catalog' | 'progress' | 'settings' | 'imageCache' | 'syncMeta';

/**
 * Image cache row. The web engine persists the image bytes inline (`blob`);
 * the native engine (Phase 6) will store bytes on the filesystem and keep
 * only a relative file path here instead.
 */
export interface ImageCacheRecord {
  key: string;
  blob?: Blob;
  filePath?: string | null;
}

/** A single sync-metadata key/value pair (e.g. installed catalog version). */
export interface SyncMetaEntry {
  key: string;
  value: string;
}

/**
 * Returns true when an error represents a storage-level constraint violation
 * (e.g. unique index conflict). Both engines normalize to these error names:
 * IndexedDB raises DOMException ConstraintError/DataError natively, and a
 * future SQLite engine (Phase 6) will map SQLITE_CONSTRAINT failures to the
 * same name.
 */
export function isStorageConstraintError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const name = (error as { name?: unknown }).name;
  return name === 'ConstraintError' || name === 'DataError';
}

/**
 * Platform-agnostic local persistence interface for all structured app data.
 *
 * Implementations: DexieStorageEngine (web, IndexedDB) now; SqliteStorageEngine
 * (native iOS, @capacitor-community/sqlite) in Phase 6. Business logic
 * (repositories, services) must only talk to this interface.
 *
 * Semantics:
 * - `put*` inserts or replaces by primary key.
 * - `catalog` is replaced wholesale on catalog refresh — `clearCatalog` +
 *   `bulkPutCatalog`, not per-entry diffing.
 * - `runInTransaction` runs the action atomically over the given scopes.
 *   Nested calls join the outer transaction. Only storage operations may be
 *   awaited inside the action.
 */
export interface StorageEngine {
  /** Opens the underlying database. Must be called before any other method. */
  initialize(): Promise<void>;

  runInTransaction<T>(scope: readonly StorageScope[], action: () => Promise<T>): Promise<T>;

  // Catalog
  getCatalogEntry(id: string): Promise<CatalogEntry | undefined>;
  listCatalog(): Promise<CatalogEntry[]>;
  putCatalogEntry(entry: CatalogEntry): Promise<void>;
  bulkPutCatalog(entries: CatalogEntry[]): Promise<void>;
  clearCatalog(): Promise<void>;

  // Progress
  getProgress(catalogEntryId: string): Promise<ProgressEntry | undefined>;
  listProgress(): Promise<ProgressEntry[]>;
  putProgress(entry: ProgressEntry): Promise<void>;
  bulkPutProgress(entries: ProgressEntry[]): Promise<void>;

  // Settings (single row)
  getSettings(): Promise<UserSettings | undefined>;
  putSettings(settings: UserSettings): Promise<void>;

  // Image cache
  getImage(key: string): Promise<ImageCacheRecord | undefined>;
  putImage(record: ImageCacheRecord): Promise<void>;
  deleteImage(key: string): Promise<void>;
  clearImageCache(): Promise<void>;

  // Sync metadata
  getSyncMeta(key: string): Promise<SyncMetaEntry | undefined>;
  putSyncMeta(entry: SyncMetaEntry): Promise<void>;
}

export const STORAGE_ENGINE = new InjectionToken<StorageEngine>('STORAGE_ENGINE');
