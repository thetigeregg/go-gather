import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { Dayjs } from 'dayjs';
import { EventMetadata, PogoEvent, Season } from '@go-gather/shared';
import { CalendarFilterService } from '../../core/services/calendar-filter.service';
import {
  CalendarDayLayout,
  EventBarPosition,
  MULTI_DAY_EVENT_BAR_HEIGHT,
} from './calendar-day-layout.util';
import { EventSlot } from './calendar-grid-slots.util';
import { getDailySingleDayEvents, getSourceEventID } from './calendar-single-day-events.util';
import { getSeasonDailyChip, SeasonChip } from './season-daily-chip.util';
import { MultiDayEventBarComponent } from './multi-day-event-bar.component';
import { SingleDayEventComponent } from './single-day-event.component';

/**
 * Ported from pogo-cal's CalendarDay.vue, minus BirthdayBadge (unrelated
 * Pokemon-GO-anniversary decoration, not ported) and the loading skeleton
 * (low-stakes, not resolved either way — a simple/minimal loading state is
 * left to calendar-view instead of a per-cell skeleton). One
 * CalendarDayLayout instance is built per input change and reused across
 * every getter/method call for this cell.
 *
 * Reads CalendarFilterService directly (rather than taking an
 * isEventVisible input from calendar-view) and subscribes to its change
 * stream, mirroring generation-header-row.component.ts's
 * subscribe+markForCheck pattern — the global filter menu can toggle state
 * while this OnPush cell is on screen, and an unchanged @Input reference
 * wouldn't otherwise trigger a re-render.
 */
@Component({
  selector: 'app-calendar-day',
  imports: [MultiDayEventBarComponent, SingleDayEventComponent],
  templateUrl: './calendar-day.component.html',
  styleUrl: './calendar-day.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarDayComponent implements OnChanges, OnInit, OnDestroy {
  private readonly calendarFilterService = inject(CalendarFilterService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  readonly barHeight = MULTI_DAY_EVENT_BAR_HEIGHT;

  @Input({ required: true }) date!: number;
  @Input({ required: true }) isCurrentMonth = false;
  @Input({ required: true }) isToday = false;
  @Input({ required: true }) dayInstance!: Dayjs;
  @Input({ required: true }) events: readonly PogoEvent[] = [];
  @Input({ required: true }) eventMetadata: Readonly<Record<string, EventMetadata>> = {};
  @Input({ required: true }) eventSlots: readonly EventSlot[] = [];
  @Input() season: Season | undefined;
  @Input({ required: true }) today!: Dayjs;
  @Input() firstDayIndex = 0;

  @Output() eventClick = new EventEmitter<PogoEvent>();

  private layout!: CalendarDayLayout;
  private filterChangeSubscription?: Subscription;

  ngOnInit(): void {
    this.filterChangeSubscription = this.calendarFilterService
      .listenForFilterChanges()
      .subscribe(() => {
        this.changeDetectorRef.markForCheck();
      });
  }

  ngOnChanges(): void {
    this.layout = new CalendarDayLayout(
      this.dayInstance,
      this.eventSlots,
      this.eventMetadata,
      this.firstDayIndex
    );
  }

  ngOnDestroy(): void {
    this.filterChangeSubscription?.unsubscribe();
  }

  get multiDayEvents(): PogoEvent[] {
    return this.layout.getMultiDayEvents();
  }

  get multiDayEventsHeight(): number {
    return this.layout.getMultiDayEventsHeight();
  }

  get singleDayEvents(): PogoEvent[] {
    return getDailySingleDayEvents(
      this.events,
      this.eventMetadata,
      this.dayInstance,
      (eventType, eventId) => this.calendarFilterService.isEventVisible(eventType, eventId)
    );
  }

  get seasonChip(): SeasonChip | null {
    return getSeasonDailyChip(this.season, this.dayInstance, this.today, this.firstDayIndex);
  }

  getEventSlotTop(event: PogoEvent): number {
    return this.layout.getEventSlotTop(event);
  }

  getMultiDayEventBarClass(event: PogoEvent): string {
    return this.layout.getMultiDayEventBarClass(event, this.dayInstance);
  }

  getEventPosition(event: PogoEvent): EventBarPosition {
    return this.layout.getEventPosition(event, this.dayInstance);
  }

  getMetadataFor(event: PogoEvent): EventMetadata {
    return this.eventMetadata[getSourceEventID(event)];
  }

  onEventClick(event: PogoEvent): void {
    this.eventClick.emit(event);
  }

  /**
   * Season chip's sourceEventID comes from CalendarEventsService.season — a
   * fully separate fetch from this calendar's own events feed, with no
   * structural guarantee a matching event exists here. No-ops if not found,
   * mirroring source's own defensive v-if="seasonChip.event" guard.
   */
  onSeasonChipClick(sourceEventID: string): void {
    const event = this.events.find((e) => e.eventID === sourceEventID);
    if (event) {
      this.eventClick.emit(event);
    }
  }
}
