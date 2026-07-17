import { Injectable, inject } from '@angular/core';
import type { ProgressEntry, UserSettings } from '@go-gather/shared';
import { OutboxEntry, STORAGE_ENGINE, StorageEngine, StorageScope } from './storage-engine';
import { SYNC_OUTBOX_WRITER, SyncOutboxWriter } from './sync-outbox-writer';

/**
 * Local-first read/write surface for `progress`/`settings` — the backend is
 * the durable source of truth (matching game-shelf), so every mutating
 * method here writes the local `StorageEngine` scope *and* enqueues an
 * `outbox` entry in one transaction, then fires a best-effort sync attempt.
 * Reads go straight to the local engine (instant, offline-capable).
 *
 * Ported from game-shelf's `LocalGameRepository`/`withOutboxTransaction`
 * pattern, scaled down to go-gather's two entity types.
 */
@Injectable({ providedIn: 'root' })
export class LocalUserDataRepository {
  private readonly engine: StorageEngine = inject(STORAGE_ENGINE);
  private readonly outboxWriter = inject<SyncOutboxWriter | null>(SYNC_OUTBOX_WRITER, {
    optional: true,
  });

  getProgress(catalogEntryId: string): Promise<ProgressEntry | undefined> {
    return this.engine.getProgress(catalogEntryId);
  }

  listProgress(): Promise<ProgressEntry[]> {
    return this.engine.listProgress();
  }

  getSettings(): Promise<UserSettings | undefined> {
    return this.engine.getSettings();
  }

  async setCaught(catalogEntryId: string, caught: boolean): Promise<void> {
    const updatedAt = new Date().toISOString();
    const entry: ProgressEntry = { catalogEntryId, caught, updatedAt };

    await this.withOutboxTransaction(['progress'], () =>
      this.engine.putProgress(entry).then(() => this.queueUpsert('progress', entry, updatedAt))
    );
  }

  async updateSettings(settings: UserSettings): Promise<void> {
    const clientTimestamp = new Date().toISOString();

    await this.withOutboxTransaction(['settings'], () =>
      this.engine
        .putSettings(settings)
        .then(() => this.queueUpsert('settings', settings, clientTimestamp))
    );
  }

  private withOutboxTransaction<T>(
    scope: readonly StorageScope[],
    action: () => Promise<T>
  ): Promise<T> {
    if (!this.outboxWriter) {
      return action();
    }

    return this.engine.runInTransaction([...scope, 'outbox'], action).then((result) => {
      this.requestSyncNow();
      return result;
    });
  }

  private queueUpsert(
    entityType: OutboxEntry['entityType'],
    payload: unknown,
    clientTimestamp: string
  ): Promise<void> {
    if (!this.outboxWriter) {
      return Promise.resolve();
    }

    const entry: OutboxEntry = {
      opId: crypto.randomUUID(),
      entityType,
      operation: 'upsert',
      payload,
      clientTimestamp,
      createdAt: new Date().toISOString(),
      attemptCount: 0,
      lastError: null,
    };

    return this.engine.putOutboxEntry(entry).then(() => {
      try {
        this.outboxWriter?.onOutboxEntryEnqueued?.(entry);
      } catch {
        // Observability hook failure shouldn't break the write.
      }
    });
  }

  private requestSyncNow(): void {
    if (!this.outboxWriter?.syncNow) {
      return;
    }

    try {
      void this.outboxWriter.syncNow().catch(() => undefined);
    } catch {
      // Best-effort — sync errors are handled/logged inside SyncService.
    }
  }
}
