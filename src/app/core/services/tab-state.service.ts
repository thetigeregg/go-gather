import { Injectable, inject } from '@angular/core';
import { Observable, from, map, tap } from 'rxjs';
import { PreferenceStorageService } from '../storage/preference-storage.service';

const PREFERENCE_KEY = 'lastActiveTab';

const VALID_TABS = ['gather', 'calendar'] as const;
export type TabId = (typeof VALID_TABS)[number];

const DEFAULT_TAB: TabId = 'gather';

function isValidTabId(value: unknown): value is TabId {
  return typeof value === 'string' && (VALID_TABS as readonly string[]).includes(value);
}

/**
 * Remembers which tab was last active so cold app opens land back on it
 * instead of always defaulting to Gather. Device-local UI-chrome state, so
 * it's backed by PreferenceStorageService rather than synced UserSettings.
 */
@Injectable({ providedIn: 'root' })
export class TabStateService {
  private readonly preferenceStorage = inject(PreferenceStorageService);
  private lastTab: TabId = DEFAULT_TAB;

  /** Hydrates state from PreferenceStorageService. Awaited by an app
   * initializer in main.ts before Angular's initial navigation, so the
   * default-route redirect in tabs.routes.ts sees the real persisted value. */
  loadLastActiveTab(): Observable<TabId> {
    return from(this.preferenceStorage.getItem(PREFERENCE_KEY)).pipe(
      map((raw) => (isValidTabId(raw) ? raw : DEFAULT_TAB)),
      tap((tab) => (this.lastTab = tab))
    );
  }

  getLastActiveTab(): TabId {
    return this.lastTab;
  }

  setLastActiveTab(tab: TabId): void {
    this.lastTab = tab;
    this.preferenceStorage.setItem(PREFERENCE_KEY, tab).catch((err: unknown) => {
      console.error('Failed to save last active tab', err);
    });
  }
}
