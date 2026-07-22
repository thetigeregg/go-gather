import { ComponentFixture, TestBed } from '@angular/core/testing';
import dayjs from 'dayjs';
import { EventMetadata, EventTypeInfoWithoutColor, PogoEvent } from '@go-gather/shared';
import { TimelineEventComponent } from './timeline-event.component';

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
    formattedStartTime: '10am',
    displayName: 'Test Event',
    ...overrides,
  };
}

describe('TimelineEventComponent', () => {
  let fixture: ComponentFixture<TimelineEventComponent>;
  let component: TimelineEventComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    TestBed.overrideComponent(TimelineEventComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(TimelineEventComponent);
    component = fixture.componentInstance;
    component.event = makeEvent();
    component.metadata = makeMetadata();
    component.isActive = false;
    component.now = dayjs('2026-07-08T12:00:00.000');
  });

  it('formats the display name by decoding HTML entities', () => {
    expect(component.displayName).toBe('Test & Event');
  });

  it('computes timeDisplayParts from the event metadata and now', () => {
    expect(component.timeDisplayParts.startTime).toBeDefined();
    expect(component.timeDisplayParts.focusEnd).toBe(true); // live event: end time focused
  });

  it('computes statusInfo from the event metadata and now', () => {
    expect(component.statusInfo?.type).toBe('urgent'); // ends today, live
  });

  it('returns extras when the event has bonus data, null otherwise', () => {
    expect(component.extras).toBeNull();

    component.event = makeEvent({
      eventType: 'pokemon-spotlight-hour',
      extraData: { spotlight: { name: 'Bulbasaur', canBeShiny: true, bonus: '2x Catch XP' } },
    });
    expect(component.extras?.spotlightBonus).toBe('2x Catch XP');
  });

  it('reports isMajorTimelineEvent/majorTimelineVariant for a major calendar event type', () => {
    component.event = makeEvent({
      eventType: 'pokemon-go-fest',
      name: 'GO Fest: Global',
      link: 'https://leekduck.com/events/gofest/',
    });

    expect(component.isMajorTimelineEvent).toBe(true);
    expect(component.majorTimelineVariant).toBe('global');
  });

  it('reports isMajorTimelineEvent false for a non-major event type', () => {
    expect(component.isMajorTimelineEvent).toBe(false);
    expect(component.majorTimelineVariant).toBe('location-specific');
  });

  it('emits activate with the eventID on header click', () => {
    const emitSpy = vi.spyOn(component.activate, 'emit');

    component.onHeaderClick();

    expect(emitSpy).toHaveBeenCalledWith('event-1');
  });
});
