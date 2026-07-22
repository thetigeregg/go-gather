import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import dayjs from 'dayjs';
import { EventMetadata, PogoEvent, Season } from '@go-gather/shared';
import { CalendarViewComponent } from './calendar-view.component';
import { CalendarEventsService } from '../../core/services/calendar-events.service';
import { CalendarFilterService } from '../../core/services/calendar-filter.service';
import { CalendarDayComponent } from './calendar-day.component';
import { MultiDayEventBarComponent } from './multi-day-event-bar.component';
import { SingleDayEventComponent } from './single-day-event.component';

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Test Event',
    eventType: 'raid-day',
    heading: 'Event',
    link: 'https://leekduck.com/events/test/',
    image: 'image.png',
    start: '2026-07-08T00:00:00.000',
    end: '2026-07-08T00:00:00.000',
    ...overrides,
  };
}

describe('CalendarViewComponent', () => {
  let fixture: ComponentFixture<CalendarViewComponent>;
  let component: CalendarViewComponent;
  let events: PogoEvent[];
  let eventMetadata: Record<string, EventMetadata>;
  let season: Season | undefined;
  let filterChange$: Subject<void>;

  beforeEach(async () => {
    events = [];
    eventMetadata = {};
    season = undefined;
    filterChange$ = new Subject<void>();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: CalendarEventsService,
          useValue: {
            loadCalendarEvents: () => of(events),
            loadSeason: () => of(season),
            get events() {
              return events;
            },
            get eventMetadata() {
              return eventMetadata;
            },
            get season() {
              return season;
            },
          },
        },
        {
          provide: CalendarFilterService,
          useValue: {
            isEventVisible: () => true,
            listenForFilterChanges: () => filterChange$.asObservable(),
          },
        },
      ],
    });
    for (const cmp of [
      CalendarViewComponent,
      CalendarDayComponent,
      MultiDayEventBarComponent,
      SingleDayEventComponent,
    ]) {
      TestBed.overrideComponent(cmp, { set: { template: '<div></div>', styleUrl: undefined } });
    }
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(CalendarViewComponent);
    component = fixture.componentInstance;
  });

  it("builds the current month's calendar days and event slots synchronously on init, before data loads", () => {
    const now = dayjs();
    fixture.detectChanges();

    expect(component.month).toBe(now.month());
    expect(component.year).toBe(now.year());
    expect(component.calendarDays.length).toBeGreaterThan(0);
    expect(component.calendarDays.some((d) => d.isToday)).toBe(true);
  });

  it('rebuilds event slots once calendar event/season data finishes loading', () => {
    events = [
      makeEvent({
        eventID: 'multi-1',
        start: '2026-07-08T00:00:00.000',
        end: '2026-07-09T00:00:00.000',
      }),
    ];
    eventMetadata = {
      'multi-1': {
        startDate: dayjs('2026-07-08'),
        endDate: dayjs('2026-07-09'),
        isMultiDayEvent: true,
        isSingleDayEvent: false,
        isPastEvent: false,
        isFutureEvent: false,
        typeInfo: { name: 'Test', priority: 50, category: 'events-and-misc' },
        color: '#123456',
        formattedStartTime: '12am',
        displayName: 'Test Event',
      },
    };
    component.month = 6;
    component.year = 2026;

    fixture.detectChanges();

    season = {
      name: 'Forever Forward',
      eventID: 'season-1',
      link: 'https://leekduck.com/events/season-1/',
      start: '2026-06-02T10:00:00.000',
      end: '2026-09-08T10:00:00.000',
      note: null,
      dailyBonuses: [],
      seasonBonuses: [],
    };

    expect(component.eventSlots).toHaveLength(1);
    expect(component.events).toBe(events);
    expect(component.eventMetadata).toBe(eventMetadata);
    expect(component.season).toBe(season);
  });

  it('recomputes event slots when the global filter state changes', () => {
    fixture.detectChanges();
    const before = component.eventSlots;

    filterChange$.next();

    expect(component.eventSlots).not.toBe(before);
    expect(component.eventSlots).toEqual(before);
  });

  it('formats the month label for the currently-viewed month/year', () => {
    component.month = 0;
    component.year = 2026;
    fixture.detectChanges();

    expect(component.monthLabel).toBe('January 2026');
  });

  it('reports isCurrentMonth true only for the real current month/year', () => {
    const now = dayjs();
    component.month = now.month();
    component.year = now.year();
    expect(component.isCurrentMonth).toBe(true);

    component.month = now.month() === 0 ? 1 : 0;
    expect(component.isCurrentMonth).toBe(false);
  });

  it('disables previous navigation at or before January 2016', () => {
    component.month = 0;
    component.year = 2016;
    expect(component.isPreviousDisabled).toBe(true);

    component.month = 1;
    component.year = 2016;
    expect(component.isPreviousDisabled).toBe(false);
  });

  it('disables next navigation at or after December of next year', () => {
    const nextYear = dayjs().year() + 1;
    component.month = 11;
    component.year = nextYear;
    expect(component.isNextDisabled).toBe(true);

    component.month = 10;
    component.year = nextYear;
    expect(component.isNextDisabled).toBe(false);
  });

  it('navigates to the previous/next month, wrapping the year, and refreshes the grid', () => {
    fixture.detectChanges();
    component.month = 0;
    component.year = 2026;

    component.goToPreviousMonth();
    expect(component.month).toBe(11);
    expect(component.year).toBe(2025);

    component.goToNextMonth();
    expect(component.month).toBe(0);
    expect(component.year).toBe(2026);
  });

  it('navigates back to the real current month/year', () => {
    fixture.detectChanges();
    component.month = 0;
    component.year = 2016;

    component.goToCurrentMonth();

    const now = dayjs();
    expect(component.month).toBe(now.month());
    expect(component.year).toBe(now.year());
  });
});
