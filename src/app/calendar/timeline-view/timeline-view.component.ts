import { Component, OnInit, inject } from '@angular/core';
import dayjs, { Dayjs } from 'dayjs';
import { IonAccordionGroup } from '@ionic/angular/standalone';
import { EventMetadata, PogoEvent } from '@go-gather/shared';
import { CalendarEventsService } from '../../core/services/calendar-events.service';
import { CalendarFilterService } from '../../core/services/calendar-filter.service';
import { buildEventMetadata } from '../../core/services/calendar-event-metadata.util';
import { SyncService } from '../../core/services/sync.service';
import { buildTimelineData, TIMELINE_CATEGORIES, TimelineData } from './timeline-categories.util';
import { TimelineCategorySectionComponent } from './timeline-category-section.component';
import { generateSeasonDailyBonusEvents } from './timeline-season-daily-bonus-events.util';

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
 * loads its own data. Unlike calendar-view, it never fetches a separate
 * `Season` feed entry — it instead derives per-weekday daily-bonus rows
 * straight from any `season`-type PogoEvent already in the events list (see
 * timeline-season-daily-bonus-events.util.ts), so those show up as their own
 * timeline lines instead of only being visible nested inside the season
 * event's own expanded card. Kept out of CalendarEventsService's shared
 * pipeline deliberately — the calendar grid's chip-only presentation for
 * season bonuses is meant to stay as-is, not gain duplicate day cards too.
 *
 * "Now" is a plain snapshot recomputed on refresh() (init, data load, filter
 * change) rather than a live-ticking clock — see the plan's simplification
 * note; an event won't visibly hop categories while the page sits open.
 *
 * Also re-loads when `SyncService` pulls fresh calendar-events data — without
 * this, a view that mounts before the very first background sync has
 * written anything to local storage (fresh install, cleared storage, or
 * just unlucky timing) would show "No upcoming events found" forever, since
 * the initial `loadCalendarEvents()` call only ever resolves once and never
 * re-fires on its own once newer data lands moments later.
 */
@Component({
  selector: 'app-timeline-view',
  imports: [IonAccordionGroup, TimelineCategorySectionComponent],
  templateUrl: './timeline-view.component.html',
  styleUrl: './timeline-view.component.scss',
})
export class TimelineViewComponent implements OnInit {
  private readonly calendarEventsService = inject(CalendarEventsService);
  private readonly calendarFilterService = inject(CalendarFilterService);
  private readonly syncService = inject(SyncService);

  readonly categories = TIMELINE_CATEGORIES;
  readonly defaultExpandedCategories = TIMELINE_CATEGORIES.map((category) => category.key);

  now: Dayjs = dayjs();
  activeEventId: string | null = null;
  timelineData: TimelineData = emptyTimelineData();

  private seasonDailyBonusEvents: PogoEvent[] = [];
  private seasonDailyBonusEventMetadata: Record<string, EventMetadata> = {};

  ngOnInit(): void {
    this.refresh();
    this.loadAndRefresh();

    this.syncService.listenForCalendarEventsSync().subscribe(() => {
      this.loadAndRefresh();
    });

    this.calendarFilterService.listenForFilterChanges().subscribe(() => {
      this.refresh();
    });
  }

  get eventMetadata(): Readonly<Record<string, EventMetadata>> {
    return { ...this.calendarEventsService.eventMetadata, ...this.seasonDailyBonusEventMetadata };
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

  private loadAndRefresh(): void {
    this.calendarEventsService.loadCalendarEvents().subscribe(() => {
      this.refresh();
    });
  }

  private refresh(): void {
    this.now = dayjs();
    this.seasonDailyBonusEvents = generateSeasonDailyBonusEvents(
      this.calendarEventsService.events
    ).filter((event) => {
      const dayOfWeek = event.extraData?.season?.dailyBonuses[0]?.dayOfWeek;
      return (
        dayOfWeek === undefined || this.calendarFilterService.isDailyBonusDayEnabled(dayOfWeek)
      );
    });
    this.seasonDailyBonusEventMetadata = Object.fromEntries(
      this.seasonDailyBonusEvents.map((event) => [
        event.eventID,
        buildEventMetadata(event, this.now),
      ])
    );

    const filterState = this.calendarFilterService.getFilterState();
    this.timelineData = buildTimelineData(
      [...this.calendarEventsService.events, ...this.seasonDailyBonusEvents],
      this.eventMetadata,
      this.now,
      (eventType, eventId) => this.calendarFilterService.isEventVisible(eventType, eventId),
      filterState.filtersApplyToTimeline
    );
  }
}
