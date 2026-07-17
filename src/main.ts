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

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'ios' }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptorsFromDi()),
    provideAppInitializer(() => inject(StorageEngineFactory).initialize()),
    {
      provide: STORAGE_ENGINE,
      useFactory: (engineFactory: StorageEngineFactory) => engineFactory.getEngine(),
      deps: [StorageEngineFactory],
    },
  ],
}).catch((err: unknown) => {
  console.error(err);
});
