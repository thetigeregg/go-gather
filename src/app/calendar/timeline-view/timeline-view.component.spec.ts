import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import dayjs from 'dayjs';
import { EventMetadata, PogoEvent } from '@go-gather/shared';
import { TimelineViewComponent } from './timeline-view.component';
import { CalendarEventsService } from '../../core/services/calendar-events.service';
import {
  CalendarFilterService,
  CalendarFilterState,
} from '../../core/services/calendar-filter.service';
import { PokemonEventImagesComponent } from './pokemon-event-images.component';
import { PokemonImageComponent } from './pokemon-image.component';
import { RaidTierGroupImagesComponent } from './raid-tier-group-images.component';
import { TimelineCategorySectionComponent } from './timeline-category-section.component';
import { TimelineCollapsedScheduleComponent } from './timeline-collapsed-schedule.component';
import { TimelineEventComponent } from './timeline-event.component';
import { TimelineRaidScheduleComponent } from './timeline-raid-schedule.component';
import { SyncService } from '../../core/services/sync.service';

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Test Event',
    eventType: 'raid-day',
    heading: 'Event',
    link: 'https://leekduck.com/events/test/',
    image: 'image.png',
    start: '2026-07-08T10:00:00.000',
    end: '2026-07-08T20:00:00.000',
    ...overrides,
  };
}

describe('TimelineViewComponent', () => {
  let fixture: ComponentFixture<TimelineViewComponent>;
  let component: TimelineViewComponent;
  let events: PogoEvent[];
  let eventMetadata: Record<string, EventMetadata>;
  let filterState: CalendarFilterState;
  let filterChange$: Subject<void>;
  let calendarEventsSync$: Subject<void>;

  beforeEach(async () => {
    events = [];
    eventMetadata = {};
    filterState = { disabledEventTypes: [], hiddenEventIds: [], filtersApplyToTimeline: false };
    filterChange$ = new Subject<void>();
    calendarEventsSync$ = new Subject<void>();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: CalendarEventsService,
          useValue: {
            loadCalendarEvents: () => of(events),
            get events() {
              return events;
            },
            get eventMetadata() {
              return eventMetadata;
            },
          },
        },
        {
          provide: CalendarFilterService,
          useValue: {
            getFilterState: () => filterState,
            isEventVisible: () => true,
            listenForFilterChanges: () => filterChange$.asObservable(),
          },
        },
        {
          provide: SyncService,
          useValue: {
            listenForCalendarEventsSync: () => calendarEventsSync$.asObservable(),
          },
        },
      ],
    });
    for (const cmp of [
      TimelineViewComponent,
      TimelineCategorySectionComponent,
      TimelineEventComponent,
      PokemonEventImagesComponent,
      TimelineCollapsedScheduleComponent,
      TimelineRaidScheduleComponent,
      RaidTierGroupImagesComponent,
      PokemonImageComponent,
    ]) {
      TestBed.overrideComponent(cmp, { set: { template: '<div></div>', styleUrl: undefined } });
    }
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(TimelineViewComponent);
    component = fixture.componentInstance;
  });

  it('builds an empty timeline synchronously on init, before data loads', () => {
    fixture.detectChanges();

    expect(component.timelineData.hasAnyEvents).toBe(false);
  });

  it('rebuilds timelineData once calendar event data finishes loading', () => {
    const start = dayjs();
    const end = start.add(2, 'hour');
    events = [makeEvent({ start: start.toISOString(), end: end.toISOString() })];
    eventMetadata = {
      'event-1': {
        startDate: start,
        endDate: end,
        isMultiDayEvent: false,
        isSingleDayEvent: true,
        isPastEvent: false,
        isFutureEvent: false,
        typeInfo: { name: 'Test', priority: 50, category: 'events-and-misc' },
        color: '#123456',
        formattedStartTime: '10am',
        displayName: 'Test Event',
      },
    };

    fixture.detectChanges();

    expect(component.timelineData.hasAnyEvents).toBe(true);
    expect(component.eventMetadata).toBe(eventMetadata);
  });

  it('re-loads and rebuilds timelineData when SyncService pulls fresh calendar-events data', () => {
    fixture.detectChanges();
    expect(component.timelineData.hasAnyEvents).toBe(false);

    // Data lands in local storage moments after the view's own initial
    // (empty) load already resolved — this is the exact race that used to
    // leave the timeline stuck showing "No upcoming events found" forever.
    const start = dayjs();
    const end = start.add(2, 'hour');
    events = [makeEvent({ start: start.toISOString(), end: end.toISOString() })];
    eventMetadata = {
      'event-1': {
        startDate: start,
        endDate: end,
        isMultiDayEvent: false,
        isSingleDayEvent: true,
        isPastEvent: false,
        isFutureEvent: false,
        typeInfo: { name: 'Test', priority: 50, category: 'events-and-misc' },
        color: '#123456',
        formattedStartTime: '10am',
        displayName: 'Test Event',
      },
    };

    calendarEventsSync$.next();

    expect(component.timelineData.hasAnyEvents).toBe(true);
  });

  it('recomputes timelineData when the global filter state changes', () => {
    fixture.detectChanges();
    const before = component.timelineData;

    filterChange$.next();

    expect(component.timelineData).not.toBe(before);
  });

  it('delegates to CalendarFilterService.isEventVisible when filtersApplyToTimeline is on', () => {
    const start = dayjs();
    const end = start.add(2, 'hour');
    events = [makeEvent({ start: start.toISOString(), end: end.toISOString() })];
    eventMetadata = {
      'event-1': {
        startDate: start,
        endDate: end,
        isMultiDayEvent: false,
        isSingleDayEvent: true,
        isPastEvent: false,
        isFutureEvent: false,
        typeInfo: { name: 'Test', priority: 50, category: 'events-and-misc' },
        color: '#123456',
        formattedStartTime: '10am',
        displayName: 'Test Event',
      },
    };
    filterState = {
      disabledEventTypes: [],
      hiddenEventIds: ['event-1'],
      filtersApplyToTimeline: true,
    };

    const isEventVisibleSpy = vi.spyOn(TestBed.inject(CalendarFilterService), 'isEventVisible');

    fixture.detectChanges();

    expect(isEventVisibleSpy).toHaveBeenCalledWith('raid-day', 'event-1');
  });

  it('expands a card on first activate, and scrolls it into view after a delay', () => {
    vi.useFakeTimers();
    const scrollIntoViewSpy = vi.fn();
    document.body.innerHTML = '<div data-timeline-event-id="event-1"></div>';
    const card = document.querySelector('[data-timeline-event-id="event-1"]');
    if (card) {
      (card as HTMLElement).scrollIntoView = scrollIntoViewSpy;
    }

    component.setActiveEvent('event-1');
    expect(component.activeEventId).toBe('event-1');

    vi.advanceTimersByTime(200);

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
    vi.useRealTimers();
  });

  it('collapses an already-active card on re-activate, without scrolling', () => {
    vi.useFakeTimers();
    component.activeEventId = 'event-1';

    component.setActiveEvent('event-1');

    expect(component.activeEventId).toBeNull();
    vi.advanceTimersByTime(200);
    vi.useRealTimers();
  });

  it('does not throw when the activated card element is not found in the DOM', () => {
    vi.useFakeTimers();

    component.setActiveEvent('missing-event');
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();

    vi.useRealTimers();
  });
});
