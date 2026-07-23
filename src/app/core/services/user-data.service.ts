import { Injectable, inject } from '@angular/core';
import { Observable, Subject, from, map, switchMap, tap } from 'rxjs';
import {
  DEFAULT_SETTINGS,
  ExportBundle,
  ProgressEntry,
  UnifiedRegion,
  UserSettings,
} from '@go-gather/shared';
import { LocalUserDataRepository } from '../data/local-user-data-repository';

/** Maps a species' origin generation (1-9) to its region, mirroring the
 * mainline-game generation/region pairing. Generation 8 is Galar (Sword/
 * Shield); Hisui has no origin-generation bucket in this data (see
 * `UnifiedRegion` above), so it's absent from this map by design — it can
 * only be reached via `CatalogEntry.region`, never `generation`. */
export const REGION_BY_GENERATION: Record<number, UnifiedRegion> = {
  1: 'kanto',
  2: 'johto',
  3: 'hoenn',
  4: 'sinnoh',
  5: 'unova',
  6: 'kalos',
  7: 'alola',
  8: 'galar',
  9: 'paldea',
};

/**
 * Ported from go-gather-next's `user-data.service.ts`, re-pointed at
 * `LocalUserDataRepository` instead of `HttpClient` — the backend is still
 * the source of truth (Phase 4), but writes now go through the local-first
 * outbox rather than a direct PUT.
 */
@Injectable({
  providedIn: 'root',
})
export class UserDataService {
  private readonly repository = inject(LocalUserDataRepository);
  private entryStates = new Map<string, boolean>();
  private userSettings: UserSettings = DEFAULT_SETTINGS;
  private _userSettingsChange$ = new Subject<UserSettings>();
  private _progressChange$ = new Subject<void>();

  loadProgress(): Observable<ProgressEntry[]> {
    return from(this.repository.listProgress()).pipe(
      tap((progress) => {
        this.entryStates = new Map(progress.map((p) => [p.catalogEntryId, p.caught]));
      })
    );
  }

  /** Hydrates `userSettings` from local storage. Awaited by an app
   * initializer in `main.ts` before the component tree even constructs —
   * several components (side-menu, preset-query-editor) read
   * `getUserSettings()` synchronously in their own constructors, so this
   * must resolve before Angular bootstraps, not just before some later
   * `ngOnInit()`. */
  loadSettings(): Observable<UserSettings> {
    return from(this.repository.getSettings()).pipe(
      map((settings) => settings ?? DEFAULT_SETTINGS),
      tap((settings) => (this.userSettings = settings))
    );
  }

  updateUserSettings(modifiedSettings: Partial<UserSettings>, emitChange = true): void {
    this.userSettings = { ...this.userSettings, ...modifiedSettings };

    if (emitChange) {
      this._userSettingsChange$.next(this.userSettings);
    }

    this.repository.updateSettings(this.userSettings).catch((err: unknown) => {
      console.error('Failed to save settings', err);
    });
  }

  listenForUserSettingsChanges(): Observable<UserSettings> {
    return this._userSettingsChange$.asObservable();
  }

  getUserSettings(): UserSettings {
    return this.userSettings;
  }

  setEntryState(catalogEntryId: string, caught: boolean): void {
    this.entryStates.set(catalogEntryId, caught);
    this._progressChange$.next();

    this.repository.setCaught(catalogEntryId, caught).catch((err: unknown) => {
      console.error(`Failed to save progress for ${catalogEntryId}`, err);
    });
  }

  listenForProgressChanges(): Observable<void> {
    return this._progressChange$.asObservable();
  }

  toggleEntryState(catalogEntryId: string): void {
    const currentState = this.entryStates.get(catalogEntryId);
    this.setEntryState(catalogEntryId, !currentState);
  }

  exportBundle(): ExportBundle {
    const progress: ProgressEntry[] = Array.from(this.entryStates.entries()).map(
      ([catalogEntryId, caught]) => ({
        catalogEntryId,
        caught,
        updatedAt: new Date().toISOString(),
      })
    );

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      progress,
      excludedNamePatterns: this.userSettings.excludedNamePatterns,
      excludedDexNumbers: this.userSettings.excludedDexNumbers,
      excludedShinyDexNumbers: this.userSettings.excludedShinyDexNumbers,
      excludedShinyNamePatterns: this.userSettings.excludedShinyNamePatterns,
      userTags: this.userSettings.userTags,
      presetQueries: this.userSettings.presetQueries,
      excludedSearchTermsByPokedex: this.userSettings.excludedSearchTermsByPokedex,
    };
  }

  /** Replaces progress and excluded patterns with the given bundle's contents,
   * reloading local state to match. Other settings (pokedex type, shiny
   * filter, form-visibility toggles) are left untouched. Unlike the old
   * server-side import, this does NOT clear existing local progress first —
   * `LocalUserDataRepository.bulkSetCaught()` only upserts the entries the
   * bundle contains (see docs/progress/phase-5-domain-services.md). */
  importBundle(bundle: ExportBundle): Observable<ProgressEntry[]> {
    const settingsPartial: Partial<UserSettings> = {
      excludedNamePatterns: bundle.excludedNamePatterns,
      excludedDexNumbers: bundle.excludedDexNumbers,
      excludedShinyDexNumbers: bundle.excludedShinyDexNumbers,
      excludedShinyNamePatterns: bundle.excludedShinyNamePatterns,
      userTags: bundle.userTags,
      presetQueries: bundle.presetQueries,
      excludedSearchTermsByPokedex: bundle.excludedSearchTermsByPokedex,
    };

    this.userSettings = { ...this.userSettings, ...settingsPartial };
    this._userSettingsChange$.next(this.userSettings);

    return from(
      Promise.all([
        this.repository.updateSettings(this.userSettings),
        this.repository.bulkSetCaught(bundle.progress),
      ])
    ).pipe(switchMap(() => this.loadProgress()));
  }

  getItemState(catalogEntryId: string): boolean {
    return this.entryStates.get(catalogEntryId) ?? false;
  }

  getAllEntryStates(): Map<string, boolean> {
    return new Map(this.entryStates);
  }
}
