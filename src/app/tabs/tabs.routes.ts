import { Routes } from '@angular/router';
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
        path: '',
        redirectTo: '/tabs/gather',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/gather',
    pathMatch: 'full',
  },
];
