import { CatalogEntry } from '@go-gather/shared';
import { Observable, defer, filter, interval, map } from 'rxjs';

const DATE_CHECK_INTERVAL_MS = 60_000;

/** The device-local calendar date as `YYYY-MM-DD`, the same format as
 * `CatalogEntry.releasedOn`, so the two compare as plain strings. */
export function localDateString(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(date.getFullYear())}-${month}-${day}`;
}

/**
 * Whether a catalog entry is out in Pokemon GO as of `today` (see
 * `localDateString`). Announced releases carry a future `releasedOn` and
 * become visible on that date without a re-sync; `null` means not released.
 */
export function isReleased(entry: CatalogEntry, today: string): boolean {
  // A catalog cached on-device before release dates existed has no
  // `releasedOn` at all (not `null`) until the next catalog pull. Treating
  // it as released keeps an app update that lands before the server's next
  // sync from hiding every entry.
  const { releasedOn } = entry as { releasedOn?: string | null };
  if (releasedOn === undefined) {
    return true;
  }
  return releasedOn !== null && releasedOn <= today;
}

/**
 * Emits the new device-local date each time it changes, so a screen left
 * open across midnight can re-filter and show that day's releases. Checked
 * once a minute rather than with a timer aimed at midnight: timers don't
 * run while the app is in the background, and a periodic check also
 * catches up within a minute of the app returning to the foreground.
 */
export function localDateChanges(checkEveryMs = DATE_CHECK_INTERVAL_MS): Observable<string> {
  return defer(() => {
    let current = localDateString();
    return interval(checkEveryMs).pipe(
      map(() => localDateString()),
      filter((date) => {
        const changed = date !== current;
        current = date;
        return changed;
      })
    );
  });
}
