import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AlertController,
  IonApp,
  IonRouterOutlet,
  ModalController,
} from '@ionic/angular/standalone';
import { SideMenuComponent } from './features/side-menu/side-menu.component';
import { NavMenuComponent } from './features/nav-menu/nav-menu.component';
import { CalendarFilterMenuComponent } from './features/calendar-filter-menu/calendar-filter-menu.component';
import { AvailabilityChangesModalComponent } from './features/availability-changes/availability-changes-modal.component';
import { AppOverlayQueueService } from './core/services/app-overlay-queue.service';
import { AvailabilityChangesService } from './core/services/availability-changes.service';
import { groupAvailabilityChanges } from './core/services/availability-changes.util';
import { localDateChanges } from './core/services/catalog-release.util';
import { LiveUpdateService } from './core/services/live-update.service';
import { NotificationService } from './core/services/notification.service';
import { UserDataService } from './core/services/user-data.service';

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
  private readonly modalController = inject(ModalController);
  private readonly liveUpdateService = inject(LiveUpdateService);
  private readonly notificationService = inject(NotificationService);
  private readonly availabilityChanges = inject(AvailabilityChangesService);
  private readonly overlayQueue = inject(AppOverlayQueueService);
  private readonly userDataService = inject(UserDataService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    void this.liveUpdateService.markReady();

    // Both popups go through the overlay queue: an OTA update and an
    // availability change are often picked up together at launch or resume.
    this.liveUpdateService.staged$.subscribe(({ semver }) => {
      this.overlayQueue.enqueue('live-update', () => this.presentUpdateReadyAlert(semver));
    });

    this.availabilityChanges.pending$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.overlayQueue.enqueue('availability-changes', () => this.presentAvailabilityChanges());
    });

    // Announced releases appear on their date without a catalog pull, so
    // check at launch and whenever the device date rolls over.
    this.checkAvailabilityDates();
    localDateChanges()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.checkAvailabilityDates();
      });

    void this.notificationService.initialize();
  }

  private checkAvailabilityDates(): void {
    this.availabilityChanges.checkForDateChanges().catch((error: unknown) => {
      console.error('availability_changes.check_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
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
    await alert.onDidDismiss();
  }

  /** Takes what's pending when its turn comes, so changes picked up while it
   * waited behind another popup are included. Changes the user's exclusion
   * patterns hide are acknowledged without a popup. */
  private async presentAvailabilityChanges(): Promise<void> {
    const changes = await this.availabilityChanges.takePending();
    const sections = groupAvailabilityChanges(changes, this.userDataService.getUserSettings());
    if (sections.length > 0) {
      const modal = await this.modalController.create({
        component: AvailabilityChangesModalComponent,
        componentProps: { sections },
        initialBreakpoint: 0.75,
        breakpoints: [0, 0.75, 1],
      });
      await modal.present();
      await modal.onDidDismiss();
    }
    await this.availabilityChanges.acknowledge(changes);
  }
}
