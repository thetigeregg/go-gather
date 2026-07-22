import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Dayjs } from 'dayjs';
import { IonBadge, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowUpCircleOutline,
  chevronDown,
  chevronUp,
  swapHorizontalOutline,
} from 'ionicons/icons';
import { EventMetadata, PogoEvent } from '@go-gather/shared';
import {
  getMajorCalendarEventVariant,
  isMajorCalendarEventType,
  MajorCalendarEventVariant,
} from '../../core/services/calendar-event-major.util';
import { formatEventName } from '../../core/services/calendar-event-name.util';
import {
  getEventPokemonImages,
  getEventSpriteEffect,
} from '../../core/services/event-pokemon-images.util';
import { SpriteEffect } from '../../core/services/event-sprite-url.util';
import {
  buildRaidTierGroupsWithImages,
  RaidTierGroupWithImages,
} from '../../core/services/raid-tier-groups.util';
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
import {
  buildCollapsedScheduleDayGroups,
  buildTimelineScheduleDaySectionsWithTierGroups,
  CollapsedScheduleDayGroup,
  TimelineScheduleDaySection,
} from '../../core/services/timeline-schedule.util';
import { PokemonEventImagesComponent } from './pokemon-event-images.component';
import { TimelineCollapsedScheduleComponent } from './timeline-collapsed-schedule.component';
import { TimelineRaidScheduleComponent } from './timeline-raid-schedule.component';

const STATUS_BADGE_COLORS: Record<EventStatusType, string> = {
  ended: 'danger',
  upcoming: 'success',
  normal: 'medium',
  urgent: 'warning',
};

// Raid tiers hidden from the collapsed (non-active) inline Pokemon row — shown in full once expanded.
const COLLAPSED_EXCLUDED_TIERS = ['Tier 1', 'Tier 3'];

/**
 * Ported from pogo-cal's TimelineEvent.vue + TimelineEventHeader.vue +
 * useTimelineEvent.ts, folded into one component — with add-to-calendar
 * (ICS, out of scope), edit-color (dropped display pref), and quick-hide
 * (deferred, see plan) all gone, there's no longer enough header-only content
 * to warrant a separate component. The text-only "event extras" bonuses
 * block is kept alongside the newly-added sprite/schedule rendering (see
 * OPEN-DECISIONS.md's raid-boss-art item, reversed for this view's static
 * sprites — Timeline Pokemon Sprites & Raid Schedule plan). Dumb/
 * presentational — `isActive` is owned by the parent
 * (timeline-view.component.ts), matching source's useTimelineActiveEvent.ts
 * pattern; this component only emits `activate`.
 */
@Component({
  selector: 'app-timeline-event',
  imports: [
    IonBadge,
    IonIcon,
    PokemonEventImagesComponent,
    TimelineCollapsedScheduleComponent,
    TimelineRaidScheduleComponent,
  ],
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
    addIcons({
      'chevron-down': chevronDown,
      'chevron-up': chevronUp,
      'arrow-up-circle-outline': arrowUpCircleOutline,
      'swap-horizontal-outline': swapHorizontalOutline,
    });
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

  get pokemonCount(): number {
    return getEventPokemonImages(this.event).length;
  }

  get collapsedScheduleDayGroups(): CollapsedScheduleDayGroup[] | undefined {
    if (this.isActive) {
      return undefined;
    }
    return buildCollapsedScheduleDayGroups(this.event);
  }

  get hasPokemon(): boolean {
    return this.pokemonCount > 0 || Boolean(this.collapsedScheduleDayGroups?.length);
  }

  get spriteEffect(): SpriteEffect | undefined {
    return getEventSpriteEffect(this.event);
  }

  get defaultTierGroupsWithImages(): RaidTierGroupWithImages[] | null {
    return buildRaidTierGroupsWithImages(this.metadata.raidBossTierGroups);
  }

  get timelineScheduleDaySectionsWithTierGroups(): TimelineScheduleDaySection[] | undefined {
    return buildTimelineScheduleDaySectionsWithTierGroups(this.event);
  }

  get hasExpandedRaidSections(): boolean {
    return Boolean(
      (this.timelineScheduleDaySectionsWithTierGroups &&
        this.timelineScheduleDaySectionsWithTierGroups.length > 0) ||
      this.defaultTierGroupsWithImages
    );
  }

  get showCollapsedScheduleDays(): boolean {
    return !this.isActive && Boolean(this.collapsedScheduleDayGroups?.length);
  }

  get showInlinePokemonImages(): boolean {
    return this.isActive ? !this.hasExpandedRaidSections : !this.collapsedScheduleDayGroups?.length;
  }

  get showPokemonRow(): boolean {
    return this.hasPokemon && (this.showInlinePokemonImages || this.showCollapsedScheduleDays);
  }

  get inlineImagesExcludeTiers(): string[] {
    return this.isActive ? [] : COLLAPSED_EXCLUDED_TIERS;
  }

  /**
   * Matches source's `.flex-column.gap-2` toggle on `.event-content`: stack the
   * time display above the Pokemon row (full width, right-aligned) instead of
   * sharing one row, once there's enough Pokemon content that they'd no longer
   * fit beside the time text.
   */
  get useStackedContentLayout(): boolean {
    return (
      this.isActive || this.pokemonCount > 6 || Boolean(this.collapsedScheduleDayGroups?.length)
    );
  }

  onClick(): void {
    this.activate.emit(this.event.eventID);
  }
}
