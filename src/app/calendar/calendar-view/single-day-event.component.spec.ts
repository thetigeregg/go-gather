import { ComponentFixture, TestBed } from '@angular/core/testing';
import dayjs from 'dayjs';
import { EventMetadata, EventTypeInfoWithoutColor, PogoEvent } from '@go-gather/shared';
import { DailyMajorDisplayEvent } from './calendar-single-day-events.util';
import { SingleDayEventComponent } from './single-day-event.component';

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Test &amp; Event',
    eventType: 'raid-day',
    heading: 'Event',
    link: 'https://leekduck.com/events/test/',
    image: 'image.png',
    start: '2026-07-08T10:00:00.000',
    end: '2026-07-08T20:00:00.000',
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
    startDate: dayjs('2026-07-08T10:00:00.000'),
    endDate: dayjs('2026-07-08T20:00:00.000'),
    isMultiDayEvent: false,
    isSingleDayEvent: true,
    isPastEvent: false,
    isFutureEvent: false,
    typeInfo,
    color: '#123456',
    formattedStartTime: '10:00am',
    displayName: 'Test Event',
    ...overrides,
  };
}

describe('SingleDayEventComponent', () => {
  let fixture: ComponentFixture<SingleDayEventComponent>;
  let component: SingleDayEventComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    TestBed.overrideComponent(SingleDayEventComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(SingleDayEventComponent);
    component = fixture.componentInstance;
    component.metadata = makeMetadata();
    component.isToday = false;
  });

  it('formats the display name by decoding HTML entities', () => {
    component.event = makeEvent({ name: 'Test &amp; Event' });
    expect(component.displayName).toBe('Test & Event');
  });

  it("resolves sourceEventID to the event's own ID for a regular event", () => {
    component.event = makeEvent({ eventID: 'event-1' });
    expect(component.sourceEventID).toBe('event-1');
    expect(component.isMajorDaily).toBe(false);
  });

  it('resolves sourceEventID and isMajorDaily for a major-daily projection', () => {
    const projection: DailyMajorDisplayEvent = {
      ...makeEvent({ eventID: 'gofest-2026-daily-2026-07-08', eventType: 'pokemon-go-fest' }),
      _isMajorDailyDisplay: true,
      _sourceEventID: 'gofest-2026',
    };
    component.event = projection;

    expect(component.sourceEventID).toBe('gofest-2026');
    expect(component.isMajorDaily).toBe(true);
  });

  it('defaults majorVariant to location-specific for a regular (non-major-daily) event', () => {
    component.event = makeEvent();
    expect(component.majorVariant).toBe('location-specific');
  });

  it('classifies majorVariant as global when the source event text mentions "global"', () => {
    const projection: DailyMajorDisplayEvent = {
      ...makeEvent({
        eventID: 'gofest-2026-daily-2026-07-08',
        eventType: 'pokemon-go-fest',
        name: 'GO Fest 2026: Global',
      }),
      _isMajorDailyDisplay: true,
      _sourceEventID: 'gofest-2026',
    };
    component.event = projection;

    expect(component.majorVariant).toBe('global');
  });

  it('classifies majorVariant as location-specific when nothing mentions "global"', () => {
    const projection: DailyMajorDisplayEvent = {
      ...makeEvent({
        eventID: 'gofest-2026-nyc-daily-2026-07-08',
        eventType: 'pokemon-go-fest',
        name: 'GO Fest 2026: New York',
        link: 'https://leekduck.com/events/gofest-2026-nyc/',
      }),
      _isMajorDailyDisplay: true,
      _sourceEventID: 'gofest-2026-nyc',
    };
    component.event = projection;

    expect(component.majorVariant).toBe('location-specific');
  });

  it('shows the Ended label only when the day is today and the event is past', () => {
    component.event = makeEvent();

    component.isToday = false;
    component.metadata = makeMetadata({ isPastEvent: true });
    expect(component.showEndedLabel).toBe(false);

    component.isToday = true;
    component.metadata = makeMetadata({ isPastEvent: false });
    expect(component.showEndedLabel).toBe(false);

    component.isToday = true;
    component.metadata = makeMetadata({ isPastEvent: true });
    expect(component.showEndedLabel).toBe(true);
  });

  it('emits eventClick with the event on click', () => {
    component.event = makeEvent();
    const emitSpy = vi.spyOn(component.eventClick, 'emit');

    component.onClick();

    expect(emitSpy).toHaveBeenCalledWith(component.event);
  });
});
