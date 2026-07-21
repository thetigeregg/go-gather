import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import type {
  CatalogEntry,
  PogoEvent,
  ProgressEntry,
  Season,
  UserSettings,
} from '@go-gather/shared';
import { OutboxEntry } from '../data/storage-engine';
import { StorageEngineFactory } from '../data/storage-engine.factory';
import { SyncOutboxWriteRequest, SyncOutboxWriter } from '../data/sync-outbox-writer';
import { environment } from '../../../environments/environment';

const SYNC_INTERVAL_MS = 30_000;
const CATALOG_VERSION_KEY = 'catalogVersion';
const CALENDAR_EVENTS_VERSION_KEY = 'calendarEventsVersion';
const SEASON_VERSION_KEY = 'seasonVersion';
const PULL_CURSOR_KEY = 'progressSettingsCursor';

interface CatalogResponse {
  syncedAt: string | null;
  entries: CatalogEntry[];
}

interface CalendarEventsResponse {
  syncedAt: string | null;
  entries: PogoEvent[];
}

interface CalendarSeasonResponse {
  syncedAt: string | null;
  season: Season | null;
}

interface SyncPushResult {
  opId: string;
  status: 'applied' | 'duplicate' | 'failed';
  message?: string;
}

interface SyncPushResponse {
  results: SyncPushResult[];
}

interface SyncChangeEvent {
  eventId: string;
  entityType: OutboxEntry['entityType'];
  operation: 'upsert';
  payload: ProgressEntry | UserSettings;
  serverTimestamp: string;
}

interface SyncPullResponse {
  cursor: string;
  changes: SyncChangeEvent[];
}

/**
 * Handles all three sync concerns in one cycle: catalog pull (one-way, from
 * the server), and progress/settings outbox push + change-log pull
 * (bidirectional, backend is the source of truth) — ported/adapted from
 * game-shelf's `GameSyncService`, scaled down (no request batching, no
 * jsonb-style partial merge, no 24h self-healing replay pass — see
 * docs/progress/phase-4-catalog-pipeline.md).
 */
@Injectable({ providedIn: 'root' })
export class SyncService implements SyncOutboxWriter {
  private readonly http = inject(HttpClient);
  private readonly storageEngineFactory = inject(StorageEngineFactory);
  private syncInFlight = false;
  private readonly _catalogSync$ = new Subject<void>();
  private readonly _calendarEventsSync$ = new Subject<void>();
  private readonly _seasonSync$ = new Subject<void>();

  /**
   * Resolved lazily (not as a field initializer) since `SyncService` is
   * constructed as part of the same app-initializer chain that calls
   * `StorageEngineFactory.initialize()` — by the time any method below
   * actually runs, that initialize() call has resolved, but at
   * *construction* time it may not have yet.
   */
  private get engine() {
    return this.storageEngineFactory.getEngine();
  }

  initialize(): void {
    void this.syncNow();
    window.setInterval(() => void this.syncNow(), SYNC_INTERVAL_MS);
    window.addEventListener('online', () => void this.syncNow());
  }

  /** Emits whenever `pullCatalog()` writes a new catalog to local storage —
   * lets pages that already rendered a stale/empty catalog snapshot (e.g. the
   * app's very first load, which always reads local storage before this
   * service's first sync has had a chance to populate it) refresh themselves
   * instead of being stuck until the next full page reload. */
  listenForCatalogSync(): Observable<void> {
    return this._catalogSync$.asObservable();
  }

  /** Same rationale as listenForCatalogSync(), for the Calendar tab's events. */
  listenForCalendarEventsSync(): Observable<void> {
    return this._calendarEventsSync$.asObservable();
  }

  /** Same rationale as listenForCatalogSync(), for the Season "Daily Discovery" data. */
  listenForSeasonSync(): Observable<void> {
    return this._seasonSync$.asObservable();
  }

  async enqueueOperation(request: SyncOutboxWriteRequest): Promise<void> {
    const entry: OutboxEntry = {
      opId: request.opId ?? crypto.randomUUID(),
      entityType: request.entityType,
      operation: request.operation,
      payload: request.payload,
      clientTimestamp: request.clientTimestamp ?? new Date().toISOString(),
      createdAt: new Date().toISOString(),
      attemptCount: 0,
      lastError: null,
    };

    await this.engine.putOutboxEntry(entry);
    this.onOutboxEntryEnqueued(entry);
    this.requestSyncNow();
  }

  onOutboxEntryEnqueued(entry: OutboxEntry): void {
    // Observability hook only — no logging service ported yet (Phase 5+).
    void entry;
  }

  requestSyncNow(): void {
    void this.syncNow();
  }

