import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Dayjs } from 'dayjs';
import { IonBadge, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronDown, chevronUp } from 'ionicons/icons';
import { EventMetadata, PogoEvent } from '@go-gather/shared';
import {
  getMajorCalendarEventVariant,
  isMajorCalendarEventType,
  MajorCalendarEventVariant,
} from '../../core/services/calendar-event-major.util';
import { formatEventName } from '../../core/services/calendar-event-name.util';
import {
  getTimelineEventExtras,
  TimelineEventExtras,
} from '../../core/services/timeline-event-extras.util';
import {
  buildEventStatusInfo,
  buildTimeDisplayParts,
  EventStatusInfo,
  EventStatusType,
  TimeDisplayParts,
} from '../../core/services/timeline-event-time-display.util';

const STATUS_BADGE_COLORS: Record<EventStatusType, string> = {
  ended: 'danger',
  upcoming: 'success',
  normal: 'medium',
  urgent: 'warning',
};

/**
 * Ported from pogo-cal's TimelineEvent.vue + TimelineEventHeader.vue, folded
 * into one component — with add-to-calendar (ICS, out of scope), edit-color
 * (dropped display pref), and quick-hide (deferred, see plan) all gone,
 * there's no longer enough header-only content to warrant a separate
 * component. Raid/spotlight schedule tree rendering is dropped entirely
 * (text-only raid-art decision); the text-only "event extras" bonuses block
 * is kept. Dumb/presentational — `isActive` is owned by the parent
 * (timeline-view.component.ts), matching source's useTimelineActiveEvent.ts
 * pattern; this component only emits `activate`.
 */
@Component({
  selector: 'app-timeline-event',
  imports: [IonBadge, IonIcon],
  templateUrl: './timeline-event.component.html',
  styleUrl: './timeline-event.component.scss',
})
export class TimelineEventComponent {
  @Input({ required: true }) event!: PogoEvent;
  @Input({ required: true }) metadata!: EventMetadata;
  @Input({ required: true }) isActive = false;
  @Input({ required: true }) now!: Dayjs;

  @Output() activate = new EventEmitter<string>();

  constructor() {
    addIcons({ 'chevron-down': chevronDown, 'chevron-up': chevronUp });
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

  get statusBadgeColor(): string {
    return STATUS_BADGE_COLORS[this.statusInfo?.type ?? 'normal'];
  }

  get extras(): TimelineEventExtras | null {
    return getTimelineEventExtras(this.event);
  }

  get isMajorTimelineEvent(): boolean {
    return isMajorCalendarEventType(this.event.eventType);
  }

  get majorTimelineVariant(): MajorCalendarEventVariant {
    return getMajorCalendarEventVariant(this.event);
  }

  onClick(): void {
    this.activate.emit(this.event.eventID);
  }
}
