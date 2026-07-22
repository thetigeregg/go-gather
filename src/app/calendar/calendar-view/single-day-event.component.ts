import { Component, EventEmitter, Input, Output } from '@angular/core';
import { EventMetadata, PogoEvent } from '@go-gather/shared';
import { formatEventName } from '../../core/services/calendar-event-name.util';
import {
  getMajorCalendarEventVariant,
  MajorCalendarEventVariant,
} from '../../core/services/calendar-event-major.util';
import { getSourceEventID, isDailyMajorDisplayEvent } from './calendar-single-day-events.util';

/**
 * Ported from pogo-cal's SingleDayEvent.vue, minus sprite/badge rendering
 * (raid-boss art + "group similar events" both deferred — see
 * calendar-event-major.util.ts/calendar-single-day-events.util.ts) and hover
 * cross-highlight (dropped entirely). Dumb/presentational — `metadata` is
 * the *source* event's precomputed EventMetadata, resolved by the caller via
 * getSourceEventID(). Click handling is a stub output; the actual detail
 * modal is Phase 5's job.
 */
@Component({
  selector: 'app-single-day-event',
  templateUrl: './single-day-event.component.html',
  styleUrl: './single-day-event.component.scss',
})
export class SingleDayEventComponent {
  @Input({ required: true }) event!: PogoEvent;
  @Input({ required: true }) metadata!: EventMetadata;
  @Input({ required: true }) isToday = false;

  @Output() eventClick = new EventEmitter<PogoEvent>();

  get sourceEventID(): string {
    return getSourceEventID(this.event);
  }

  get isMajorDaily(): boolean {
    return isDailyMajorDisplayEvent(this.event);
  }

  get majorVariant(): MajorCalendarEventVariant {
    if (!isDailyMajorDisplayEvent(this.event)) {
      return 'location-specific';
    }
    return getMajorCalendarEventVariant({ ...this.event, eventID: this.sourceEventID });
  }

  get displayName(): string {
    return formatEventName(this.event.name);
  }

  get showEndedLabel(): boolean {
    return this.isToday && this.metadata.isPastEvent;
  }

  onClick(): void {
    this.eventClick.emit(this.event);
  }
}
