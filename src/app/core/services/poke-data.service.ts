import { Injectable, inject } from '@angular/core';
import { Observable, from, map, shareReplay } from 'rxjs';
import { CatalogEntry } from '@go-gather/shared';
import { STORAGE_ENGINE } from '../data/storage-engine';
import { environment } from '../../../environments/environment';

/**
 * Ported from go-gather-next's `poke-data.service.ts`, re-pointed at
 * `StorageEngine` instead of `HttpClient` — the catalog now lives on-device,
 * kept in sync by `SyncService.pullCatalog()` (Phase 4), so this service
 * makes no network call of its own.
 */
@Injectable({
  providedIn: 'root',
})
export class PokeDataService {
  private readonly engine = inject(STORAGE_ENGINE);
  private _catalog: readonly CatalogEntry[] = [];

  get catalog(): readonly CatalogEntry[] {
    return this._catalog;
  }

  loadCatalog(): Observable<readonly CatalogEntry[]> {
    return from(this.engine.listCatalog()).pipe(
      map((catalog) => {
        this._catalog = catalog.map((entry) => this.resolveImgUrl(entry));
        return this._catalog;
      }),
      shareReplay(1)
    );
  }

  private resolveImgUrl(entry: CatalogEntry): CatalogEntry {
    return entry.imgUrl.startsWith('/')
      ? { ...entry, imgUrl: `${environment.apiUrl}${entry.imgUrl}` }
      : entry;
  }
}
