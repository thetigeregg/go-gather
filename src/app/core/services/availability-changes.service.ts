import { Injectable, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import type { CatalogEntry } from '@go-gather/shared';
import { StorageEngineFactory } from '../data/storage-engine.factory';
import { hasReleaseDate, localDateString } from './catalog-release.util';
import {
  AvailabilityChange,
  AvailabilityLogEntry,
  appendToAvailabilityLog,
  availabilityChangeKey,
  diffAvailability,
  mergeAvailabilityChanges,
} from './availability-changes.util';

/** The device-local date availability was last compared at. Together with
 * the catalog in storage it's the "last seen" state, so no copy of the
 * catalog is kept. */
const CHECK_DATE_KEY = 'availabilityCheckDate';
/** Changes not yet shown. */
const PENDING_KEY = 'pendingAvailabilityChanges';
/** The changes on screen (see takePending) until acknowledged. Changes
 * recorded meanwhile are measured from it, so one that reverses what the
 * sheet shows is reported rather than dropped. */
const SHOWN_KEY = 'shownAvailabilityChanges';
/** Every change shown, by the date it first went on screen (see
 * takePending), for the availability history page. */
const LOG_KEY = 'availabilityChangeLog';
/** Dates kept in the log. */
const MAX_LOG_ENTRIES = 100;

/**
 * Tracks which catalog entries became available, were announced or stopped
 * being available since the user last saw a summary — whether from a
 * catalog pull (Bulbapedia data changed) or an announced date arriving — and
 * keeps them in storage until acknowledged, so they survive an OTA reload or
 * the app being closed before they're shown or dismissed.
 */
@Injectable({ providedIn: 'root' })
export class AvailabilityChangesService {
  private readonly storageEngineFactory = inject(StorageEngineFactory);
  private readonly _pending$ = new Subject<void>();
  private readonly _logged$ = new Subject<void>();

  /** Emits when changes are waiting to be shown. */
  readonly pending$: Observable<void> = this._pending$.asObservable();

  /** Emits when changes were added to the log. */
  readonly logged$: Observable<void> = this._logged$.asObservable();

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

  /** Emits if changes are pending, or were shown but never dismissed (the
   * app closed with the sheet open). */
  async publishPending(): Promise<void> {
    if ((await this.getPending()).length > 0 || (await this.getShown()).length > 0) {
      this._pending$.next();
    }
  }

  /** Changes recorded and not yet shown. */
  getPending(): Promise<AvailabilityChange[]> {
    return this.readJsonArray(PENDING_KEY);
  }

  /** Every change shown, newest date first. */
  getLog(): Promise<AvailabilityLogEntry[]> {
    return this.readJsonArray(LOG_KEY);
  }

  /**
   * Returns the changes to show, folding the pending ones into any shown
   * before but never dismissed, and keeps them as the shown snapshot until
   * acknowledged. Changes going on screen for the first time are logged
   * now rather than on dismissal, so they're kept even if the sheet is
   * never dismissed; ones still in the snapshot (the app closed with the
   * sheet open) were logged when first shown.
   */
  async takePending(today: string = localDateString()): Promise<AvailabilityChange[]> {
    const { shown, firstShown } = await this.engine.runInTransaction(['syncMeta'], async () => {
      const previous = await this.getShown();
      const previousKeys = new Set(previous.map(availabilityChangeKey));
      const merged = mergeAvailabilityChanges(previous, await this.getPending());
      const unseen = merged.filter((change) => !previousKeys.has(availabilityChangeKey(change)));
      if (unseen.length > 0) {
        const log = appendToAvailabilityLog(await this.getLog(), unseen, today, MAX_LOG_ENTRIES);
        await this.putJson(LOG_KEY, log);
      }
      await this.putJson(SHOWN_KEY, merged);
      await this.putJson(PENDING_KEY, []);
      return { shown: merged, firstShown: unseen };
    });
    if (firstShown.length > 0) {
      this._logged$.next();
    }
    return shown;
  }

  /** Drops the changes the user has seen. Any recorded while they were being
   * shown stay pending. */
  acknowledge(shown: readonly AvailabilityChange[]): Promise<void> {
    const shownKeys = new Set(shown.map(availabilityChangeKey));
    return this.engine.runInTransaction(['syncMeta'], async () => {
      const remaining = (await this.getShown()).filter(
        (change) => !shownKeys.has(availabilityChangeKey(change))
      );
      await this.putJson(SHOWN_KEY, remaining);
    });
  }

  private getShown(): Promise<AvailabilityChange[]> {
    return this.readJsonArray(SHOWN_KEY);
  }

  private async readJsonArray<T>(key: string): Promise<T[]> {
    const meta = await this.engine.getSyncMeta(key);
    if (!meta) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(meta.value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
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
        const pending = mergeAvailabilityChanges(
          await this.getPending(),
          changes,
          await this.getShown()
        );
        await this.putJson(PENDING_KEY, pending);
      }
    }
    if (checked?.value !== date) {
      await this.engine.putSyncMeta({ key: CHECK_DATE_KEY, value: date });
    }
  }

  private putJson(key: string, value: unknown): Promise<void> {
    return this.engine.putSyncMeta({ key, value: JSON.stringify(value) });
  }
}
