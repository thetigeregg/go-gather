import { Component, OnInit, inject } from '@angular/core';
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonMenuButton,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { filter, menu } from 'ionicons/icons';
import { PreferenceStorageService } from '../core/storage/preference-storage.service';
import { CalendarViewComponent } from './calendar-view/calendar-view.component';
import { TimelineViewComponent } from './timeline-view/timeline-view.component';

const SELECTED_VIEW_KEY = 'calendarSelectedView';

type CalendarSelectedView = 'calendar' | 'timeline';

function isCalendarSelectedView(value: unknown): value is CalendarSelectedView {
  return value === 'calendar' || value === 'timeline';
}

/**
 * Ported from pogo-cal's pages/Calendar.vue, minus the responsive side-by-
 * side/stacked layout (both views always mounted there) — resolved: an
 * IonSegment toggle mounts exactly one view at a time instead (see
 * VIEW-TOGGLE-AND-LAYOUT.md). calendar-view.component.ts/timeline-view.
 * component.ts each stay self-sufficient (own ngOnInit data load) rather
 * than being refactored to take events/eventMetadata as inputs from this
 * page — toggling re-loads the inactive view's data from StorageEngine
 * (not the network), a small, deliberately-accepted cost at this app's
 * event volume rather than a component-API refactor three phases deep.
 */
@Component({
  selector: 'app-calendar',
  templateUrl: 'calendar.page.html',
  styleUrls: ['calendar.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonMenuButton,
    IonIcon,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    CalendarViewComponent,
    TimelineViewComponent,
  ],
})
export class CalendarPage implements OnInit {
  private readonly preferenceStorage = inject(PreferenceStorageService);

  selectedView: CalendarSelectedView = 'calendar';

  constructor() {
    addIcons({ menu, filter });
  }

  ngOnInit(): void {
    this.preferenceStorage
      .getItem(SELECTED_VIEW_KEY)
      .then((stored) => {
        if (isCalendarSelectedView(stored)) {
          this.selectedView = stored;
        }
      })
      .catch((err: unknown) => {
        console.error('Failed to load selected calendar view', err);
      });
  }

  onViewChange(value: string | number | undefined): void {
    if (!isCalendarSelectedView(value)) {
      return;
    }
    this.selectedView = value;
    this.preferenceStorage.setItem(SELECTED_VIEW_KEY, value).catch((err: unknown) => {
      console.error('Failed to save selected calendar view', err);
    });
  }
}
