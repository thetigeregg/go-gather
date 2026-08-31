import { Component, EnvironmentInjector, inject } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { apps, calendar } from 'ionicons/icons';
import { TabStateService } from '../core/services/tab-state.service';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);
  private readonly tabStateService = inject(TabStateService);

  constructor() {
    addIcons({ apps, calendar });
  }

  onTabChange(tab: string): void {
    if (tab === 'gather' || tab === 'calendar') {
      this.tabStateService.setLastActiveTab(tab);
    }
  }
}