  async syncNow(): Promise<void> {
    if (this.syncInFlight || !navigator.onLine) {
      return;
    }

    this.syncInFlight = true;

    try {
      await this.pushOutbox();
      await this.pullChanges();
      await this.pullCatalog();
      await this.pullCalendarEvents();
      await this.pullSeason();
    } catch {
      // Best-effort: failures are retried on the next interval/online/write
      // trigger. No connectivity-status tracking yet (Phase 5+ concern).
    } finally {
      this.syncInFlight = false;
    }
  }

  private async pushOutbox(): Promise<void> {
    const entries = await this.engine.listOutboxOrderedByCreatedAt();
    if (entries.length === 0) {
      return;
    }

    const operations = entries.map((entry) => ({
      opId: entry.opId,
      entityType: entry.entityType,
      operation: entry.operation,
      payload: entry.payload,
      clientTimestamp: entry.clientTimestamp,
    }));

    const response = await firstValueFrom(
      this.http.post<SyncPushResponse>(`${environment.apiUrl}/api/sync/push`, { operations })
    );

    const ackedIds = response.results
      .filter((result) => result.status === 'applied' || result.status === 'duplicate')
      .map((result) => result.opId);

    if (ackedIds.length > 0) {
      await this.engine.bulkDeleteOutbox(ackedIds);
    }

    const failures = response.results.filter((result) => result.status === 'failed');
    for (const failure of failures) {
      const existing = await this.engine.getOutboxEntry(failure.opId);
      if (!existing) {
        continue;
      }

      await this.engine.putOutboxEntry({
        ...existing,
        attemptCount: existing.attemptCount + 1,
        lastError: failure.message ?? 'Failed to push operation.',
      });
    }
  }

  private async pullChanges(): Promise<void> {
    const cursorMeta = await this.engine.getSyncMeta(PULL_CURSOR_KEY);
    const cursor = cursorMeta ? Number(cursorMeta.value) : 0;

    const response = await firstValueFrom(
      this.http.post<SyncPullResponse>(`${environment.apiUrl}/api/sync/pull`, { cursor })
    );

    for (const change of response.changes) {
      if (change.entityType === 'progress') {
        await this.engine.putProgress(change.payload as ProgressEntry);
      } else {
        await this.engine.putSettings(change.payload as UserSettings);
      }
    }

    if (response.cursor !== String(cursor)) {
      await this.engine.putSyncMeta({ key: PULL_CURSOR_KEY, value: response.cursor });
    }
  }

  private async pullCatalog(): Promise<void> {
    const response = await firstValueFrom(
      this.http.get<CatalogResponse>(`${environment.apiUrl}/api/catalog`)
    );

    const currentVersion = await this.engine.getSyncMeta(CATALOG_VERSION_KEY);
    if (response.syncedAt && response.syncedAt === currentVersion?.value) {
      return;
    }

    await this.engine.runInTransaction(['catalog', 'syncMeta'], async () => {
      await this.engine.clearCatalog();
      await this.engine.bulkPutCatalog(response.entries);
      if (response.syncedAt) {
        await this.engine.putSyncMeta({ key: CATALOG_VERSION_KEY, value: response.syncedAt });
      }
    });

    this._catalogSync$.next();
  }

  private async pullCalendarEvents(): Promise<void> {
    const response = await firstValueFrom(
      this.http.get<CalendarEventsResponse>(`${environment.apiUrl}/api/calendar-events`)
    );

    const currentVersion = await this.engine.getSyncMeta(CALENDAR_EVENTS_VERSION_KEY);
    if (response.syncedAt && response.syncedAt === currentVersion?.value) {
      return;
    }

    await this.engine.runInTransaction(['calendarEvents', 'syncMeta'], async () => {
      await this.engine.clearCalendarEvents();
      await this.engine.bulkPutCalendarEvents(response.entries);
      if (response.syncedAt) {
        await this.engine.putSyncMeta({
          key: CALENDAR_EVENTS_VERSION_KEY,
          value: response.syncedAt,
        });
      }
    });

    this._calendarEventsSync$.next();
  }

  private async pullSeason(): Promise<void> {
    const response = await firstValueFrom(
      this.http.get<CalendarSeasonResponse>(`${environment.apiUrl}/api/calendar-season`)
    );

    const currentVersion = await this.engine.getSyncMeta(SEASON_VERSION_KEY);
    if (response.syncedAt && response.syncedAt === currentVersion?.value) {
      return;
    }

    const season = response.season;
    if (!season) {
      return;
    }

    await this.engine.runInTransaction(['season', 'syncMeta'], async () => {
      await this.engine.putSeason(season);
      if (response.syncedAt) {
        await this.engine.putSyncMeta({ key: SEASON_VERSION_KEY, value: response.syncedAt });
      }
    });

    this._seasonSync$.next();
  }
}
