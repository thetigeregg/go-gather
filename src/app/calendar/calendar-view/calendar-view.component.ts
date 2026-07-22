import { Component, OnInit, inject } from '@angular/core';
import dayjs, { Dayjs } from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { forkJoin } from 'rxjs';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { calendarOutline, chevronBack, chevronForward } from 'ionicons/icons';
import { EventMetadata, PogoEvent, Season } from '@go-gather/shared';
import { CalendarEventsService } from '../../core/services/calendar-events.service';
import { CalendarFilterService } from '../../core/services/calendar-filter.service';
import { CalendarDayComponent } from './calendar-day.component';
import { buildEventSlots, EventSlot } from './calendar-grid-slots.util';
import { buildCalendarDays, CalendarDayCell } from './calendar-grid.util';

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

/** "First day of week" display preference dropped for this port — Sunday only. */
const FIRST_DAY_INDEX = 0;
const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EARLIEST_MONTH = dayjs().year(2016).month(0);

/**
 * Ported from pogo-cal's CalendarGrid.vue + CalendarHeader.vue, minus the
 * ?month=&year= URL sync (deferred — plain component fields instead) and
 * the desktop-sidebar timeline toggle (that's the future calendar page's
 * IonSelect, not this component's job). No calendar.page.ts exists yet
 * (Phase 6), so this component is self-sufficient: it loads its own
 * event/season data on init rather than waiting on a shared page-level
 * loader (Phase 6 may hoist this up to share with timeline-view — noted as
 * a follow-up, not a blocker).
 */
@Component({
  selector: 'app-calendar-view',
  imports: [IonButton, IonIcon, CalendarDayComponent],
  templateUrl: './calendar-view.component.html',
  styleUrl: './calendar-view.component.scss',
})
export class CalendarViewComponent implements OnInit {
  private readonly calendarEventsService = inject(CalendarEventsService);
  private readonly calendarFilterService = inject(CalendarFilterService);

  readonly dayHeaders = DAY_HEADERS;
  readonly firstDayIndex = FIRST_DAY_INDEX;

  today: Dayjs = dayjs();
  month = this.today.month();
  year = this.today.year();

  calendarDays: CalendarDayCell[] = [];
  eventSlots: EventSlot[] = [];

  constructor() {
    addIcons({
      'calendar-outline': calendarOutline,
      'chevron-back': chevronBack,
      'chevron-forward': chevronForward,
    });
  }

  ngOnInit(): void {
    this.refresh();

    forkJoin([
      this.calendarEventsService.loadCalendarEvents(),
      this.calendarEventsService.loadSeason(),
    ]).subscribe(() => {
      this.refresh();
    });

    this.calendarFilterService.listenForFilterChanges().subscribe(() => {
      this.refresh();
    });
  }

  get events(): readonly PogoEvent[] {
    return this.calendarEventsService.events;
  }

  get eventMetadata(): Readonly<Record<string, EventMetadata>> {
    return this.calendarEventsService.eventMetadata;
  }

  get season(): Season | undefined {
    return this.calendarEventsService.season;
  }

  get monthLabel(): string {
    return dayjs().year(this.year).month(this.month).format('MMMM YYYY');
  }

  get isCurrentMonth(): boolean {
    const now = dayjs();
    return this.year === now.year() && this.month === now.month();
  }

  get isPreviousDisabled(): boolean {
    const current = dayjs().year(this.year).month(this.month);
    return current.isSameOrBefore(EARLIEST_MONTH, 'month');
  }

  get isNextDisabled(): boolean {
    const now = dayjs();
    const current = now.year(this.year).month(this.month);
    const latest = now.year(now.year() + 1).month(11);
    return current.isSameOrAfter(latest, 'month');
  }

  goToPreviousMonth(): void {
    const prev = dayjs().year(this.year).month(this.month).subtract(1, 'month');
    this.month = prev.month();
    this.year = prev.year();
    this.refresh();
  }

  goToNextMonth(): void {
    const next = dayjs().year(this.year).month(this.month).add(1, 'month');
    this.month = next.month();
    this.year = next.year();
    this.refresh();
  }

  goToCurrentMonth(): void {
    const now = dayjs();
    this.month = now.month();
    this.year = now.year();
    this.refresh();
  }

  private refresh(): void {
    this.today = dayjs();
    this.calendarDays = buildCalendarDays(this.today, {
      year: this.year,
      month: this.month,
      firstDayIndex: this.firstDayIndex,
    });
    this.eventSlots = buildEventSlots(
      this.events,
      this.eventMetadata,
      this.calendarDays,
      (eventType, eventId) => this.calendarFilterService.isEventVisible(eventType, eventId),
      this.firstDayIndex
    );
  }
}
