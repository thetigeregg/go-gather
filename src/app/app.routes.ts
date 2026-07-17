import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'search-strings',
    loadComponent: () =>
      import('./search-strings/search-strings.page').then((m) => m.SearchStringsPage),
  },
  {
    path: 'preset-queries',
    loadComponent: () =>
      import('./preset-queries/preset-queries.page').then((m) => m.PresetQueriesPage),
  },
];
