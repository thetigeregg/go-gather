import { Component, Input } from '@angular/core';
import { SpriteEffect } from '../../core/services/event-sprite-url.util';
import { RaidTierGroupWithImages } from '../../core/services/raid-tier-groups.util';
import { TimelineScheduleDaySection } from '../../core/services/timeline-schedule.util';
import { RaidTierGroupImagesComponent } from './raid-tier-group-images.component';

const RAID_SCHEDULE_IMAGE_HEIGHT = 60;

/**
 * Ported from pogo-cal's TimelineRaidSchedule.vue. Source's sticky day/section
 * headers rely on a `--tl-sticky-top`/`--tl-category-header-h`/
 * `--tl-day-header-h` custom-property chain unique to its category-header
 * layout; this port's category headers are native `ion-accordion` headers
 * instead (see timeline-category-section.component.*), which don't establish
 * that chain, so sticky positioning is dropped — headers scroll normally
 * within the expanded accordion content.
 */
@Component({
  selector: 'app-timeline-raid-schedule',
  imports: [RaidTierGroupImagesComponent],
  templateUrl: './timeline-raid-schedule.component.html',
  styleUrl: './timeline-raid-schedule.component.scss',
})
export class TimelineRaidScheduleComponent {
  readonly imageHeight = RAID_SCHEDULE_IMAGE_HEIGHT;

  @Input() daySections: TimelineScheduleDaySection[] | undefined = undefined;
  @Input() defaultTierGroups: RaidTierGroupWithImages[] | null = null;
  @Input({ required: true }) eventType!: string;
  @Input() effect: SpriteEffect | undefined = undefined;
}
