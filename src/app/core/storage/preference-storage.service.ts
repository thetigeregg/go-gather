import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Thin wrapper around @capacitor/preferences for small key-value settings
 * (UI chrome state, etc.) — distinct from the structured `StorageEngine`,
 * which holds domain data (catalog/progress/settings).
 *
 * `@capacitor/preferences` falls back to localStorage on web automatically,
 * so no platform branching is needed here. Simpler than game-shelf's
 * equivalent: go-gather is a fresh app with no legacy localStorage data to
 * migrate and, as of this phase, no consumers needing synchronous reads —
 * if one shows up later, an in-memory cache can be added then.
 */
@Injectable({ providedIn: 'root' })
export class PreferenceStorageService {
  async getItem(key: string): Promise<string | null> {
    const result = await Preferences.get({ key });
    return result.value;
  }

  async setItem(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }

  async removeItem(key: string): Promise<void> {
    await Preferences.remove({ key });
  }
}
