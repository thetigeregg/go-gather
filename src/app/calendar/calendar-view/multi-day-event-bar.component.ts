import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PogoEvent } from '@go-gather/shared';
import { formatEventName } from '../../core/services/calendar-event-name.util';
import { EventBarPosition } from './calendar-day-layout.util';

/**
 * Ported from pogo-cal's MultiDayEventBar.vue, minus sprite/badge rendering
 * (raid-boss art deferred/text-only) and hover cross-highlight (dropped
 * entirely). Dumb/presentational — all layout math (barClass/position) is
 * computed upstream by CalendarDayLayout and passed in as inputs. Click
 * handling is a stub output; the actual detail modal is Phase 5's job.
 */
@Component({
  selector: 'app-multi-day-event-bar',
  templateUrl: './multi-day-event-bar.component.html',
  styleUrl: './multi-day-event-bar.component.scss',
})
export class MultiDayEventBarComponent {
  @Input({ required: true }) event!: PogoEvent;
  @Input({ required: true }) color = '';
  @Input({ required: true }) barClass = '';
  @Input({ required: true }) position: EventBarPosition = { left: '0%', width: '100%' };

  @Output() eventClick = new EventEmitter<PogoEvent>();

  get displayName(): string {
    return formatEventName(this.event.name);
  }

  onClick(): void {
    this.eventClick.emit(this.event);
  }
}
