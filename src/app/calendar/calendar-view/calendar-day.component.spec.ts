import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import dayjs from 'dayjs';
import { EventMetadata, EventTypeInfoWithoutColor, PogoEvent, Season } from '@go-gather/shared';
import { CalendarDayComponent } from './calendar-day.component';
import { CalendarFilterService } from '../../core/services/calendar-filter.service';
import { buildEventSlots } from './calendar-grid-slots.util';
import { buildCalendarDays } from './calendar-grid.util';
import { MultiDayEventBarComponent } from './multi-day-event-bar.component';
import { SingleDayEventComponent } from './single-day-event.component';

const CALENDAR_DAYS = buildCalendarDays(dayjs('2026-07-15'), {
  year: 2026,
  month: 6,
  firstDayIndex: 0,
});

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Test Event',
    eventType: 'raid-day',
    heading: 'Event',
    link: 'https://leekduck.com/events/test/',
    image: 'image.png',
    start: '2026-07-08T00:00:00.000',
    end: '2026-07-09T00:00:00.000',
    ...overrides,
  };
}

function makeMetadata(overrides: Partial<EventMetadata> = {}): EventMetadata {
  const typeInfo: EventTypeInfoWithoutColor = {
    name: 'Test',
    priority: 50,
    category: 'events-and-misc',
  };
  return {
    startDate: dayjs('2026-07-08'),
    endDate: dayjs('2026-07-09'),
    isMultiDayEvent: true,
    isSingleDayEvent: false,
    isPastEvent: false,
    isFutureEvent: false,
    typeInfo,
    color: '#123456',
    formattedStartTime: '12am',
    displayName: 'Test Event',
    ...overrides,
  };
}

function makeSeason(overrides: Partial<Season> = {}): Season {
  return {
    name: 'Forever Forward',
    eventID: 'season-1',
    link: 'https://leekduck.com/events/season-1/',
    start: '2026-06-02T10:00:00.000',
    end: '2026-09-08T10:00:00.000',
    note: null,
    dailyBonuses: [],
    seasonBonuses: [],
    ...overrides,
  };
}

const alwaysVisible = () => true;

