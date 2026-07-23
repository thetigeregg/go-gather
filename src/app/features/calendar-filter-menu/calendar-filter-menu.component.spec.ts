import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EVENT_TYPES, EventMetadata, PogoEvent } from '@go-gather/shared';
import { CalendarFilterMenuComponent } from './calendar-filter-menu.component';
import { CalendarEventsService } from '../../core/services/calendar-events.service';
import {
  CalendarFilterService,
  CalendarFilterState,
} from '../../core/services/calendar-filter.service';

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

describe('CalendarFilterMenuComponent', () => {
  let fixture: ComponentFixture<CalendarFilterMenuComponent>;
  let component: CalendarFilterMenuComponent;
  let filterState: CalendarFilterState;
  let eventMetadata: Record<string, EventMetadata>;
  let events: PogoEvent[];

  function makeFilterState(overrides: Partial<CalendarFilterState> = {}): CalendarFilterState {
    return {
      disabledEventTypes: ['go-pass', 'season', 'season-daily-bonus'],
      hiddenEventIds: [],
      filtersApplyToTimeline: false,
      ...overrides,
    };
  }

  const toggleEventTypeCalls: string[] = [];
  const setFiltersApplyToTimelineCalls: boolean[] = [];
  const showEventByIdCalls: string[] = [];
  let enableAllCalled = false;
  let disableAllCalled = false;

  beforeEach(async () => {
    filterState = makeFilterState();
    eventMetadata = {};
    events = [];
    toggleEventTypeCalls.length = 0;
    setFiltersApplyToTimelineCalls.length = 0;
    showEventByIdCalls.length = 0;
    enableAllCalled = false;
    disableAllCalled = false;

    TestBed.configureTestingModule({
      providers: [
        {
          provide: CalendarFilterService,
          useValue: {
            getFilterState: () => filterState,
            toggleEventType: (eventType: string) => {
              toggleEventTypeCalls.push(eventType);
              const disabled = filterState.disabledEventTypes.includes(eventType)
                ? filterState.disabledEventTypes.filter((t) => t !== eventType)
                : [...filterState.disabledEventTypes, eventType];
              filterState = { ...filterState, disabledEventTypes: disabled };
            },
            enableAllEventTypes: () => {
              enableAllCalled = true;
              filterState = { ...filterState, disabledEventTypes: [] };
            },
            disableAllEventTypes: () => {
              disableAllCalled = true;
              filterState = { ...filterState, disabledEventTypes: Object.keys(EVENT_TYPES) };
            },
            setFiltersApplyToTimeline: (value: boolean) => {
              setFiltersApplyToTimelineCalls.push(value);
              filterState = { ...filterState, filtersApplyToTimeline: value };
            },
            showEventById: (eventId: string) => {
              showEventByIdCalls.push(eventId);
              filterState = {
                ...filterState,
                hiddenEventIds: filterState.hiddenEventIds.filter((id) => id !== eventId),
              };
            },
          },
        },
        {
          provide: CalendarEventsService,
          useValue: {
            get eventMetadata() {
              return eventMetadata;
            },
            get events() {
              return events;
            },
          },
        },
      ],
    });
    TestBed.overrideComponent(CalendarFilterMenuComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(CalendarFilterMenuComponent);
    component = fixture.componentInstance;
  });

  it('groups event types by category, in the ported display order, reflecting current state', () => {
    fixture.detectChanges();

    expect(component.categoryGroups.map((g) => g.label)).toEqual([
      'Seasonal & Premium',
      'Research',
      'Community & Raids',
      'Events & Misc',
    ]);

    const communityDay = component.categoryGroups
      .flatMap((g) => g.options)
      .find((o) => o.eventType === 'community-day');
    expect(communityDay?.isOn).toBe(true);

    const goPass = component.categoryGroups
      .flatMap((g) => g.options)
      .find((o) => o.eventType === 'go-pass');
    expect(goPass?.isOn).toBe(false);

    const dailyBonus = component.categoryGroups
      .flatMap((g) => g.options)
      .find((o) => o.eventType === 'season-daily-bonus');
    expect(dailyBonus?.label).toBe('Daily Bonus');
    expect(dailyBonus?.isOn).toBe(false);
  });

  it('computes enabledCount/totalCount from the full EVENT_TYPES registry', () => {
    fixture.detectChanges();

    expect(component.totalCount).toBe(Object.keys(EVENT_TYPES).length);
    expect(component.enabledCount).toBe(Object.keys(EVENT_TYPES).length - 3);
  });

  it('onToggleEventType delegates to the service and refreshes', () => {
    fixture.detectChanges();

    component.onToggleEventType('community-day');

    expect(toggleEventTypeCalls).toEqual(['community-day']);
    const communityDay = component.categoryGroups
      .flatMap((g) => g.options)
      .find((o) => o.eventType === 'community-day');
    expect(communityDay?.isOn).toBe(false);
  });

  it('enableAll/disableAll delegate to the service and refresh the counts', () => {
    fixture.detectChanges();

    component.enableAll();
    expect(enableAllCalled).toBe(true);
    expect(component.enabledCount).toBe(Object.keys(EVENT_TYPES).length);

    component.disableAll();
    expect(disableAllCalled).toBe(true);
    expect(component.enabledCount).toBe(0);
  });

  it('onFiltersApplyToTimelineChange delegates to the service', () => {
    fixture.detectChanges();

    component.onFiltersApplyToTimelineChange(true);

    expect(setFiltersApplyToTimelineCalls).toEqual([true]);
    expect(component.filtersApplyToTimeline).toBe(true);
  });

  it('resolves hidden-event display names via CalendarEventsService metadata first', () => {
    filterState = makeFilterState({ hiddenEventIds: ['event-1'] });
    eventMetadata = {
      'event-1': { displayName: 'Community Day: Bulbasaur' } as EventMetadata,
    };
    fixture.detectChanges();

    expect(component.hiddenEvents).toEqual([
      { eventId: 'event-1', displayName: 'Community Day: Bulbasaur' },
    ]);
  });

  it('falls back to the raw (decoded) event name when metadata for it has not loaded', () => {
    filterState = makeFilterState({ hiddenEventIds: ['event-2'] });
    eventMetadata = {};
    events = [makeEvent({ eventID: 'event-2', name: 'Raid Day: Machamp &amp; Friends' })];
    fixture.detectChanges();

    expect(component.hiddenEvents).toEqual([
      { eventId: 'event-2', displayName: 'Raid Day: Machamp & Friends' },
    ]);
  });

  it('falls back to the raw id when neither metadata nor the underlying event is loaded', () => {
    filterState = makeFilterState({ hiddenEventIds: ['event-3'] });
    eventMetadata = {};
    events = [];
    fixture.detectChanges();

    expect(component.hiddenEvents).toEqual([{ eventId: 'event-3', displayName: 'event-3' }]);
  });

  it('onWillOpen refreshes hidden events against the latest data, not just the state from ngOnInit', () => {
    filterState = makeFilterState({ hiddenEventIds: ['event-1'] });
    eventMetadata = {};
    fixture.detectChanges();
    expect(component.hiddenEvents).toEqual([{ eventId: 'event-1', displayName: 'event-1' }]);

    eventMetadata = { 'event-1': { displayName: 'Community Day: Bulbasaur' } as EventMetadata };
    component.onWillOpen();

    expect(component.hiddenEvents).toEqual([
      { eventId: 'event-1', displayName: 'Community Day: Bulbasaur' },
    ]);
  });

  it('restoreHiddenEvent delegates to the service and refreshes the hidden list', () => {
    filterState = makeFilterState({ hiddenEventIds: ['event-1'] });
    fixture.detectChanges();

    component.restoreHiddenEvent('event-1');

    expect(showEventByIdCalls).toEqual(['event-1']);
    expect(component.hiddenEvents).toEqual([]);
  });
});
