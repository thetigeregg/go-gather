import dayjs from 'dayjs';
import { EventMetadata, EventTypeInfoWithoutColor, PogoEvent } from '@go-gather/shared';
import { buildTimelineData, sortEventsByTimingAndPriority } from './timeline-categories.util';

const NOW = dayjs('2026-07-08T12:00:00.000'); // Wednesday noon

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Test Event',
    eventType: 'raid-day',
    heading: 'Event',
    link: 'https://leekduck.com/events/test/',
    image: 'image.png',
    start: '2026-07-08T00:00:00.000',
    end: '2026-07-08T23:59:59.999',
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
    endDate: dayjs('2026-07-08T23:59:59.999'),
    isMultiDayEvent: false,
    isSingleDayEvent: true,
    isPastEvent: false,
    isFutureEvent: false,
    typeInfo,
    color: '#123456',
    formattedStartTime: '12am',
    displayName: 'Test Event',
    ...overrides,
  };
}

const alwaysVisible = () => true;

describe('sortEventsByTimingAndPriority', () => {
  it('sorts currently-happening events before future events, regardless of input order', () => {
    const happening = makeEvent({ eventID: 'happening' });
    const future = makeEvent({ eventID: 'future' });
    const eventMetadata: Record<string, EventMetadata> = {
      happening: makeMetadata({ isPastEvent: false, isFutureEvent: false }),
      future: makeMetadata({ isPastEvent: false, isFutureEvent: true }),
    };

    expect(
      sortEventsByTimingAndPriority([future, happening], eventMetadata).map((e) => e.eventID)
    ).toEqual(['happening', 'future']);
    expect(
      sortEventsByTimingAndPriority([happening, future], eventMetadata).map((e) => e.eventID)
    ).toEqual(['happening', 'future']);
  });

  it('sorts currently-happening events by soonest-ending first', () => {
    const endsSoon = makeEvent({ eventID: 'ends-soon', eventType: 'raid-day' });
    const endsLater = makeEvent({ eventID: 'ends-later', eventType: 'community-day' });
    const eventMetadata: Record<string, EventMetadata> = {
      'ends-soon': makeMetadata({ endDate: dayjs('2026-07-08T14:00:00.000') }),
      'ends-later': makeMetadata({ endDate: dayjs('2026-07-08T20:00:00.000') }),
    };

    const sorted = sortEventsByTimingAndPriority([endsLater, endsSoon], eventMetadata);

    expect(sorted.map((e) => e.eventID)).toEqual(['ends-soon', 'ends-later']);
  });

  it('breaks a happening-events end-time tie by higher type priority first', () => {
    const lowPriority = makeEvent({ eventID: 'low', eventType: 'raid-day' }); // priority 78
    const highPriority = makeEvent({ eventID: 'high', eventType: 'community-day' }); // priority 88
    const sameEnd = dayjs('2026-07-08T20:00:00.000');
    const eventMetadata: Record<string, EventMetadata> = {
      low: makeMetadata({ endDate: sameEnd }),
      high: makeMetadata({ endDate: sameEnd }),
    };

    const sorted = sortEventsByTimingAndPriority([lowPriority, highPriority], eventMetadata);

    expect(sorted.map((e) => e.eventID)).toEqual(['high', 'low']);
  });

  it('sorts future events by soonest-starting first', () => {
    const startsSoon = makeEvent({ eventID: 'starts-soon' });
    const startsLater = makeEvent({ eventID: 'starts-later' });
    const eventMetadata: Record<string, EventMetadata> = {
      'starts-soon': makeMetadata({
        startDate: dayjs('2026-07-09'),
        isFutureEvent: true,
      }),
      'starts-later': makeMetadata({
        startDate: dayjs('2026-07-15'),
        isFutureEvent: true,
      }),
    };

    const sorted = sortEventsByTimingAndPriority([startsLater, startsSoon], eventMetadata);

    expect(sorted.map((e) => e.eventID)).toEqual(['starts-soon', 'starts-later']);
  });

  it('breaks a future-events start-time tie by higher type priority first', () => {
    const lowPriority = makeEvent({ eventID: 'low', eventType: 'raid-day' });
    const highPriority = makeEvent({ eventID: 'high', eventType: 'community-day' });
    const sameStart = dayjs('2026-07-09');
    const eventMetadata: Record<string, EventMetadata> = {
      low: makeMetadata({ startDate: sameStart, isFutureEvent: true }),
      high: makeMetadata({ startDate: sameStart, isFutureEvent: true }),
    };

    const sorted = sortEventsByTimingAndPriority([lowPriority, highPriority], eventMetadata);

    expect(sorted.map((e) => e.eventID)).toEqual(['high', 'low']);
  });
});

