import { Injectable, inject } from '@angular/core';
import { DexieStorageEngine } from './dexie-storage-engine';
import { StorageEngine } from './storage-engine';

/**
 * Selects and initializes the storage engine during app bootstrap.
 *
 * Web-only for now: always uses DexieStorageEngine. Phase 6 (Native iOS
 * Shell) adds the native branch — detecting the platform, dynamically
 * importing the SQLite modules (kept out of the web bundle), and falling
 * back to Dexie if the native database can't be opened, per
 * `STORAGE-MIGRATION.md`.
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

    await this.dexieEngine.initialize();
    this.engine = this.dexieEngine;
  }

  getEngine(): StorageEngine {
    if (!this.engine) {
      throw new Error('StorageEngineFactory.initialize() must complete before engine use.');
    }

    return this.engine;
  }
}
