import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay, tap } from 'rxjs';
import { ImplicitlyExcludedSearchTerm } from '@go-gather/shared';
import { environment } from '../../../environments/environment';

interface SearchConfigResponse {
  implicitlyExcludedSearchTerms: ImplicitlyExcludedSearchTerm[];
  costumeGenderEnabled: boolean;
}

/**
 * Ported from go-gather-next unchanged, aside from `environment.apiBaseUrl`
 * -> `environment.apiUrl`. This stays a direct `HttpClient` call rather than
 * going through `StorageEngine`: `sync-overrides.json` is hand-edited server
 * config, deliberately re-read fresh on every request (see `GET
 * /api/search-config` in server/src/api.ts) rather than cached or synced —
 * it doesn't fit any of the catalog/progress/settings scopes.
 */
@Injectable({ providedIn: 'root' })
export class SearchConfigService {
  private _implicitlyExcludedSearchTerms: readonly ImplicitlyExcludedSearchTerm[] = [];
  private _costumeGenderEnabled = true;

  private readonly http = inject(HttpClient);

  get implicitlyExcludedSearchTerms(): readonly ImplicitlyExcludedSearchTerm[] {
    return this._implicitlyExcludedSearchTerms;
  }

  get costumeGenderEnabled(): boolean {
    return this._costumeGenderEnabled;
  }

  loadConfig(): Observable<SearchConfigResponse> {
    return this.http.get<SearchConfigResponse>(`${environment.apiUrl}/api/search-config`).pipe(
      tap((config) => {
        this._implicitlyExcludedSearchTerms = config.implicitlyExcludedSearchTerms;
        this._costumeGenderEnabled = config.costumeGenderEnabled;
      }),
      shareReplay(1)
    );
  }
}
