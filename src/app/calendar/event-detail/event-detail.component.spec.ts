import { ComponentFixture, TestBed } from '@angular/core/testing';
import dayjs from 'dayjs';
import { EventMetadata, EventTypeInfoWithoutColor, PogoEvent } from '@go-gather/shared';
import { EventDetailComponent } from './event-detail.component';

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
    name: 'Raid Day',
    priority: 78,
    category: 'community-and-raids',
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

describe('EventDetailComponent', () => {
  let fixture: ComponentFixture<EventDetailComponent>;
  let component: EventDetailComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    TestBed.overrideComponent(EventDetailComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(EventDetailComponent);
    component = fixture.componentInstance;
    component.event = makeEvent();
    component.metadata = makeMetadata();
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

  it('emits closed when the close button is clicked', () => {
    const emitSpy = vi.spyOn(component.closed, 'emit');

    component.onCloseClick();

    expect(emitSpy).toHaveBeenCalled();
  });
});
