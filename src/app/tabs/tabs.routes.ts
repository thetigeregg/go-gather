import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { TabStateService } from '../core/services/tab-state.service';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'gather',
        loadComponent: () => import('../gather/gather.page').then((m) => m.GatherPage),
      },
      {
        path: 'calendar',
        loadComponent: () => import('../calendar/calendar.page').then((m) => m.CalendarPage),
      },
      {
        path: '',
        // TabStateService is hydrated by an app initializer (main.ts) before
        // Angular's initial navigation runs, so this reflects the real
        // last-active tab rather than always defaulting to Gather.
        redirectTo: () => `/tabs/${inject(TabStateService).getLastActiveTab()}`,
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs',
    pathMatch: 'full',
  },
];
