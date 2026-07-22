import dayjs from 'dayjs';
import { EventMetadata, EventTypeInfoWithoutColor, PogoEvent } from '@go-gather/shared';
import { buildCalendarDays } from './calendar-grid.util';
import {
  EventSlot,
  buildEventSlots,
  hasConflictInSlot,
  shouldShareSlot,
  sortEventsByPriority,
} from './calendar-grid-slots.util';

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Test Event',
    eventType: 'raid-weekend',
    heading: 'Event',
    link: 'https://leekduck.com/events/test/',
    image: 'image.png',
    start: '2026-07-10T00:00:00.000',
    end: '2026-07-12T00:00:00.000',
    ...overrides,
  };
}

function makeMetadata(overrides: Partial<EventMetadata> = {}): EventMetadata {
  const typeInfo: EventTypeInfoWithoutColor = {
    name: 'Test Event Type',
    priority: 50,
    category: 'events-and-misc',
  };
  const startDate = overrides.startDate ?? dayjs('2026-07-10T00:00:00.000');
  const endDate = overrides.endDate ?? dayjs('2026-07-12T00:00:00.000');
  return {
    startDate,
    endDate,
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
const neverVisible = () => false;

describe('sortEventsByPriority', () => {
  it('sorts descending by event-type priority, higher first', () => {
    const low = makeEvent({ eventID: 'low', eventType: 'update' }); // priority 10
    const high = makeEvent({ eventID: 'high', eventType: 'go-battle-league' }); // priority 99
    const mid = makeEvent({ eventID: 'mid', eventType: 'community-day' }); // priority 88

    expect(sortEventsByPriority([low, mid, high]).map((e) => e.eventID)).toEqual([
      'high',
      'mid',
      'low',
    ]);
  });

  it('does not mutate the input array', () => {
    const events = [
      makeEvent({ eventID: 'a', eventType: 'update' }),
      makeEvent({ eventID: 'b', eventType: 'go-battle-league' }),
    ];
    const original = [...events];
    sortEventsByPriority(events);
    expect(events).toEqual(original);
  });
});

describe('shouldShareSlot', () => {
  it('rejects different event types', () => {
    expect(
      shouldShareSlot(
        makeEvent({ eventType: 'raid-day' }),
        makeEvent({ eventType: 'community-day' })
      )
    ).toBe(false);
  });

  it('accepts same event type for non-raid-battles types unconditionally', () => {
    expect(
      shouldShareSlot(
        makeEvent({ eventType: 'raid-day', name: 'Shadow Raid Day' }),
        makeEvent({ eventType: 'raid-day', name: 'Mega Raid Day' })
      )
    ).toBe(true);
  });

  it('for raid-battles, requires matching raid sub-type', () => {
    const shadow = makeEvent({ eventType: 'raid-battles', name: 'Shadow Raid Battles' });
    const shadow2 = makeEvent({ eventType: 'raid-battles', name: 'Another Shadow Raid Battles' });
    const mega = makeEvent({ eventType: 'raid-battles', name: 'Mega Raid Battles' });

    expect(shouldShareSlot(shadow, shadow2)).toBe(true);
    expect(shouldShareSlot(shadow, mega)).toBe(false);
  });
});

describe('hasConflictInSlot', () => {
  it('reports no conflict for compatible, non-overlapping events (back to back)', () => {
    const eventA = makeEvent({
      eventID: 'a',
      eventType: 'raid-day',
      start: '2026-07-01',
      end: '2026-07-02',
    });
    const eventB = makeEvent({
      eventID: 'b',
      eventType: 'raid-day',
      start: '2026-07-03',
      end: '2026-07-04',
    });
    const metadata: Record<string, EventMetadata> = {
      a: makeMetadata({ startDate: dayjs('2026-07-01'), endDate: dayjs('2026-07-02') }),
      b: makeMetadata({ startDate: dayjs('2026-07-03'), endDate: dayjs('2026-07-04') }),
    };
    const slots: EventSlot[] = [
      {
        event: eventA,
        slotIndex: 0,
        startDay: dayjs('2026-07-01'),
        endDay: dayjs('2026-07-02'),
        shouldRenderOnDay: () => true,
      },
    ];

    expect(hasConflictInSlot(eventB, 0, slots, metadata)).toBe(false);
  });

  it('reports a conflict for compatible events that overlap in time', () => {
    const eventA = makeEvent({
      eventID: 'a',
      eventType: 'raid-day',
      start: '2026-07-01',
      end: '2026-07-05',
    });
    const eventB = makeEvent({
      eventID: 'b',
      eventType: 'raid-day',
      start: '2026-07-03',
      end: '2026-07-06',
    });
    const metadata: Record<string, EventMetadata> = {
      a: makeMetadata({ startDate: dayjs('2026-07-01'), endDate: dayjs('2026-07-05') }),
      b: makeMetadata({ startDate: dayjs('2026-07-03'), endDate: dayjs('2026-07-06') }),
    };
    const slots: EventSlot[] = [
      {
        event: eventA,
        slotIndex: 0,
        startDay: dayjs('2026-07-01'),
        endDay: dayjs('2026-07-05'),
        shouldRenderOnDay: () => true,
      },
    ];

    expect(hasConflictInSlot(eventB, 0, slots, metadata)).toBe(true);
  });

  it('reports a conflict for incompatible types that overlap, but not when they do not', () => {
    const eventA = makeEvent({
      eventID: 'a',
      eventType: 'raid-day',
      start: '2026-07-01',
      end: '2026-07-05',
    });
    const overlapping = makeEvent({
      eventID: 'b',
      eventType: 'community-day',
      start: '2026-07-03',
      end: '2026-07-04',
    });
    const sequential = makeEvent({
      eventID: 'c',
      eventType: 'community-day',
      start: '2026-07-06',
      end: '2026-07-07',
    });
    const metadata: Record<string, EventMetadata> = {
      a: makeMetadata({ startDate: dayjs('2026-07-01'), endDate: dayjs('2026-07-05') }),
      b: makeMetadata({ startDate: dayjs('2026-07-03'), endDate: dayjs('2026-07-04') }),
      c: makeMetadata({ startDate: dayjs('2026-07-06'), endDate: dayjs('2026-07-07') }),
    };
    const slots: EventSlot[] = [
      {
        event: eventA,
        slotIndex: 0,
        startDay: dayjs('2026-07-01'),
        endDay: dayjs('2026-07-05'),
        shouldRenderOnDay: () => true,
      },
    ];

    expect(hasConflictInSlot(overlapping, 0, slots, metadata)).toBe(true);
    expect(hasConflictInSlot(sequential, 0, slots, metadata)).toBe(false);
  });
});

describe('buildEventSlots', () => {
  it('excludes single-day events entirely', () => {
    const event = makeEvent({ eventID: 'single' });
    const metadata = { single: makeMetadata({ isSingleDayEvent: true, isMultiDayEvent: false }) };

    expect(buildEventSlots([event], metadata, CALENDAR_DAYS, alwaysVisible, 0)).toEqual([]);
  });

  it('excludes events the filter service says are not visible', () => {
    const event = makeEvent({ eventID: 'hidden' });
    const metadata = { hidden: makeMetadata() };

    expect(buildEventSlots([event], metadata, CALENDAR_DAYS, neverVisible, 0)).toEqual([]);
  });

  it('excludes an event entirely in the past (ended before the grid starts)', () => {
    const event = makeEvent({ eventID: 'past', start: '2020-01-01', end: '2020-01-03' });
    const metadata = {
      past: makeMetadata({ startDate: dayjs('2020-01-01'), endDate: dayjs('2020-01-03') }),
    };

    expect(buildEventSlots([event], metadata, CALENDAR_DAYS, alwaysVisible, 0)).toEqual([]);
  });

  it('still assigns a slot to a far-future event (the 3-clause filter only reliably excludes past events), but it never renders on any day of this grid', () => {
    const event = makeEvent({ eventID: 'far-future', start: '2030-01-01', end: '2030-01-03' });
    const metadata = {
      'far-future': makeMetadata({ startDate: dayjs('2030-01-01'), endDate: dayjs('2030-01-03') }),
    };

    const slots = buildEventSlots([event], metadata, CALENDAR_DAYS, alwaysVisible, 0);
    expect(slots).toHaveLength(1);
    expect(CALENDAR_DAYS.some((day) => slots[0].shouldRenderOnDay(day.dayInstance))).toBe(false);
  });

  it('includes an event that only partially overlaps the visible range at the tail end', () => {
    // Grid is 2026-06-28 .. 2026-08-01. An event starting exactly on the last grid day.
    const event = makeEvent({ eventID: 'edge', start: '2026-08-01', end: '2026-08-03' });
    const metadata = {
      edge: makeMetadata({ startDate: dayjs('2026-08-01'), endDate: dayjs('2026-08-03') }),
    };

    expect(buildEventSlots([event], metadata, CALENDAR_DAYS, alwaysVisible, 0)).toHaveLength(1);
  });

  it('assigns non-overlapping compatible events to the same slot, and overlapping ones to separate slots', () => {
    const eventA = makeEvent({
      eventID: 'a',
      eventType: 'raid-day',
      start: '2026-07-01',
      end: '2026-07-02',
    });
    const eventB = makeEvent({
      eventID: 'b',
      eventType: 'raid-day',
      start: '2026-07-10',
      end: '2026-07-11',
    });
    const eventC = makeEvent({
      eventID: 'c',
      eventType: 'community-day',
      start: '2026-07-01',
      end: '2026-07-02',
    });
    const metadata: Record<string, EventMetadata> = {
      a: makeMetadata({
        startDate: dayjs('2026-07-01'),
        endDate: dayjs('2026-07-02'),
        typeInfo: { name: 'Raid Day', priority: 78, category: 'community-and-raids' },
      }),
      b: makeMetadata({
        startDate: dayjs('2026-07-10'),
        endDate: dayjs('2026-07-11'),
        typeInfo: { name: 'Raid Day', priority: 78, category: 'community-and-raids' },
      }),
      c: makeMetadata({
        startDate: dayjs('2026-07-01'),
        endDate: dayjs('2026-07-02'),
        typeInfo: { name: 'Community Day', priority: 88, category: 'community-and-raids' },
      }),
    };

    const slots = buildEventSlots(
      [eventA, eventB, eventC],
      metadata,
      CALENDAR_DAYS,
      alwaysVisible,
      0
    );
    const byId = new Map(slots.map((s) => [s.event.eventID, s.slotIndex]));

    // a and b: same type, don't overlap in time -> share a slot.
    expect(byId.get('a')).toBe(byId.get('b'));
    // c: higher priority, different type, same dates as a -> gets its own (earlier-claimed) slot.
    expect(byId.get('c')).not.toBe(byId.get('a'));
  });

  it('sorts by priority first, so a higher-priority event claims a low slot index even if added later', () => {
    const lowPriority = makeEvent({
      eventID: 'low',
      eventType: 'update',
      start: '2026-07-01',
      end: '2026-07-05',
    });
    const highPriority = makeEvent({
      eventID: 'high',
      eventType: 'go-battle-league',
      start: '2026-07-01',
      end: '2026-07-05',
    });
    const metadata: Record<string, EventMetadata> = {
      low: makeMetadata({
        startDate: dayjs('2026-07-01'),
        endDate: dayjs('2026-07-05'),
        typeInfo: { name: 'Update', priority: 10, category: 'events-and-misc' },
      }),
      high: makeMetadata({
        startDate: dayjs('2026-07-01'),
        endDate: dayjs('2026-07-05'),
        typeInfo: { name: 'GO Battle League', priority: 99, category: 'seasonal-and-premium' },
      }),
    };

    // Input order deliberately has the lower-priority event first.
    const slots = buildEventSlots(
      [lowPriority, highPriority],
      metadata,
      CALENDAR_DAYS,
      alwaysVisible,
      0
    );
    const high = slots.find((s) => s.event.eventID === 'high');
    const low = slots.find((s) => s.event.eventID === 'low');

    expect(high?.slotIndex).toBe(0);
    expect(low?.slotIndex).toBe(1);
  });

  it('still assigns a slot to a major calendar event, even though it will never render as a bar (that exclusion lives in calendar-day-layout.util.ts)', () => {
    const goFest = makeEvent({
      eventID: 'go-fest',
      eventType: 'pokemon-go-fest',
      start: '2026-07-01',
      end: '2026-07-03',
    });
    const metadata = {
      'go-fest': makeMetadata({
        startDate: dayjs('2026-07-01'),
        endDate: dayjs('2026-07-03'),
        typeInfo: { name: 'GO Fest', priority: 20, category: 'seasonal-and-premium' },
      }),
    };

    const slots = buildEventSlots([goFest], metadata, CALENDAR_DAYS, alwaysVisible, 0);
    expect(slots).toHaveLength(1);
    expect(slots[0].slotIndex).toBe(0);
  });

  it('a major event still consumes a slot index that pushes a co-occurring regular event to the next lane', () => {
    // community-day (real EVENT_TYPES priority 88) outranks pokemon-go-fest
    // (real priority 20) — the sort comparator calls getEventTypeInfo() on
    // the real registry, not this test's metadata, so community-day packs
    // first and claims slot 0; go-fest (different type, so incompatible for
    // sharing) must land in slot 1 — even though the GO Fest bar itself will
    // never actually render (that exclusion is calendar-day-layout.util.ts's
    // job, not this function's).
    const goFest = makeEvent({
      eventID: 'go-fest',
      eventType: 'pokemon-go-fest',
      start: '2026-07-01',
      end: '2026-07-03',
    });
    const communityDay = makeEvent({
      eventID: 'community-day',
      eventType: 'community-day',
      start: '2026-07-01',
      end: '2026-07-02',
    });
    const metadata: Record<string, EventMetadata> = {
      'go-fest': makeMetadata({ startDate: dayjs('2026-07-01'), endDate: dayjs('2026-07-03') }),
      'community-day': makeMetadata({
        startDate: dayjs('2026-07-01'),
        endDate: dayjs('2026-07-02'),
      }),
    };

    const slots = buildEventSlots(
      [communityDay, goFest],
      metadata,
      CALENDAR_DAYS,
      alwaysVisible,
      0
    );
    const byId = new Map(slots.map((s) => [s.event.eventID, s.slotIndex]));

    expect(byId.get('community-day')).toBe(0);
    expect(byId.get('go-fest')).toBe(1);
  });
});

describe('buildEventSlots — sort tiebreakers', () => {
  it('returns an empty array when the calendar grid itself is empty', () => {
    expect(
      buildEventSlots([makeEvent()], { 'event-1': makeMetadata() }, [], alwaysVisible, 0)
    ).toEqual([]);
  });

  it('breaks a same-priority raid-battles tie by raid sub-type priority', () => {
    const shadow = makeEvent({
      eventID: 'shadow',
      eventType: 'raid-battles',
      name: 'Shadow Raid Battles',
      start: '2026-07-01',
      end: '2026-07-05',
    });
    const mega = makeEvent({
      eventID: 'mega',
      eventType: 'raid-battles',
      name: 'Mega Raid Battles',
      start: '2026-07-01',
      end: '2026-07-05',
    });
    const metadata: Record<string, EventMetadata> = {
      shadow: makeMetadata({ startDate: dayjs('2026-07-01'), endDate: dayjs('2026-07-05') }),
      mega: makeMetadata({ startDate: dayjs('2026-07-01'), endDate: dayjs('2026-07-05') }),
    };

    // Both same eventType/priority, overlapping in time -> can't share a
    // slot (shadow !== mega sub-type); shadow (sub-priority 3) must be
    // processed/packed before mega (sub-priority 1) and claim slot 0.
    const slots = buildEventSlots([mega, shadow], metadata, CALENDAR_DAYS, alwaysVisible, 0);
    const byId = new Map(slots.map((s) => [s.event.eventID, s.slotIndex]));
    expect(byId.get('shadow')).toBe(0);
    expect(byId.get('mega')).toBe(1);
  });

  it('falls through to a stable tie (return 0) when priority, sub-type, and start date are all equal — packed into separate slots since they fully overlap in time', () => {
    const eventA = makeEvent({
      eventID: 'a',
      eventType: 'update',
      start: '2026-07-01',
      end: '2026-07-05',
    });
    const eventB = makeEvent({
      eventID: 'b',
      eventType: 'update',
      start: '2026-07-01',
      end: '2026-07-05',
    });
    const metadata: Record<string, EventMetadata> = {
      a: makeMetadata({ startDate: dayjs('2026-07-01'), endDate: dayjs('2026-07-05') }),
      b: makeMetadata({ startDate: dayjs('2026-07-01'), endDate: dayjs('2026-07-05') }),
    };

    // Identical in every sort key (exercises the sort comparator's final
    // `return 0` tie branch) — but same-type compatibility only avoids a
    // conflict when events DON'T overlap in time (see hasConflictInSlot),
    // and these two occupy the exact same window, so they still land in
    // separate slots.
    const slots = buildEventSlots([eventA, eventB], metadata, CALENDAR_DAYS, alwaysVisible, 0);
    expect(slots.map((s) => s.slotIndex).sort()).toEqual([0, 1]);
  });
});

describe('EventSlot.shouldRenderOnDay', () => {
  it('renders on the event start day', () => {
    const event = makeEvent({ eventID: 'e', start: '2026-07-08', end: '2026-07-15' });
    const metadata = {
      e: makeMetadata({ startDate: dayjs('2026-07-08'), endDate: dayjs('2026-07-15') }),
    };

    const [slot] = buildEventSlots([event], metadata, CALENDAR_DAYS, alwaysVisible, 0);
    expect(slot.shouldRenderOnDay(dayjs('2026-07-08'))).toBe(true);
  });

  it('renders on the first day of a subsequent week the event is still ongoing in', () => {
    const event = makeEvent({ eventID: 'e', start: '2026-07-08', end: '2026-07-15' });
    const metadata = {
      e: makeMetadata({ startDate: dayjs('2026-07-08'), endDate: dayjs('2026-07-15') }),
    };

    const [slot] = buildEventSlots([event], metadata, CALENDAR_DAYS, alwaysVisible, 0);
    // firstDayIndex 0 (Sunday); 2026-07-12 is the Sunday following the 07-08 start.
    expect(dayjs('2026-07-12').day()).toBe(0);
    expect(slot.shouldRenderOnDay(dayjs('2026-07-12'))).toBe(true);
  });

  it('does not render on a mid-week day that is neither the start day nor a week boundary', () => {
    const event = makeEvent({ eventID: 'e', start: '2026-07-08', end: '2026-07-15' });
    const metadata = {
      e: makeMetadata({ startDate: dayjs('2026-07-08'), endDate: dayjs('2026-07-15') }),
    };

    const [slot] = buildEventSlots([event], metadata, CALENDAR_DAYS, alwaysVisible, 0);
    expect(slot.shouldRenderOnDay(dayjs('2026-07-09'))).toBe(false);
  });

  it('does not render past the event end day', () => {
    const event = makeEvent({ eventID: 'e', start: '2026-07-08', end: '2026-07-10' });
    const metadata = {
      e: makeMetadata({ startDate: dayjs('2026-07-08'), endDate: dayjs('2026-07-10') }),
    };

    const [slot] = buildEventSlots([event], metadata, CALENDAR_DAYS, alwaysVisible, 0);
    expect(slot.shouldRenderOnDay(dayjs('2026-07-13'))).toBe(false);
  });
});
