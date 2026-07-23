import { Component, OnInit, inject } from '@angular/core';
import { AlertController, IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { SideMenuComponent } from './features/side-menu/side-menu.component';
import { NavMenuComponent } from './features/nav-menu/nav-menu.component';
import { CalendarFilterMenuComponent } from './features/calendar-filter-menu/calendar-filter-menu.component';
import { LiveUpdateService } from './core/services/live-update.service';
import { NotificationService } from './core/services/notification.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [
    IonApp,
    IonRouterOutlet,
    SideMenuComponent,
    NavMenuComponent,
    CalendarFilterMenuComponent,
  ],
})
export class AppComponent implements OnInit {
  private readonly alertController = inject(AlertController);
  private readonly liveUpdateService = inject(LiveUpdateService);
  private readonly notificationService = inject(NotificationService);

  ngOnInit(): void {
    void this.liveUpdateService.markReady();

    this.liveUpdateService.staged$.subscribe(({ semver }) => {
      void this.presentUpdateReadyAlert(semver);
    });

    void this.notificationService.initialize();
  }

  private async presentUpdateReadyAlert(semver: string): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Update Ready',
      message: `A new version (${semver}) is ready. Reload now to apply it?`,
      buttons: [
        { text: 'Later', role: 'cancel' },
        {
          text: 'Reload',
          handler: () => {
            void this.liveUpdateService.reload();
          },
        },
      ],
    });

    await alert.present();
  }
}
