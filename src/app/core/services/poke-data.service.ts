import { Injectable, inject } from '@angular/core';
import { Observable, from, map, shareReplay } from 'rxjs';
import { CatalogEntry } from '@go-gather/shared';
import { StorageEngine } from '../data/storage-engine';
import { StorageEngineFactory } from '../data/storage-engine.factory';
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
  private readonly storageEngineFactory = inject(StorageEngineFactory);
  private _catalog: readonly CatalogEntry[] = [];

  // `STORAGE_ENGINE`'s DI factory throws until `StorageEngineFactory.initialize()`
  // resolves, and this service is constructed inside the same
  // `provideAppInitializer` callback that calls `initialize()` (see main.ts) —
  // so the engine must be resolved lazily per-call, not eagerly at construction.
  private get engine(): StorageEngine {
    return this.storageEngineFactory.getEngine();
  }

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
