import { Injectable, inject } from '@angular/core';
import { Observable, Subject, from, map, tap } from 'rxjs';
import { EVENT_TYPES } from '@go-gather/shared';
import { PreferenceStorageService } from '../storage/preference-storage.service';
import { UserDataService } from './user-data.service';

const PREFERENCE_KEY = 'calendarFilterState';

export interface CalendarFilterState {
  disabledEventTypes: string[];
  hiddenEventIds: string[];
  filtersApplyToTimeline: boolean;
}

/** The only part of CalendarFilterState still persisted device-locally —
 * disabledEventTypes/hiddenEventIds moved to UserSettings (synced,
 * backend-authoritative) so the server-side notification scheduler can
 * filter events out before sending a push; a push can't be recalled once
 * delivered. filtersApplyToTimeline is a pure UI display toggle with no
 * server-side relevance, so it stays here. */
interface LocalFilterState {
  filtersApplyToTimeline: boolean;
}

function defaultLocalFilterState(): LocalFilterState {
  return { filtersApplyToTimeline: false };
}

/** True only when `value` looks like a well-formed LocalFilterState — a
 * corrupt/partial stored blob falls back to defaultLocalFilterState()
 * rather than being trusted as-is. */
function isValidLocalFilterState(value: unknown): value is LocalFilterState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<LocalFilterState>;
  return typeof candidate.filtersApplyToTimeline === 'boolean';
}

/**
 * Event-type denylist + per-event hide list (`disabledEventTypes`/
 * `hiddenEventIds`) are backed by `UserDataService`/`UserSettings` — synced,
 * backend-authoritative, so the server can filter hidden/disabled events out
 * before sending a calendar-event push notification. `filtersApplyToTimeline`
 * remains device-local via `PreferenceStorageService`, since it's a display
 * toggle with no server-side meaning.
 */
@Injectable({ providedIn: 'root' })
export class CalendarFilterService {
  private readonly preferenceStorage = inject(PreferenceStorageService);
  private readonly userDataService = inject(UserDataService);
  private localState: LocalFilterState = defaultLocalFilterState();
  private readonly _filterChange$ = new Subject<CalendarFilterState>();

  constructor() {
    // Re-emit on this service's own change stream whenever the migrated
    // fields change via UserDataService, so existing subscribers (calendar/
    // timeline components) don't need to change their subscription target.
    this.userDataService.listenForUserSettingsChanges().subscribe(() => {
      this._filterChange$.next(this.getFilterState());
    });
  }

  /** Hydrates the local-only part of state from PreferenceStorageService.
   * Awaited by an app initializer in main.ts alongside
   * UserDataService.loadSettings() — the filter menu is mounted globally and
   * should reflect real persisted state the instant it's opened. */
  loadFilterState(): Observable<CalendarFilterState> {
    return from(this.preferenceStorage.getItem(PREFERENCE_KEY)).pipe(
      map((raw) => {
        if (!raw) {
          return defaultLocalFilterState();
        }
        try {
          const parsed: unknown = JSON.parse(raw);
          return isValidLocalFilterState(parsed) ? parsed : defaultLocalFilterState();
        } catch {
          return defaultLocalFilterState();
        }
      }),
      tap((state) => (this.localState = state)),
      map(() => this.getFilterState())
    );
  }

  getFilterState(): CalendarFilterState {
    const settings = this.userDataService.getUserSettings();
    return {
      disabledEventTypes: settings.disabledEventTypes,
      hiddenEventIds: settings.hiddenEventIds,
      filtersApplyToTimeline: this.localState.filtersApplyToTimeline,
    };
  }

  listenForFilterChanges(): Observable<CalendarFilterState> {
    return this._filterChange$.asObservable();
  }

  isEventTypeEnabled(eventType: string): boolean {
    return !this.userDataService.getUserSettings().disabledEventTypes.includes(eventType);
  }

  isEventHiddenById(eventId: string): boolean {
    return this.userDataService.getUserSettings().hiddenEventIds.includes(eventId);
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
    const disabledEventTypes = this.userDataService
      .getUserSettings()
      .disabledEventTypes.filter((type) => type !== eventType);
    this.updateDisabledEventTypes(disabledEventTypes);
  }

  disableEventType(eventType: string): void {
    const current = this.userDataService.getUserSettings().disabledEventTypes;
    if (current.includes(eventType)) {
      return;
    }
    this.updateDisabledEventTypes([...current, eventType]);
  }

  enableAllEventTypes(): void {
    this.updateDisabledEventTypes([]);
  }

  disableAllEventTypes(): void {
    this.updateDisabledEventTypes(Object.keys(EVENT_TYPES));
  }

  hideEventById(eventId: string): void {
    const current = this.userDataService.getUserSettings().hiddenEventIds;
    if (current.includes(eventId)) {
      return;
    }
    this.updateHiddenEventIds([...current, eventId]);
  }

  showEventById(eventId: string): void {
    const hiddenEventIds = this.userDataService
      .getUserSettings()
      .hiddenEventIds.filter((id) => id !== eventId);
    this.updateHiddenEventIds(hiddenEventIds);
  }

  showAllHiddenEvents(): void {
    this.updateHiddenEventIds([]);
  }

  setFiltersApplyToTimeline(value: boolean): void {
    this.localState = { ...this.localState, filtersApplyToTimeline: value };
    this._filterChange$.next(this.getFilterState());

    this.preferenceStorage
      .setItem(PREFERENCE_KEY, JSON.stringify(this.localState))
      .catch((err: unknown) => {
        console.error('Failed to save calendar filter state', err);
      });
  }

  private updateDisabledEventTypes(disabledEventTypes: string[]): void {
    this.userDataService.updateUserSettings({ disabledEventTypes });
  }

  private updateHiddenEventIds(hiddenEventIds: string[]): void {
    this.userDataService.updateUserSettings({ hiddenEventIds });
  }
}
