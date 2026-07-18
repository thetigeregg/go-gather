import { bootstrapApplication } from '@angular/platform-browser';
import {
  RouteReuseStrategy,
  provideRouter,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { inject, provideAppInitializer } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { STORAGE_ENGINE } from './app/core/data/storage-engine';
import { StorageEngineFactory } from './app/core/data/storage-engine.factory';
import { SYNC_OUTBOX_WRITER } from './app/core/data/sync-outbox-writer';
import { PokeDataService } from './app/core/services/poke-data.service';
import { SyncService } from './app/core/services/sync.service';
import { UserDataService } from './app/core/services/user-data.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'ios' }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptorsFromDi()),
    // Sequenced: everything below reads STORAGE_ENGINE, whose factory throws
    // until StorageEngineFactory.initialize() has resolved. Settings/progress
    // are hydrated before SyncService starts so components that read
    // getUserSettings()/getItemState() synchronously in their constructors
    // (matching go-gather-next's APP_INITIALIZER guarantee) always have data,
    // even if SyncService's first pull is still in flight.
    provideAppInitializer(() => {
      const storageEngineFactory = inject(StorageEngineFactory);
      const userDataService = inject(UserDataService);
      const pokeDataService = inject(PokeDataService);
      const syncService = inject(SyncService);

      return storageEngineFactory
        .initialize()
        .then(() =>
          Promise.all([
            firstValueFrom(userDataService.loadSettings()),
            firstValueFrom(userDataService.loadProgress()),
            firstValueFrom(pokeDataService.loadCatalog()),
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
