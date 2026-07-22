import { Injectable, inject } from '@angular/core';
import { Observable, Subject, from, map, tap } from 'rxjs';
import { EVENT_TYPES } from '@go-gather/shared';
import { PreferenceStorageService } from '../storage/preference-storage.service';

const PREFERENCE_KEY = 'calendarFilterState';

/** Denylist defaults ported verbatim from pogo-cal's src/stores/eventFilter.ts. */
const DEFAULT_DISABLED_EVENT_TYPES: readonly string[] = ['go-pass', 'season'];

export interface CalendarFilterState {
  disabledEventTypes: string[];
  hiddenEventIds: string[];
  filtersApplyToTimeline: boolean;
}

function defaultFilterState(): CalendarFilterState {
  return {
    disabledEventTypes: [...DEFAULT_DISABLED_EVENT_TYPES],
    hiddenEventIds: [],
    filtersApplyToTimeline: false,
  };
}

/** True only when `value` looks like a well-formed CalendarFilterState — a
 * corrupt/partial stored blob falls back to defaultFilterState() rather than
 * being trusted as-is, matching pogo-cal's own try/catch-to-[] serializer. */
function isValidFilterState(value: unknown): value is CalendarFilterState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<CalendarFilterState>;
  return (
    Array.isArray(candidate.disabledEventTypes) &&
    Array.isArray(candidate.hiddenEventIds) &&
    typeof candidate.filtersApplyToTimeline === 'boolean'
  );
}

/**
 * Ported from pogo-cal's src/stores/eventFilter.ts (event-type denylist +
 * per-event hide list) plus its calendarSettings store's
 * filtersApplyToTimeline flag (folded in here rather than a second service —
 * one boolean didn't warrant its own store). Persisted via
 * PreferenceStorageService rather than a StorageEngine scope — small,
 * per-device, UI-chrome-shaped state, not synced domain data.
 *
 * Shape mirrors UserDataService: in-memory field + Subject, not
 * StorageEngine-backed like PokeDataService (this is the first real
 * consumer of PreferenceStorageService).
 */
@Injectable({ providedIn: 'root' })
export class CalendarFilterService {
  private readonly preferenceStorage = inject(PreferenceStorageService);
  private state: CalendarFilterState = defaultFilterState();
  private readonly _filterChange$ = new Subject<CalendarFilterState>();

  /** Hydrates state from PreferenceStorageService. Awaited by an app
   * initializer in main.ts — the filter menu is mounted globally and should
   * reflect real persisted state the instant it's opened. */
  loadFilterState(): Observable<CalendarFilterState> {
    return from(this.preferenceStorage.getItem(PREFERENCE_KEY)).pipe(
      map((raw) => {
        if (!raw) {
          return defaultFilterState();
        }
        try {
          const parsed: unknown = JSON.parse(raw);
          return isValidFilterState(parsed) ? parsed : defaultFilterState();
        } catch {
          return defaultFilterState();
        }
      }),
      tap((state) => (this.state = state))
    );
  }

  getFilterState(): CalendarFilterState {
    return this.state;
  }

  listenForFilterChanges(): Observable<CalendarFilterState> {
    return this._filterChange$.asObservable();
  }

  isEventTypeEnabled(eventType: string): boolean {
    return !this.state.disabledEventTypes.includes(eventType);
  }

  isEventHiddenById(eventId: string): boolean {
    return this.state.hiddenEventIds.includes(eventId);
  }

  /** Combined visibility check — the one predicate calendar/timeline-view
   * code calls downstream. An event type not in EVENT_TYPES (unrecognized by
   * this app) is still visible unless individually hidden or explicitly
   * denylisted, matching the Phase 0/1 unrecognized-type fallback contract. */
  isEventVisible(eventType: string, eventId: string): boolean {
    return this.isEventTypeEnabled(eventType) && !this.isEventHiddenById(eventId);
  }

  toggleEventType(eventType: string): void {
    if (this.isEventTypeEnabled(eventType)) {
      this.disableEventType(eventType);
    } else {
      this.enableEventType(eventType);
    }
  }

  enableEventType(eventType: string): void {
    this.updateState({
      disabledEventTypes: this.state.disabledEventTypes.filter((type) => type !== eventType),
    });
  }

  disableEventType(eventType: string): void {
    if (this.state.disabledEventTypes.includes(eventType)) {
      return;
    }
    this.updateState({
      disabledEventTypes: [...this.state.disabledEventTypes, eventType],
    });
  }

  enableAllEventTypes(): void {
    this.updateState({ disabledEventTypes: [] });
  }

  disableAllEventTypes(): void {
    this.updateState({ disabledEventTypes: Object.keys(EVENT_TYPES) });
  }

  hideEventById(eventId: string): void {
    if (this.state.hiddenEventIds.includes(eventId)) {
      return;
    }
    this.updateState({ hiddenEventIds: [...this.state.hiddenEventIds, eventId] });
  }

  showEventById(eventId: string): void {
    this.updateState({
      hiddenEventIds: this.state.hiddenEventIds.filter((id) => id !== eventId),
    });
  }

  showAllHiddenEvents(): void {
    this.updateState({ hiddenEventIds: [] });
  }

  setFiltersApplyToTimeline(value: boolean): void {
    this.updateState({ filtersApplyToTimeline: value });
  }

  private updateState(partial: Partial<CalendarFilterState>): void {
    this.state = { ...this.state, ...partial };
    this._filterChange$.next(this.state);

    this.preferenceStorage
      .setItem(PREFERENCE_KEY, JSON.stringify(this.state))
      .catch((err: unknown) => {
        console.error('Failed to save calendar filter state', err);
      });
  }
}
