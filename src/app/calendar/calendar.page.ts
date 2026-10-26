import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { EventFocusService } from '../core/services/event-focus.service';
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
  private readonly eventFocusService = inject(EventFocusService);
  private readonly destroyRef = inject(DestroyRef);

  selectedView: CalendarSelectedView = 'calendar';

  constructor() {
    addIcons({ menu, filter });
  }

  /**
   * A focus request (tapped event push notification) always lands on the
   * Timeline — only it has an expandable per-event card to focus. That
   * switch is in-memory only, never persisted over the user's saved view
   * preference, and must also win over that preference's async load on a
   * cold start (where the request is already pending before this runs).
   */
  ngOnInit(): void {
    // Tracked locally rather than re-checking the pending ID once the
    // preference resolves — the Timeline may already have consumed it by then.
    let focusRequested = this.eventFocusService.getPendingEventId() !== null;
    if (focusRequested) {
      this.selectedView = 'timeline';
    }

    this.eventFocusService
      .listenForFocusRequests()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        focusRequested = true;
        this.selectedView = 'timeline';
      });

    this.preferenceStorage
      .getItem(SELECTED_VIEW_KEY)
      .then((stored) => {
        if (focusRequested) {
          return;
        }
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
