import { Component, OnInit, inject } from '@angular/core';
import dayjs, { Dayjs } from 'dayjs';
import { EventMetadata } from '@go-gather/shared';
import { CalendarEventsService } from '../../core/services/calendar-events.service';
import { CalendarFilterService } from '../../core/services/calendar-filter.service';
import { buildTimelineData, TIMELINE_CATEGORIES, TimelineData } from './timeline-categories.util';
import { TimelineCategorySectionComponent } from './timeline-category-section.component';

const SCROLL_INTO_VIEW_DELAY_MS = 200;

function emptyTimelineData(): TimelineData {
  return {
    categorizedEvents: { today: [], ongoing: [], upcoming: [], future: [] },
    totalEventsCounts: { today: 0, ongoing: 0, upcoming: 0, future: 0 },
    hiddenEventsCounts: { today: 0, ongoing: 0, upcoming: 0, future: 0 },
    groupedByDate: {},
    hasAnyEvents: false,
  };
}

/**
 * Ported from pogo-cal's EventTimeline.vue + useTimelineActiveEvent.ts. Same
 * self-sufficient design as calendar-view.component.ts — no
 * calendar.page.ts/IonSelect toggle exists yet (Phase 6), so this component
 * loads its own data. Unlike calendar-view, it never loads season data
 * (timeline-categories.util.ts doesn't use it).
 *
 * "Now" is a plain snapshot recomputed on refresh() (init, data load, filter
 * change) rather than a live-ticking clock — see the plan's simplification
 * note; an event won't visibly hop categories while the page sits open.
 */
@Component({
  selector: 'app-timeline-view',
  imports: [TimelineCategorySectionComponent],
  templateUrl: './timeline-view.component.html',
  styleUrl: './timeline-view.component.scss',
})
export class TimelineViewComponent implements OnInit {
  private readonly calendarEventsService = inject(CalendarEventsService);
  private readonly calendarFilterService = inject(CalendarFilterService);

  readonly categories = TIMELINE_CATEGORIES;

  now: Dayjs = dayjs();
  activeEventId: string | null = null;
  timelineData: TimelineData = emptyTimelineData();

  ngOnInit(): void {
    this.refresh();

    this.calendarEventsService.loadCalendarEvents().subscribe(() => {
      this.refresh();
    });

    this.calendarFilterService.listenForFilterChanges().subscribe(() => {
      this.refresh();
    });
  }

  get eventMetadata(): Readonly<Record<string, EventMetadata>> {
    return this.calendarEventsService.eventMetadata;
  }

  setActiveEvent(eventId: string): void {
    const previousActiveId = this.activeEventId;
    this.activeEventId = this.activeEventId === eventId ? null : eventId;

    if (this.activeEventId && this.activeEventId !== previousActiveId) {
      setTimeout(() => {
        const eventCard = document.querySelector(`[data-timeline-event-id="${eventId}"]`);
        if (eventCard instanceof HTMLElement) {
          eventCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, SCROLL_INTO_VIEW_DELAY_MS);
    }
  }

  private refresh(): void {
    this.now = dayjs();
    const filterState = this.calendarFilterService.getFilterState();
    this.timelineData = buildTimelineData(
      this.calendarEventsService.events,
      this.eventMetadata,
      this.now,
      (eventType, eventId) => this.calendarFilterService.isEventVisible(eventType, eventId),
      filterState.filtersApplyToTimeline
    );
  }
}
