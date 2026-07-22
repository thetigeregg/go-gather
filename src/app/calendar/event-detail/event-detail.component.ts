import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Dayjs } from 'dayjs';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
import { EventMetadata, PogoEvent } from '@go-gather/shared';
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

/**
 * Ported from pogo-cal's EventTooltip.vue, collapsed to a single code path
 * (no desktop-popover/touch-drawer split, no useDeviceDetection.ts — see
 * OPEN-DECISIONS.md) and minus: `_isGrouped` per-grouped-event rendering
 * ("group similar events" deferred), all boss/tier-group art (raid-boss art
 * is text-only), and EventTooltipHeader.vue's add-to-calendar/edit-color/
 * hide action buttons (all three already out of scope/deferred elsewhere in
 * this port — the header here is just the banner + a close button). Reuses
 * the same text-only extras block and time-display utils that
 * timeline-event.component.ts already uses. Dumb/presentational — hosted
 * inside an `ion-modal` by calendar-view.component.ts, which supplies `now`
 * from its own already-computed `today` field.
 */
@Component({
  selector: 'app-event-detail',
  imports: [IonButton, IonIcon],
  templateUrl: './event-detail.component.html',
  styleUrl: './event-detail.component.scss',
})
export class EventDetailComponent {
  @Input({ required: true }) event!: PogoEvent;
  @Input({ required: true }) metadata!: EventMetadata;
  @Input({ required: true }) now!: Dayjs;

  @Output() closed = new EventEmitter<void>();

  constructor() {
    addIcons({ close });
  }

  get displayName(): string {
    return formatEventName(this.event.name);
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
}
