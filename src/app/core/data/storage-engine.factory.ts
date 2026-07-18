import { Injectable, inject } from '@angular/core';
import { DexieStorageEngine } from './dexie-storage-engine';
import { StorageEngine } from './storage-engine';
import { isNativePlatform } from '../utils/native-platform.util';
import type { SqliteConnection } from './sqlite-connection';

/**
 * Selects and initializes the storage engine during app bootstrap: native
 * platforms get SQLite, web keeps Dexie/IndexedDB. If the SQLite database
 * can't be opened, the session falls back to the Dexie engine and retries on
 * next launch. No one-time migration runs here — there's no prior web-only
 * install to migrate from (see docs/progress/phase-6-sqlite-storage.md).
 *
 * initialize() must complete (via provideAppInitializer) before STORAGE_ENGINE
 * is injected anywhere.
 */
@Injectable({ providedIn: 'root' })
export class StorageEngineFactory {
  private readonly dexieEngine = inject(DexieStorageEngine);
  private engine: StorageEngine | null = null;

  async initialize(): Promise<void> {
    if (this.engine) {
      return;
    }

    if (!isNativePlatform()) {
      await this.dexieEngine.initialize();
      this.engine = this.dexieEngine;
      return;
    }

    let connection: SqliteConnection | null = null;

    try {
      const [{ openCapacitorSqliteConnection }, { SqliteStorageEngine }] = await Promise.all([
        import('./sqlite-connection'),
        import('./sqlite-storage-engine'),
      ]);

      connection = await openCapacitorSqliteConnection();

      const sqliteEngine = new SqliteStorageEngine(connection);
      await sqliteEngine.initialize();

      this.engine = sqliteEngine;
    } catch (error: unknown) {
      if (connection) {
        await connection.close().catch(() => undefined);
      }

      console.error('SQLite unavailable, falling back to Dexie', error);
      await this.dexieEngine.initialize();
      this.engine = this.dexieEngine;
    }
  }

  getEngine(): StorageEngine {
    if (!this.engine) {
      throw new Error('StorageEngineFactory.initialize() must complete before engine use.');
    }

    return this.engine;
  }
}