describe('CalendarDayComponent', () => {
  let fixture: ComponentFixture<CalendarDayComponent>;
  let component: CalendarDayComponent;
  let hiddenEventTypes: Set<string>;
  let filterChange$: Subject<void>;

  beforeEach(async () => {
    hiddenEventTypes = new Set();
    filterChange$ = new Subject<void>();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: CalendarFilterService,
          useValue: {
            isEventVisible: (eventType: string) => !hiddenEventTypes.has(eventType),
            listenForFilterChanges: () => filterChange$.asObservable(),
          },
        },
      ],
    });
    TestBed.overrideComponent(CalendarDayComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(MultiDayEventBarComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(SingleDayEventComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(CalendarDayComponent);
    component = fixture.componentInstance;

    component.date = 8;
    component.isCurrentMonth = true;
    component.isToday = false;
    component.dayInstance = dayjs('2026-07-08');
    component.today = dayjs('2026-07-08');
    component.firstDayIndex = 0;
    component.events = [];
    component.eventMetadata = {};
    component.eventSlots = [];
    component.season = undefined;
  });

  it('exposes multi-day events for the day via CalendarDayLayout, sorted by compact slot index', () => {
    const multiDay = makeEvent({ eventID: 'multi-1', eventType: 'raid-day' });
    const eventMetadata = { 'multi-1': makeMetadata() };
    const slots = buildEventSlots([multiDay], eventMetadata, CALENDAR_DAYS, alwaysVisible, 0);

    component.events = [multiDay];
    component.eventMetadata = eventMetadata;
    component.eventSlots = slots;
    component.ngOnChanges();
    fixture.detectChanges();

    expect(component.multiDayEvents.map((e) => e.eventID)).toEqual(['multi-1']);
    expect(component.multiDayEventsHeight).toBeGreaterThan(0);
    expect(component.getEventSlotTop(multiDay)).toBe(0);
    expect(component.getMultiDayEventBarClass(multiDay)).toBeTruthy();
    expect(component.getEventPosition(multiDay).left).toBeDefined();
    expect(component.getMetadataFor(multiDay)).toBe(eventMetadata['multi-1']);
  });

  it('excludes a major event from multiDayEvents even though it still occupies a slot', () => {
    const goFest = makeEvent({ eventID: 'go-fest', eventType: 'pokemon-go-fest' });
    const eventMetadata = { 'go-fest': makeMetadata() };
    const slots = buildEventSlots([goFest], eventMetadata, CALENDAR_DAYS, alwaysVisible, 0);

    component.events = [goFest];
    component.eventMetadata = eventMetadata;
    component.eventSlots = slots;
    component.ngOnChanges();
    fixture.detectChanges();

    expect(slots).toHaveLength(1);
    expect(component.multiDayEvents).toEqual([]);
    expect(component.multiDayEventsHeight).toBe(0);
  });

  it('exposes the filtered/visible single-day events for the day (live via CalendarFilterService), resolving metadata for a major-daily projection', () => {
    const goFest = makeEvent({
      eventID: 'go-fest',
      eventType: 'pokemon-go-fest',
      start: '2026-07-08T00:00:00.000',
      end: '2026-07-10T00:00:00.000',
    });
    const regular = makeEvent({
      eventID: 'raid-day-1',
      eventType: 'raid-day',
      start: '2026-07-08T10:00:00.000',
      end: '2026-07-08T13:00:00.000',
    });
    const hidden = makeEvent({ eventID: 'hidden-1', eventType: 'go-pass' });
    const eventMetadata: Record<string, EventMetadata> = {
      'go-fest': makeMetadata({
        startDate: dayjs('2026-07-08'),
        endDate: dayjs('2026-07-10'),
        isMultiDayEvent: true,
        isSingleDayEvent: false,
      }),
      'raid-day-1': makeMetadata({
        startDate: dayjs('2026-07-08T10:00:00.000'),
        endDate: dayjs('2026-07-08T13:00:00.000'),
        isMultiDayEvent: false,
        isSingleDayEvent: true,
      }),
      'hidden-1': makeMetadata({ isMultiDayEvent: false, isSingleDayEvent: true }),
    };
    hiddenEventTypes.add('go-pass');

    component.events = [goFest, regular, hidden];
    component.eventMetadata = eventMetadata;
    component.ngOnChanges();
    fixture.detectChanges();

    const ids = component.singleDayEvents.map((e) => e.eventID);
    expect(ids).toEqual(['raid-day-1', 'go-fest-daily-2026-07-08']);
    expect(component.getMetadataFor(component.singleDayEvents[1])).toBe(eventMetadata['go-fest']);
  });

  it('subscribes to filter changes on init without throwing', () => {
    fixture.detectChanges();

    expect(() => {
      filterChange$.next();
    }).not.toThrow();
  });

  it('unsubscribes from filter changes on destroy', () => {
    fixture.detectChanges();
    fixture.destroy();

    expect(() => {
      filterChange$.next();
    }).not.toThrow();
  });

  it("exposes the current week's season daily chip, null when there is none", () => {
    expect(component.seasonChip).toBeNull();

    component.season = makeSeason({
      dailyBonuses: [
        {
          day: 'Wednesday',
          dayOfWeek: 3,
          bonuses: [{ title: 'Catch Mastery Wednesdays', items: [] }],
          footnote: null,
        },
      ],
    });
    fixture.detectChanges();

    expect(component.seasonChip?.label).toBe('Catch Mastery');
  });

  it('emits eventClick when a child bar/event emits', () => {
    const emitSpy = vi.spyOn(component.eventClick, 'emit');
    const event = makeEvent();

    component.onEventClick(event);

    expect(emitSpy).toHaveBeenCalledWith(event);
  });

  it('emits eventClick with the resolved event when the season chip is clicked and found in events', () => {
    const seasonEvent = makeEvent({ eventID: 'season-1', eventType: 'season' });
    component.events = [seasonEvent];
    const emitSpy = vi.spyOn(component.eventClick, 'emit');

    component.onSeasonChipClick('season-1');

    expect(emitSpy).toHaveBeenCalledWith(seasonEvent);
  });

  it("does not emit eventClick when the season chip's sourceEventID is not found in events", () => {
    component.events = [];
    const emitSpy = vi.spyOn(component.eventClick, 'emit');

    component.onSeasonChipClick('missing-event');

    expect(emitSpy).not.toHaveBeenCalled();
  });
});