describe('buildTimelineData categorization', () => {
  it('categorizes a single-day event starting and ending today as TODAY', () => {
    const event = makeEvent({ eventID: 'today-event' });
    const eventMetadata = { 'today-event': makeMetadata() };

    const result = buildTimelineData([event], eventMetadata, NOW, alwaysVisible, false);

    expect(result.categorizedEvents.today.map((e) => e.eventID)).toEqual(['today-event']);
    expect(result.totalEventsCounts.today).toBe(1);
  });

  it('categorizes a multi-day event starting today as ONGOING', () => {
    const event = makeEvent({
      eventID: 'starts-today',
      start: '2026-07-08T00:00:00.000',
      end: '2026-07-10T00:00:00.000',
    });
    const eventMetadata = {
      'starts-today': makeMetadata({
        startDate: dayjs('2026-07-08'),
        endDate: dayjs('2026-07-10'),
        isSingleDayEvent: false,
        isMultiDayEvent: true,
      }),
    };

    const result = buildTimelineData([event], eventMetadata, NOW, alwaysVisible, false);

    expect(result.categorizedEvents.ongoing.map((e) => e.eventID)).toEqual(['starts-today']);
  });

  it('categorizes a currently-in-progress event (started before today) as ONGOING', () => {
    const event = makeEvent({
      eventID: 'in-progress',
      start: '2026-07-05T00:00:00.000',
      end: '2026-07-10T00:00:00.000',
    });
    const eventMetadata = {
      'in-progress': makeMetadata({
        startDate: dayjs('2026-07-05'),
        endDate: dayjs('2026-07-10'),
        isSingleDayEvent: false,
        isMultiDayEvent: true,
      }),
    };

    const result = buildTimelineData([event], eventMetadata, NOW, alwaysVisible, false);

    expect(result.categorizedEvents.ongoing.map((e) => e.eventID)).toEqual(['in-progress']);
  });

  it('categorizes an event starting tomorrow (within 2 weeks) as UPCOMING', () => {
    const event = makeEvent({
      eventID: 'tomorrow',
      start: '2026-07-09T00:00:00.000',
      end: '2026-07-09T23:59:59.999',
    });
    const eventMetadata = {
      tomorrow: makeMetadata({
        startDate: dayjs('2026-07-09'),
        endDate: dayjs('2026-07-09T23:59:59.999'),
      }),
    };

    const result = buildTimelineData([event], eventMetadata, NOW, alwaysVisible, false);

    expect(result.categorizedEvents.upcoming.map((e) => e.eventID)).toEqual(['tomorrow']);
  });

  it('categorizes an event starting more than 2 weeks out as FUTURE', () => {
    const event = makeEvent({
      eventID: 'far-out',
      start: '2026-08-01T00:00:00.000',
      end: '2026-08-01T23:59:59.999',
    });
    const eventMetadata = {
      'far-out': makeMetadata({
        startDate: dayjs('2026-08-01'),
        endDate: dayjs('2026-08-01T23:59:59.999'),
      }),
    };

    const result = buildTimelineData([event], eventMetadata, NOW, alwaysVisible, false);

    expect(result.categorizedEvents.future.map((e) => e.eventID)).toEqual(['far-out']);
  });

  it('silently skips a past event that is still inside the window — not categorized, not counted', () => {
    // Ended yesterday (still passes the [now-1day, now+60days] window filter,
    // since endDate is after windowStart) but doesn't match TODAY (started
    // yesterday, not today) or ONGOING (already ended before "now").
    const event = makeEvent({
      eventID: 'past',
      start: '2026-07-07T08:00:00.000',
      end: '2026-07-07T20:00:00.000',
    });
    const eventMetadata = {
      past: makeMetadata({
        startDate: dayjs('2026-07-07T08:00:00.000'),
        endDate: dayjs('2026-07-07T20:00:00.000'),
      }),
    };

    const result = buildTimelineData([event], eventMetadata, NOW, alwaysVisible, false);

    expect(Object.values(result.categorizedEvents).every((list) => list.length === 0)).toBe(true);
    expect(Object.values(result.totalEventsCounts).every((count) => count === 0)).toBe(true);
    expect(result.hasAnyEvents).toBe(false);
  });

  it('excludes an event that ended before the window (does not even reach categorization)', () => {
    const event = makeEvent({
      eventID: 'long-past',
      start: '2026-07-01T00:00:00.000',
      end: '2026-07-02T00:00:00.000',
    });
    const eventMetadata = {
      'long-past': makeMetadata({ startDate: dayjs('2026-07-01'), endDate: dayjs('2026-07-02') }),
    };

    const result = buildTimelineData([event], eventMetadata, NOW, alwaysVisible, false);

    expect(result.hasAnyEvents).toBe(false);
  });

  it('excludes an event entirely outside the [now-1day, now+60days] window before categorization', () => {
    const event = makeEvent({
      eventID: 'far-future',
      start: '2027-01-01T00:00:00.000',
      end: '2027-01-02T00:00:00.000',
    });
    const eventMetadata = {
      'far-future': makeMetadata({
        startDate: dayjs('2027-01-01'),
        endDate: dayjs('2027-01-02'),
        isFutureEvent: true,
      }),
    };

    const result = buildTimelineData([event], eventMetadata, NOW, alwaysVisible, false);

    expect(result.hasAnyEvents).toBe(false);
  });
});

