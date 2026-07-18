import { bootstrapApplication } from '@angular/platform-browser';
import {
  RouteReuseStrategy,
  provideRouter,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { STORAGE_ENGINE } from './app/core/data/storage-engine';
import { StorageEngineFactory } from './app/core/data/storage-engine.factory';
import { SYNC_OUTBOX_WRITER } from './app/core/data/sync-outbox-writer';
import { PokeDataService } from './app/core/services/poke-data.service';
import { SearchConfigService } from './app/core/services/search-config.service';
import { SyncService } from './app/core/services/sync.service';
import { UserDataService } from './app/core/services/user-data.service';

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'ios' }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptorsFromDi()),
    // Sequenced: everything below reads STORAGE_ENGINE, whose factory throws
    // until StorageEngineFactory.initialize() has resolved. Settings/progress
    // are hydrated before SyncService starts so components that read
    // getUserSettings()/getItemState() synchronously in their constructors
    // (matching go-gather-next's APP_INITIALIZER guarantee) always have data,
    // even if SyncService's first pull is still in flight. SearchConfigService
    // is included here too (rather than left as a side effect of gather.page's
    // ngOnInit) so its `costumeGenderEnabled`/`implicitlyExcludedSearchTerms`
    // are never read at their optimistic constructor defaults — that gap let
    // /search-strings render the Costume Gender section incorrectly when
    // reached without first visiting /tabs/gather in the same session.
    provideAppInitializer(() => {
      const storageEngineFactory = inject(StorageEngineFactory);
      const userDataService = inject(UserDataService);
      const pokeDataService = inject(PokeDataService);
      const searchConfigService = inject(SearchConfigService);
      const syncService = inject(SyncService);

      return storageEngineFactory
        .initialize()
        .then(() =>
          Promise.all([
            firstValueFrom(userDataService.loadSettings()),
            firstValueFrom(userDataService.loadProgress()),
            firstValueFrom(pokeDataService.loadCatalog()),
            firstValueFrom(searchConfigService.loadConfig()),
          ])
        )
        .then(() => {
          syncService.initialize();
        });
    }),
    {
      provide: STORAGE_ENGINE,
      useFactory: (engineFactory: StorageEngineFactory) => engineFactory.getEngine(),
      deps: [StorageEngineFactory],
    },
    { provide: SYNC_OUTBOX_WRITER, useExisting: SyncService },
  ],
}).catch((err: unknown) => {
  console.error(err);
});
