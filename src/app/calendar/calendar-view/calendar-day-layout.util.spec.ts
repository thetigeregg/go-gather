import dayjs from 'dayjs';
import { EventMetadata, EventTypeInfoWithoutColor, PogoEvent } from '@go-gather/shared';
import { CalendarDayLayout, MULTI_DAY_EVENT_BAR_HEIGHT } from './calendar-day-layout.util';
import { buildEventSlots } from './calendar-grid-slots.util';
import { buildCalendarDays } from './calendar-grid.util';

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Test Event',
    eventType: 'raid-day',
    heading: 'Event',
    link: 'https://leekduck.com/events/test/',
    image: 'image.png',
    start: '2026-07-08T00:00:00.000',
    end: '2026-07-10T00:00:00.000',
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
    startDate: dayjs('2026-07-08T00:00:00.000'),
    endDate: dayjs('2026-07-10T00:00:00.000'),
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

const CALENDAR_DAYS = buildCalendarDays(dayjs('2026-07-15'), {
  year: 2026,
  month: 6,
  firstDayIndex: 0,
});
const alwaysVisible = () => true;

describe('CalendarDayLayout', () => {
  describe('getMultiDayEvents / week compaction', () => {
    it('compacts a globally-high slot index down to 0 for a week where the lower slots are unoccupied', () => {
      // P and Q both live entirely in the week of June 28 - July 4 and claim
      // global slots 0 and 1 (mutually incompatible types, so neither can
      // share with the other). R is a week later, incompatible with both, so
      // it's forced into a fresh global slot 2 — but in R's OWN week, P and Q
      // have already ended and don't render at all, so R should compact down
      // to slot 0 there.
      const eventP = makeEvent({
        eventID: 'p',
        eventType: 'community-day',
        start: '2026-07-01',
        end: '2026-07-02',
      });
      const eventQ = makeEvent({
        eventID: 'q',
        eventType: 'raid-day',
        start: '2026-07-01',
        end: '2026-07-02',
      });
      const eventR = makeEvent({
        eventID: 'r',
        eventType: 'update',
        start: '2026-07-08',
        end: '2026-07-09',
      });
      const eventMetadata: Record<string, EventMetadata> = {
        p: makeMetadata({ startDate: dayjs('2026-07-01'), endDate: dayjs('2026-07-02') }),
        q: makeMetadata({ startDate: dayjs('2026-07-01'), endDate: dayjs('2026-07-02') }),
        r: makeMetadata({ startDate: dayjs('2026-07-08'), endDate: dayjs('2026-07-09') }),
      };

      const slots = buildEventSlots(
        [eventP, eventQ, eventR],
        eventMetadata,
        CALENDAR_DAYS,
        alwaysVisible,
        0
      );
      const byId = new Map(slots.map((s) => [s.event.eventID, s.slotIndex]));
      // Sanity: confirm the global packing actually pushed R to slot 2.
      expect(byId.get('r')).toBe(2);

      const layout = new CalendarDayLayout(dayjs('2026-07-08'), slots, eventMetadata, 0);
      expect(layout.getEventSlotTop(eventR)).toBe(0);
      expect(layout.getMultiDayEventsHeight()).toBe(1 * (MULTI_DAY_EVENT_BAR_HEIGHT + 1));
    });

    it('excludes major calendar events from rendering even though they occupy a slot', () => {
      const goFest = makeEvent({
        eventID: 'go-fest',
        eventType: 'pokemon-go-fest',
        start: '2026-07-08',
        end: '2026-07-10',
      });
      const eventMetadata = { 'go-fest': makeMetadata() };
      const slots = buildEventSlots([goFest], eventMetadata, CALENDAR_DAYS, alwaysVisible, 0);
      expect(slots).toHaveLength(1);

      const layout = new CalendarDayLayout(dayjs('2026-07-08'), slots, eventMetadata, 0);
      expect(layout.getMultiDayEvents()).toEqual([]);
      expect(layout.getMultiDayEventsHeight()).toBe(0);
    });

    it('returns events for the day sorted by compact slot index', () => {
      const eventA = makeEvent({
        eventID: 'a',
        eventType: 'raid-day',
        start: '2026-07-08',
        end: '2026-07-09',
      });
      const eventB = makeEvent({
        eventID: 'b',
        eventType: 'community-day',
        start: '2026-07-08',
        end: '2026-07-09',
      });
      const eventMetadata: Record<string, EventMetadata> = {
        a: makeMetadata({ startDate: dayjs('2026-07-08'), endDate: dayjs('2026-07-09') }),
        b: makeMetadata({ startDate: dayjs('2026-07-08'), endDate: dayjs('2026-07-09') }),
      };
      const slots = buildEventSlots(
        [eventA, eventB],
        eventMetadata,
        CALENDAR_DAYS,
        alwaysVisible,
        0
      );

      const layout = new CalendarDayLayout(dayjs('2026-07-08'), slots, eventMetadata, 0);
      const events = layout.getMultiDayEvents();
      expect(events).toHaveLength(2);
      // community-day (priority 88) packs first -> compact index 0 -> first in the list.
      expect(events[0].eventID).toBe('b');
    });
  });

  describe('getMultiDayEventsHeight / getEventSlotTop', () => {
    it('computes height as (maxCompactIndex + 1) * (barHeight + margin)', () => {
      const eventA = makeEvent({
        eventID: 'a',
        eventType: 'raid-day',
        start: '2026-07-08',
        end: '2026-07-09',
      });
      const eventB = makeEvent({
        eventID: 'b',
        eventType: 'community-day',
        start: '2026-07-08',
        end: '2026-07-09',
      });
      const eventMetadata: Record<string, EventMetadata> = {
        a: makeMetadata({ startDate: dayjs('2026-07-08'), endDate: dayjs('2026-07-09') }),
        b: makeMetadata({ startDate: dayjs('2026-07-08'), endDate: dayjs('2026-07-09') }),
      };
      const slots = buildEventSlots(
        [eventA, eventB],
        eventMetadata,
        CALENDAR_DAYS,
        alwaysVisible,
        0
      );
      const layout = new CalendarDayLayout(dayjs('2026-07-08'), slots, eventMetadata, 0);

      expect(layout.getMultiDayEventsHeight()).toBe(2 * (MULTI_DAY_EVENT_BAR_HEIGHT + 1));
      expect(layout.getEventSlotTop(eventB)).toBe(0);
      expect(layout.getEventSlotTop(eventA)).toBe(MULTI_DAY_EVENT_BAR_HEIGHT + 1);
    });

    it('returns 0 height when nothing renders this week', () => {
      const layout = new CalendarDayLayout(dayjs('2026-07-08'), [], {}, 0);
      expect(layout.getMultiDayEventsHeight()).toBe(0);
    });

    it('returns 0 top for an event with no compact slot entry', () => {
      const layout = new CalendarDayLayout(dayjs('2026-07-08'), [], {}, 0);
      expect(layout.getEventSlotTop(makeEvent())).toBe(0);
    });
  });

  describe('getMultiDayEventBarClass', () => {
    it('returns single-day-span when the bar starts and ends on the same rendered day', () => {
      const event = makeEvent({ eventID: 'e', start: '2026-07-08', end: '2026-07-08' });
      const eventMetadata = {
        e: makeMetadata({ startDate: dayjs('2026-07-08'), endDate: dayjs('2026-07-08') }),
      };
      const slots = buildEventSlots([event], eventMetadata, CALENDAR_DAYS, alwaysVisible, 0);
      const layout = new CalendarDayLayout(dayjs('2026-07-08'), slots, eventMetadata, 0);

      expect(layout.getMultiDayEventBarClass(event, dayjs('2026-07-08'))).toBe('single-day-span');
    });

    it('returns "start-cap end-cap" when the event starts and ends within the same week', () => {
      const event = makeEvent({ eventID: 'e', start: '2026-07-08', end: '2026-07-10' });
      const eventMetadata = {
        e: makeMetadata({ startDate: dayjs('2026-07-08'), endDate: dayjs('2026-07-10') }),
      };
      const slots = buildEventSlots([event], eventMetadata, CALENDAR_DAYS, alwaysVisible, 0);
      const layout = new CalendarDayLayout(dayjs('2026-07-08'), slots, eventMetadata, 0);

      expect(layout.getMultiDayEventBarClass(event, dayjs('2026-07-08'))).toBe('start-cap end-cap');
    });

    it('returns "week-continue" (no end-cap) for a week-boundary render of an event continuing past this week', () => {
      // Starts before this grid's first week, spans through and beyond it.
      const event = makeEvent({ eventID: 'e', start: '2026-06-20', end: '2026-07-20' });
      const eventMetadata = {
        e: makeMetadata({ startDate: dayjs('2026-06-20'), endDate: dayjs('2026-07-20') }),
      };
      const slots = buildEventSlots([event], eventMetadata, CALENDAR_DAYS, alwaysVisible, 0);
      // 2026-07-05 is a Sunday (firstDayIndex 0) within the event's span, not its start day.
      const layout = new CalendarDayLayout(dayjs('2026-07-05'), slots, eventMetadata, 0);

      expect(layout.getMultiDayEventBarClass(event, dayjs('2026-07-05'))).toBe('week-continue');
    });

    it('returns "week-continue end-cap" when a week-boundary render is also the event\'s final week', () => {
      const event = makeEvent({ eventID: 'e', start: '2026-06-20', end: '2026-07-08' });
      const eventMetadata = {
        e: makeMetadata({ startDate: dayjs('2026-06-20'), endDate: dayjs('2026-07-08') }),
      };
      const slots = buildEventSlots([event], eventMetadata, CALENDAR_DAYS, alwaysVisible, 0);
      const layout = new CalendarDayLayout(dayjs('2026-07-05'), slots, eventMetadata, 0);

      expect(layout.getMultiDayEventBarClass(event, dayjs('2026-07-05'))).toBe(
        'week-continue end-cap'
      );
    });

    it('returns an empty string when the day does not render this bar', () => {
      const event = makeEvent({ eventID: 'e', start: '2026-07-08', end: '2026-07-10' });
      const eventMetadata = {
        e: makeMetadata({ startDate: dayjs('2026-07-08'), endDate: dayjs('2026-07-10') }),
      };
      const slots = buildEventSlots([event], eventMetadata, CALENDAR_DAYS, alwaysVisible, 0);
      const layout = new CalendarDayLayout(dayjs('2026-07-09'), slots, eventMetadata, 0);

      expect(layout.getMultiDayEventBarClass(event, dayjs('2026-07-09'))).toBe('');
    });
  });

  describe('getEventPosition', () => {
    it('returns the full-width fallback when the day does not render this bar', () => {
      const layout = new CalendarDayLayout(dayjs('2026-07-08'), [], {}, 0);
      expect(layout.getEventPosition(makeEvent(), dayjs('2026-07-08'))).toEqual({
        left: '0%',
        width: '100%',
      });
    });

    it("offsets left by the fractional start time on the event's start day", () => {
      const event = makeEvent({
        eventID: 'e',
        start: '2026-07-08T12:00:00.000',
        end: '2026-07-10T00:00:00.000',
      });
      const eventMetadata = {
        e: makeMetadata({
          startDate: dayjs('2026-07-08T12:00:00.000'),
          endDate: dayjs('2026-07-10T00:00:00.000'),
        }),
      };
      const slots = buildEventSlots([event], eventMetadata, CALENDAR_DAYS, alwaysVisible, 0);
      const layout = new CalendarDayLayout(dayjs('2026-07-08'), slots, eventMetadata, 0);

      const position = layout.getEventPosition(event, dayjs('2026-07-08'));
      expect(position.left).toBe('50%'); // noon = 12/24 = 50%
    });

    it('starts at 0% left when continuing from a previous day', () => {
      const event = makeEvent({
        eventID: 'e',
        start: '2026-06-20T12:00:00.000',
        end: '2026-07-20T00:00:00.000',
      });
      const eventMetadata = {
        e: makeMetadata({
          startDate: dayjs('2026-06-20T12:00:00.000'),
          endDate: dayjs('2026-07-20T00:00:00.000'),
        }),
      };
      const slots = buildEventSlots([event], eventMetadata, CALENDAR_DAYS, alwaysVisible, 0);
      const layout = new CalendarDayLayout(dayjs('2026-07-05'), slots, eventMetadata, 0);

      const position = layout.getEventPosition(event, dayjs('2026-07-05'));
      expect(position.left).toBe('0%');
    });

    it('applies a 5% width floor so a bar is never invisible', () => {
      // Event starts at 23:00 and ends the same day at 23:59 — a near-zero width.
      const event = makeEvent({
        eventID: 'e',
        start: '2026-07-08T23:00:00.000',
        end: '2026-07-08T23:59:00.000',
      });
      const eventMetadata = {
        e: makeMetadata({
          startDate: dayjs('2026-07-08T23:00:00.000'),
          endDate: dayjs('2026-07-08T23:59:00.000'),
        }),
      };
      const slots = buildEventSlots([event], eventMetadata, CALENDAR_DAYS, alwaysVisible, 0);
      const layout = new CalendarDayLayout(dayjs('2026-07-08'), slots, eventMetadata, 0);

      const position = layout.getEventPosition(event, dayjs('2026-07-08'));
      expect(position.width).toContain('calc(5%');
    });

    it('applies a 1px gap adjustment for a same-type, same-slot event starting within 2 hours after this one ends', () => {
      const first = makeEvent({
        eventID: 'first',
        eventType: 'raid-day',
        start: '2026-07-08T00:00:00.000',
        end: '2026-07-08T10:00:00.000',
      });
      const second = makeEvent({
        eventID: 'second',
        eventType: 'raid-day',
        start: '2026-07-08T11:00:00.000',
        end: '2026-07-09T00:00:00.000',
      });
      const eventMetadata: Record<string, EventMetadata> = {
        first: makeMetadata({
          startDate: dayjs('2026-07-08T00:00:00.000'),
          endDate: dayjs('2026-07-08T10:00:00.000'),
        }),
        second: makeMetadata({
          startDate: dayjs('2026-07-08T11:00:00.000'),
          endDate: dayjs('2026-07-09T00:00:00.000'),
        }),
      };
      const slots = buildEventSlots(
        [first, second],
        eventMetadata,
        CALENDAR_DAYS,
        alwaysVisible,
        0
      );
      // Same type, non-overlapping -> share a slot (see calendar-grid-slots.util.spec.ts).
      expect(slots[0].slotIndex).toBe(slots[1].slotIndex);

      const layout = new CalendarDayLayout(dayjs('2026-07-08'), slots, eventMetadata, 0);
      const position = layout.getEventPosition(first, dayjs('2026-07-08'));
      expect(position.width).toContain('- 1px');
    });

    it('does not apply the gap adjustment when the following event is more than 2 hours later', () => {
      const first = makeEvent({
        eventID: 'first',
        eventType: 'raid-day',
        start: '2026-07-08T00:00:00.000',
        end: '2026-07-08T10:00:00.000',
      });
      const second = makeEvent({
        eventID: 'second',
        eventType: 'raid-day',
        start: '2026-07-08T15:00:00.000',
        end: '2026-07-09T00:00:00.000',
      });
      const eventMetadata: Record<string, EventMetadata> = {
        first: makeMetadata({
          startDate: dayjs('2026-07-08T00:00:00.000'),
          endDate: dayjs('2026-07-08T10:00:00.000'),
        }),
        second: makeMetadata({
          startDate: dayjs('2026-07-08T15:00:00.000'),
          endDate: dayjs('2026-07-09T00:00:00.000'),
        }),
      };
      const slots = buildEventSlots(
        [first, second],
        eventMetadata,
        CALENDAR_DAYS,
        alwaysVisible,
        0
      );

      const layout = new CalendarDayLayout(dayjs('2026-07-08'), slots, eventMetadata, 0);
      const position = layout.getEventPosition(first, dayjs('2026-07-08'));
      expect(position.width).not.toContain('- 1px');
    });
  });
});
