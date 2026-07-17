import { bootstrapApplication } from '@angular/platform-browser';
import {
  RouteReuseStrategy,
  provideRouter,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { inject, provideAppInitializer } from '@angular/core';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { STORAGE_ENGINE } from './app/core/data/storage-engine';
import { StorageEngineFactory } from './app/core/data/storage-engine.factory';
import { SYNC_OUTBOX_WRITER } from './app/core/data/sync-outbox-writer';
import { SyncService } from './app/core/services/sync.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'ios' }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptorsFromDi()),
    // Sequenced: SyncService's first sync attempt reads STORAGE_ENGINE, whose
    // factory throws until StorageEngineFactory.initialize() has resolved.
    provideAppInitializer(() => {
      const storageEngineFactory = inject(StorageEngineFactory);
      const syncService = inject(SyncService);
      return storageEngineFactory.initialize().then(() => {
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
