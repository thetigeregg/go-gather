import { Component, Input } from '@angular/core';
import { SpriteEffect } from '../../core/services/event-sprite-url.util';
import { CollapsedScheduleDayGroup } from '../../core/services/timeline-schedule.util';
import { PokemonImageComponent } from './pokemon-image.component';

const COLLAPSED_SCHEDULE_IMAGE_HEIGHT = 34;

/**
 * Ported from pogo-cal's TimelineCollapsedSchedule.vue, minus `useAnimated`
 * (static-only scope) and `showTooltip` (tooltips dropped entirely — see
 * pokemon-image.component.ts). Never shows CP, matching source (compact
 * non-active card layout).
 */
@Component({
  selector: 'app-timeline-collapsed-schedule',
  imports: [PokemonImageComponent],
  templateUrl: './timeline-collapsed-schedule.component.html',
  styleUrl: './timeline-collapsed-schedule.component.scss',
})
export class TimelineCollapsedScheduleComponent {
  readonly imageHeight = COLLAPSED_SCHEDULE_IMAGE_HEIGHT;

  @Input() dayGroups: CollapsedScheduleDayGroup[] | undefined = undefined;
  @Input({ required: true }) eventType!: string;
  @Input() effect: SpriteEffect | undefined = undefined;
}
