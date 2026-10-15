import { Injectable, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import type { CatalogEntry } from '@go-gather/shared';
import { StorageEngineFactory } from '../data/storage-engine.factory';
import { hasReleaseDate, localDateString } from './catalog-release.util';
import {
  AvailabilityChange,
  availabilityChangeKey,
  diffAvailability,
  mergeAvailabilityChanges,
} from './availability-changes.util';

/** The device-local date availability was last compared at. Together with
 * the catalog in storage it's the "last seen" state, so no copy of the
 * catalog is kept. */
const CHECK_DATE_KEY = 'availabilityCheckDate';
const PENDING_KEY = 'pendingAvailabilityChanges';

/**
 * Tracks which catalog entries became available, were announced or stopped
 * being available since the user last saw a summary — whether from a
 * catalog pull (Bulbapedia data changed) or an announced date arriving — and
 * keeps them in storage until acknowledged, so they survive an OTA reload or
 * the app being closed before they're shown.
 */
@Injectable({ providedIn: 'root' })
export class AvailabilityChangesService {
  private readonly storageEngineFactory = inject(StorageEngineFactory);
  private readonly _pending$ = new Subject<void>();

  /** Emits when changes are waiting to be shown. */
  readonly pending$: Observable<void> = this._pending$.asObservable();

  /** Resolved lazily, like SyncService's, since storage initializes in the
   * same app-initializer chain this service is first injected in. */
  private get engine() {
    return this.storageEngineFactory.getEngine();
  }

  /**
   * Records the changes between the catalog being replaced and its
   * replacement. Called inside the transaction that replaces the catalog
   * (whose scope includes `syncMeta`), so both commit together; call
   * `publishPending()` once it has.
   */
  recordCatalogReplacement(
    previous: readonly CatalogEntry[],
    next: readonly CatalogEntry[],
    today: string = localDateString()
  ): Promise<void> {
    return this.engine.runInTransaction(['syncMeta'], () => this.record(previous, next, today));
  }

  /** Records what changed by date alone since the last check — announced
   * releases whose day arrived — then publishes anything pending, including
   * changes left unseen by an earlier session. */
  async checkForDateChanges(today: string = localDateString()): Promise<void> {
    // Already checked today (or later, see record): nothing can have changed
    // by date, so skip reading the whole catalog.
    const checked = await this.engine.getSyncMeta(CHECK_DATE_KEY);
    if (checked === undefined || checked.value < today) {
      await this.engine.runInTransaction(['catalog', 'syncMeta'], async () => {
        const catalog = await this.engine.listCatalog();
        await this.record(catalog, catalog, today);
      });
    }
    await this.publishPending();
  }

  async publishPending(): Promise<void> {
    if ((await this.getPending()).length > 0) {
      this._pending$.next();
    }
  }

  async getPending(): Promise<AvailabilityChange[]> {
    const meta = await this.engine.getSyncMeta(PENDING_KEY);
    if (!meta) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(meta.value);
      return Array.isArray(parsed) ? (parsed as AvailabilityChange[]) : [];
    } catch {
      return [];
    }
  }

  /** Drops the changes the user has seen. Any that arrived while they were
   * being shown stay pending. */
  acknowledge(shown: readonly AvailabilityChange[]): Promise<void> {
    const shownKeys = new Set(shown.map(availabilityChangeKey));
    return this.engine.runInTransaction(['syncMeta'], async () => {
      const remaining = (await this.getPending()).filter(
        (change) => !shownKeys.has(availabilityChangeKey(change))
      );
      await this.putPending(remaining);
    });
  }

  private async record(
    previous: readonly CatalogEntry[],
    next: readonly CatalogEntry[],
    today: string
  ): Promise<void> {
    const checked = await this.engine.getSyncMeta(CHECK_DATE_KEY);
    // The app goes by the device date, but one that moves backwards
    // (crossing time zones westward, a clock change) is ignored here:
    // listing released entries as announced, then as available again once
    // the date catches up, would only be noise.
    const date = checked !== undefined && checked.value > today ? checked.value : today;
    // Without a previous check, or a previous catalog to compare (a fresh
    // install, or one cached before release dates existed, which shows every
    // entry), there's no "last seen" state: comparing would list most of the
    // catalog. Start from today instead.
    const hasBaseline =
      checked !== undefined && previous.length > 0 && previous.every(hasReleaseDate);
    if (hasBaseline) {
      const changes = diffAvailability(previous, checked.value, next, date);
      if (changes.length > 0) {
        await this.putPending(mergeAvailabilityChanges(await this.getPending(), changes));
      }
    }
    if (checked?.value !== date) {
      await this.engine.putSyncMeta({ key: CHECK_DATE_KEY, value: date });
    }
  }

  private putPending(changes: readonly AvailabilityChange[]): Promise<void> {
    return this.engine.putSyncMeta({ key: PENDING_KEY, value: JSON.stringify(changes) });
  }
}
