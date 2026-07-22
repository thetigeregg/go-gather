import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { Dayjs } from 'dayjs';
import { IonButton, IonIcon, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, eyeOffOutline } from 'ionicons/icons';
import { EventMetadata, PogoEvent } from '@go-gather/shared';
import { getSourceEventID } from '../calendar-view/calendar-single-day-events.util';
import { CalendarFilterService } from '../../core/services/calendar-filter.service';
import { formatEventName } from '../../core/services/calendar-event-name.util';
import {
  getTimelineEventExtras,
  TimelineEventExtras,
} from '../../core/services/timeline-event-extras.util';
import {
  buildEventStatusInfo,
  buildTimeDisplayParts,
  EventStatusInfo,
  TimeDisplayParts,
} from '../../core/services/timeline-event-time-display.util';

const HIDE_TOAST_DURATION_MS = 4000;

/**
 * Ported from pogo-cal's EventTooltip.vue, collapsed to a single code path
 * (no desktop-popover/touch-drawer split, no useDeviceDetection.ts — see
 * OPEN-DECISIONS.md) and minus: `_isGrouped` per-grouped-event rendering
 * ("group similar events" deferred), all boss/tier-group art (raid-boss art
 * is text-only), and EventTooltipHeader.vue's add-to-calendar/edit-color
 * action buttons (both out of scope/deferred elsewhere in this port). The
 * hide button *is* ported (see `onHideClick()`) — source's choice modal
 * ("hide this event" vs. "hide this event type") is simplified to just the
 * per-instance half here, since "hide this event type" already exists as
 * its own feature (the filter menu's per-type toggles) — no second UI path
 * to the same toggle. Reuses the same text-only extras block and
 * time-display utils that timeline-event.component.ts already uses. Dumb/
 * presentational — hosted inside an `ion-modal` by calendar-view.
 * component.ts, which supplies `now` from its own already-computed `today`
 * field.
 */
@Component({
  selector: 'app-event-detail',
  imports: [IonButton, IonIcon],
  templateUrl: './event-detail.component.html',
  styleUrl: './event-detail.component.scss',
})
export class EventDetailComponent {
  private readonly calendarFilterService = inject(CalendarFilterService);
  private readonly toastController = inject(ToastController);

  @Input({ required: true }) event!: PogoEvent;
  @Input({ required: true }) metadata!: EventMetadata;
  @Input({ required: true }) now!: Dayjs;

  @Output() closed = new EventEmitter<void>();

  constructor() {
    addIcons({ close, 'eye-off-outline': eyeOffOutline });
  }

  get displayName(): string {
    return formatEventName(this.event.name);
  }

  /** A tapped event can be a major-event daily projection (synthetic
   * `-daily-YYYY-MM-DD` eventID) — hiding must resolve back to the real
   * source event, matching how metadata lookup already does (see
   * calendar-view.component.ts's onEventClick()). */
  get sourceEventID(): string {
    return getSourceEventID(this.event);
  }

  get timeDisplayParts(): TimeDisplayParts {
    return buildTimeDisplayParts(
      this.metadata.startDate,
      this.metadata.endDate,
      this.now,
      this.metadata.isSingleDayEvent
    );
  }

  get statusInfo(): EventStatusInfo | null {
    return buildEventStatusInfo(
      this.metadata.startDate,
      this.metadata.endDate,
      this.now,
      this.metadata.isSingleDayEvent
    );
  }

  get extras(): TimelineEventExtras | null {
    return getTimelineEventExtras(this.event);
  }

  onCloseClick(): void {
    this.closed.emit();
  }

  async onHideClick(): Promise<void> {
    const eventID = this.sourceEventID;
    this.calendarFilterService.hideEventById(eventID);

    const toast = await this.toastController.create({
      message: `Hidden "${this.displayName}"`,
      duration: HIDE_TOAST_DURATION_MS,
      position: 'bottom',
      buttons: [
        {
          text: 'Undo',
          handler: () => {
            this.calendarFilterService.showEventById(eventID);
          },
        },
      ],
    });
    await toast.present();

    this.closed.emit();
  }
}
