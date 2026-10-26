import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { AvailabilityChangesService } from '../core/services/availability-changes.service';
import {
  AvailabilitySection,
  groupAvailabilityChanges,
} from '../core/services/availability-changes.util';
import { UserDataService } from '../core/services/user-data.service';
import { AvailabilitySectionsComponent } from '../features/availability-changes/availability-sections.component';

export interface AvailabilityHistoryDay {
  date: string;
  sections: AvailabilitySection[];
}

/** Every availability change the app has shown (see
 * AvailabilityChangesService.takePending), newest day first, so one closed
 * too early can be looked up later. */
@Component({
  selector: 'app-availability-history',
  templateUrl: 'availability-history.page.html',
  styleUrls: ['availability-history.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    AvailabilitySectionsComponent,
  ],
})
export class AvailabilityHistoryPage implements ViewWillEnter {
  private readonly availabilityChanges = inject(AvailabilityChangesService);
  private readonly userDataService = inject(UserDataService);
  private readonly destroyRef = inject(DestroyRef);

  days: AvailabilityHistoryDay[] = [];
  loaded = false;

  constructor() {
    // The availability sheet can open over this page (on resume, or when a
    // date rolls over), so pick up what it logged.
    this.availabilityChanges.logged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      void this.load();
    });
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  /** `YYYY-MM-DD` as e.g. "Mon, Oct 26, 2026", read as a local date. */
  formatDay(date: string): string {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  /** Days whose changes the user's name-exclusion patterns all hide are
   * left out, as the sheet leaves them out. */
  private async load(): Promise<void> {
    const log = await this.availabilityChanges.getLog();
    const settings = this.userDataService.getUserSettings();
    this.days = log.flatMap(({ loggedOn, changes }) => {
      const sections = groupAvailabilityChanges(changes, settings);
      return sections.length > 0 ? [{ date: loggedOn, sections }] : [];
    });
    this.loaded = true;
  }
}
