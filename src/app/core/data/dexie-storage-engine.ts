import { Injectable, inject } from '@angular/core';
import Dexie, { Table, Transaction } from 'dexie';
import type { CatalogEntry, ProgressEntry, UserSettings } from '@go-gather/shared';
import { AppDb, SettingsRow } from './app-db';
import { ImageCacheRecord, StorageEngine, StorageScope, SyncMetaEntry } from './storage-engine';
import {
  isInsideStorageTransaction,
  runInsideStorageTransactionZone,
} from './storage-transaction-context';

interface ActiveTransaction {
  transaction: Transaction;
  scope: ReadonlySet<StorageScope>;
}

const SCOPE_TABLE_NAMES: Record<StorageScope, string> = {
  catalog: 'catalog',
  progress: 'progress',
  settings: 'settings',
  imageCache: 'imageCache',
  syncMeta: 'syncMeta',
};

const SETTINGS_ROW_ID = 1;

/**
 * IndexedDB-backed storage engine used on the web, delegating to the Dexie
 * schema in AppDb.
 *
 * While a runInTransaction action is executing, operations on tables in the
 * transaction scope are routed through transaction-bound table handles rather
 * than relying solely on Dexie's PSD zone propagation. Zone echo across
 * multiple native awaits is unreliable in some environments (e.g. jsdom +
 * fake-indexeddb), causing PrematureCommitError; explicit routing keeps the
 * transaction alive and correctly scoped regardless.
 */
@Injectable({ providedIn: 'root' })
export class DexieStorageEngine implements StorageEngine {
  private readonly db = inject(AppDb);
  private activeTransaction: ActiveTransaction | null = null;
  private transactionQueue: Promise<unknown> = Promise.resolve();

  initialize(): Promise<void> {
    // Dexie opens lazily on first use; nothing to do here.
    return Promise.resolve();
  }

  runInTransaction<T>(scope: readonly StorageScope[], action: () => Promise<T>): Promise<T> {
    if (this.isNestedTransactionCall()) {
      return action();
    }

    const run = (): Promise<T> =>
      this.db.transaction('rw', this.tablesForScope(scope), (transaction) => {
        const previous = this.activeTransaction;
        this.activeTransaction = { transaction, scope: new Set(scope) };
        return runInsideStorageTransactionZone(() => action()).finally(() => {
          this.activeTransaction = previous;
        });
      });

    const queued = this.transactionQueue.then(run, run);
    this.transactionQueue = queued.catch(() => undefined);
    return queued;
  }

  getCatalogEntry(id: string): Promise<CatalogEntry | undefined> {
    return this.catalogTable.get(id);
  }

  listCatalog(): Promise<CatalogEntry[]> {
    return this.catalogTable.toArray();
  }

  putCatalogEntry(entry: CatalogEntry): Promise<void> {
    return this.catalogTable.put(entry).then(() => undefined);
  }

  bulkPutCatalog(entries: CatalogEntry[]): Promise<void> {
    return this.catalogTable.bulkPut(entries).then(() => undefined);
  }

  clearCatalog(): Promise<void> {
    return this.catalogTable.clear();
  }

  getProgress(catalogEntryId: string): Promise<ProgressEntry | undefined> {
    return this.progressTable.get(catalogEntryId);
  }

  listProgress(): Promise<ProgressEntry[]> {
    return this.progressTable.toArray();
  }

  putProgress(entry: ProgressEntry): Promise<void> {
    return this.progressTable.put(entry).then(() => undefined);
  }

  bulkPutProgress(entries: ProgressEntry[]): Promise<void> {
    return this.progressTable.bulkPut(entries).then(() => undefined);
  }

  getSettings(): Promise<UserSettings | undefined> {
    return this.settingsTable.get(SETTINGS_ROW_ID);
  }

  putSettings(settings: UserSettings): Promise<void> {
    return this.settingsTable.put({ id: SETTINGS_ROW_ID, ...settings }).then(() => undefined);
  }

  getImage(key: string): Promise<ImageCacheRecord | undefined> {
    return this.imageCacheTable.get(key);
  }

  putImage(record: ImageCacheRecord): Promise<void> {
    return this.imageCacheTable.put(record).then(() => undefined);
  }

  deleteImage(key: string): Promise<void> {
    return this.imageCacheTable.delete(key);
  }

  clearImageCache(): Promise<void> {
    return this.imageCacheTable.clear();
  }

  getSyncMeta(key: string): Promise<SyncMetaEntry | undefined> {
    return this.syncMetaTable.get(key);
  }

  putSyncMeta(entry: SyncMetaEntry): Promise<void> {
    return this.syncMetaTable.put(entry).then(() => undefined);
  }

  private get catalogTable(): Table<CatalogEntry, string> {
    return this.resolveTable('catalog', this.db.catalog);
  }

  private get progressTable(): Table<ProgressEntry, string> {
    return this.resolveTable('progress', this.db.progress);
  }

  private get settingsTable(): Table<SettingsRow, number> {
    return this.resolveTable('settings', this.db.settings);
  }

  private get imageCacheTable(): Table<ImageCacheRecord, string> {
    return this.resolveTable('imageCache', this.db.imageCache);
  }

  private get syncMetaTable(): Table<SyncMetaEntry, string> {
    return this.resolveTable('syncMeta', this.db.syncMeta);
  }

  private resolveTable<T, K>(scopeName: StorageScope, fallback: Table<T, K>): Table<T, K> {
    const active = this.activeTransaction;

    if (active && active.scope.has(scopeName)) {
      return active.transaction.table<T, K>(SCOPE_TABLE_NAMES[scopeName]);
    }

    return fallback;
  }

  private tablesForScope(scope: readonly StorageScope[]): Table<unknown, unknown>[] {
    return scope.map((store) => this.db.table(SCOPE_TABLE_NAMES[store]));
  }

  private isNestedTransactionCall(): boolean {
    const active = this.activeTransaction;
    if (!active || !isInsideStorageTransaction()) {
      return false;
    }

    const currentTransaction = Dexie.currentTransaction as Transaction | undefined;
    return !currentTransaction || currentTransaction === active.transaction;
  }
}