describe('buildTimelineData filter gating', () => {
  it('does not hide or count anything when filtersApplyToTimeline is false, even for an individually-hidden event', () => {
    const event = makeEvent({ eventID: 'hidden-event', eventType: 'go-pass' });
    const eventMetadata = { 'hidden-event': makeMetadata() };
    const isEventVisible = () => false; // simulates a type-disabled AND individually-hidden event

    const result = buildTimelineData([event], eventMetadata, NOW, isEventVisible, false);

    expect(result.categorizedEvents.today.map((e) => e.eventID)).toEqual(['hidden-event']);
    expect(result.hiddenEventsCounts.today).toBe(0);
    expect(result.totalEventsCounts.today).toBe(1);
  });

  it('hides and counts a non-visible event when filtersApplyToTimeline is true', () => {
    const event = makeEvent({ eventID: 'hidden-event', eventType: 'go-pass' });
    const eventMetadata = { 'hidden-event': makeMetadata() };
    const isEventVisible = () => false;

    const result = buildTimelineData([event], eventMetadata, NOW, isEventVisible, true);

    expect(result.categorizedEvents.today).toEqual([]);
    expect(result.hiddenEventsCounts.today).toBe(1);
    expect(result.totalEventsCounts.today).toBe(1);
  });
});

describe('buildTimelineData day-grouping', () => {
  it('groups UPCOMING and FUTURE events by date, sorted by date key', () => {
    const later = makeEvent({
      eventID: 'later',
      start: '2026-08-01T00:00:00.000',
      end: '2026-08-01T23:59:59.999',
    });
    const sooner = makeEvent({
      eventID: 'sooner',
      start: '2026-07-10T00:00:00.000',
      end: '2026-07-10T23:59:59.999',
    });
    const eventMetadata: Record<string, EventMetadata> = {
      later: makeMetadata({
        startDate: dayjs('2026-08-01'),
        endDate: dayjs('2026-08-01T23:59:59.999'),
      }),
      sooner: makeMetadata({
        startDate: dayjs('2026-07-10'),
        endDate: dayjs('2026-07-10T23:59:59.999'),
      }),
    };

    const result = buildTimelineData([later, sooner], eventMetadata, NOW, alwaysVisible, false);

    expect(result.groupedByDate.upcoming?.map((g) => g.dateKey)).toEqual(['2026-07-10']);
    expect(result.groupedByDate.future?.map((g) => g.dateKey)).toEqual(['2026-08-01']);
    expect(result.groupedByDate.upcoming?.[0].dayOfWeek).toBe('FRIDAY');
    expect(result.groupedByDate.upcoming?.[0].dateStr).toBe('Jul 10, 2026');
  });

  it('groups multiple distinct dates within the same category, in ascending date order', () => {
    const later = makeEvent({
      eventID: 'later',
      start: '2026-07-15T00:00:00.000',
      end: '2026-07-15T23:59:59.999',
    });
    const earlier = makeEvent({
      eventID: 'earlier',
      start: '2026-07-09T00:00:00.000',
      end: '2026-07-09T23:59:59.999',
    });
    const eventMetadata: Record<string, EventMetadata> = {
      later: makeMetadata({
        startDate: dayjs('2026-07-15'),
        endDate: dayjs('2026-07-15T23:59:59.999'),
      }),
      earlier: makeMetadata({
        startDate: dayjs('2026-07-09'),
        endDate: dayjs('2026-07-09T23:59:59.999'),
      }),
    };

    const result = buildTimelineData([later, earlier], eventMetadata, NOW, alwaysVisible, false);

    expect(result.groupedByDate.upcoming?.map((g) => g.dateKey)).toEqual([
      '2026-07-09',
      '2026-07-15',
    ]);
  });

  it('groups multiple events on the same date into one TimelineDateGroup', () => {
    const first = makeEvent({
      eventID: 'first',
      start: '2026-07-10T08:00:00.000',
      end: '2026-07-10T09:00:00.000',
    });
    const second = makeEvent({
      eventID: 'second',
      start: '2026-07-10T14:00:00.000',
      end: '2026-07-10T15:00:00.000',
    });
    const eventMetadata: Record<string, EventMetadata> = {
      first: makeMetadata({
        startDate: dayjs('2026-07-10T08:00:00.000'),
        endDate: dayjs('2026-07-10T09:00:00.000'),
      }),
      second: makeMetadata({
        startDate: dayjs('2026-07-10T14:00:00.000'),
        endDate: dayjs('2026-07-10T15:00:00.000'),
      }),
    };

    const result = buildTimelineData([first, second], eventMetadata, NOW, alwaysVisible, false);

    expect(result.groupedByDate.upcoming).toHaveLength(1);
    expect(result.groupedByDate.upcoming?.[0].events.map((e) => e.eventID).sort()).toEqual([
      'first',
      'second',
    ]);
  });

  it('does not day-group TODAY or ONGOING categories', () => {
    const event = makeEvent({ eventID: 'today-event' });
    const eventMetadata = { 'today-event': makeMetadata() };

    const result = buildTimelineData([event], eventMetadata, NOW, alwaysVisible, false);

    expect(result.groupedByDate.today).toBeUndefined();
    expect(result.groupedByDate.ongoing).toBeUndefined();
  });
});

describe('buildTimelineData hasAnyEvents', () => {
  it('is true when any category has events, including hidden-by-filter ones', () => {
    const event = makeEvent({ eventID: 'hidden-event', eventType: 'go-pass' });
    const eventMetadata = { 'hidden-event': makeMetadata() };

    const result = buildTimelineData([event], eventMetadata, NOW, () => false, true);

    expect(result.categorizedEvents.today).toEqual([]);
    expect(result.hasAnyEvents).toBe(true);
  });

  it('is false when the timeline window contains no events at all', () => {
    const result = buildTimelineData([], {}, NOW, alwaysVisible, false);

    expect(result.hasAnyEvents).toBe(false);
  });
});
