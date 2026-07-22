import dayjs from 'dayjs';
import { EventMetadata, EventTypeInfoWithoutColor, PogoEvent } from '@go-gather/shared';
import {
  getDailySingleDayEvents,
  getSourceEventID,
  isDailyMajorDisplayEvent,
} from './calendar-single-day-events.util';

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Test Event',
    eventType: 'community-day',
    heading: 'Event',
    link: 'https://leekduck.com/events/test/',
    image: 'image.png',
    start: '2026-07-08T00:00:00.000',
    end: '2026-07-08T23:59:59.000',
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
    endDate: dayjs('2026-07-08T23:59:59.000'),
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
const neverVisible = () => false;

describe('getDailySingleDayEvents — day containment', () => {
  it('includes an event whose day-range contains the target day', () => {
    const event = makeEvent({ eventID: 'e', start: '2026-07-08', end: '2026-07-08' });
    const metadata = { e: makeMetadata() };

    const result = getDailySingleDayEvents([event], metadata, dayjs('2026-07-08'), alwaysVisible);
    expect(result.map((e) => e.eventID)).toEqual(['e']);
  });

  it('excludes an event whose day-range does not contain the target day', () => {
    const event = makeEvent({ eventID: 'e', start: '2026-07-08', end: '2026-07-08' });
    const metadata = { e: makeMetadata() };

    expect(getDailySingleDayEvents([event], metadata, dayjs('2026-07-09'), alwaysVisible)).toEqual(
      []
    );
  });

  it('is inclusive at the exact start and end date boundaries', () => {
    const event = makeEvent({ eventID: 'e', start: '2026-07-08', end: '2026-07-08' });
    const metadata = {
      e: makeMetadata({
        isMultiDayEvent: false,
        isSingleDayEvent: true,
        startDate: dayjs('2026-07-08'),
        endDate: dayjs('2026-07-08'),
      }),
    };
    expect(
      getDailySingleDayEvents([event], metadata, dayjs('2026-07-08'), alwaysVisible)
    ).toHaveLength(1);
  });
});

describe('getDailySingleDayEvents — visibility gate', () => {
  it('excludes an individually-hidden or type-disabled single-day event', () => {
    const event = makeEvent({ eventID: 'e' });
    const metadata = { e: makeMetadata() };

    expect(getDailySingleDayEvents([event], metadata, dayjs('2026-07-08'), neverVisible)).toEqual(
      []
    );
  });

  it('excludes a filtered-out major event from the daily-projection branch too (shared gate)', () => {
    const event = makeEvent({
      eventID: 'go-fest',
      eventType: 'pokemon-go-fest',
      start: '2026-07-01',
      end: '2026-07-10',
    });
    const metadata = {
      'go-fest': makeMetadata({
        isMultiDayEvent: true,
        isSingleDayEvent: false,
        startDate: dayjs('2026-07-01'),
        endDate: dayjs('2026-07-10'),
      }),
    };

    expect(getDailySingleDayEvents([event], metadata, dayjs('2026-07-08'), neverVisible)).toEqual(
      []
    );
  });
});

describe('getDailySingleDayEvents — single-day vs. multi-day split', () => {
  it('excludes a non-major multi-day event entirely (neither single-day list nor daily projection)', () => {
    const event = makeEvent({
      eventID: 'e',
      eventType: 'raid-weekend',
      start: '2026-07-08',
      end: '2026-07-10',
    });
    const metadata = {
      e: makeMetadata({
        isMultiDayEvent: true,
        isSingleDayEvent: false,
        startDate: dayjs('2026-07-08'),
        endDate: dayjs('2026-07-10'),
      }),
    };

    expect(getDailySingleDayEvents([event], metadata, dayjs('2026-07-08'), alwaysVisible)).toEqual(
      []
    );
  });

  it('sorts the single-day list by event-type priority (higher first)', () => {
    const low = makeEvent({ eventID: 'low', eventType: 'update' });
    const high = makeEvent({ eventID: 'high', eventType: 'go-battle-league' });
    const metadata = { low: makeMetadata(), high: makeMetadata() };

    const result = getDailySingleDayEvents(
      [low, high],
      metadata,
      dayjs('2026-07-08'),
      alwaysVisible
    );
    expect(result.map((e) => e.eventID)).toEqual(['high', 'low']);
  });
});

describe('getDailySingleDayEvents — major-event daily projection', () => {
  it('projects an ongoing major event onto the day with the exact synthetic ID scheme', () => {
    const event = makeEvent({
      eventID: 'go-fest-2026',
      eventType: 'pokemon-go-fest',
      name: 'GO Fest 2026',
      start: '2026-07-01',
      end: '2026-07-10',
    });
    const metadata = {
      'go-fest-2026': makeMetadata({
        isMultiDayEvent: true,
        isSingleDayEvent: false,
        startDate: dayjs('2026-07-01'),
        endDate: dayjs('2026-07-10'),
      }),
    };

    const [projection] = getDailySingleDayEvents(
      [event],
      metadata,
      dayjs('2026-07-05'),
      alwaysVisible
    );
    expect(projection.eventID).toBe('go-fest-2026-daily-2026-07-05');
    expect(projection.name).toBe('GO Fest 2026');
    expect(isDailyMajorDisplayEvent(projection)).toBe(true);
    expect(getSourceEventID(projection)).toBe('go-fest-2026');
  });

  it('does not project a major event on a day outside its span', () => {
    const event = makeEvent({
      eventID: 'go-fest-2026',
      eventType: 'pokemon-go-fest',
      start: '2026-07-01',
      end: '2026-07-03',
    });
    const metadata = {
      'go-fest-2026': makeMetadata({
        isMultiDayEvent: true,
        isSingleDayEvent: false,
        startDate: dayjs('2026-07-01'),
        endDate: dayjs('2026-07-03'),
      }),
    };

    expect(getDailySingleDayEvents([event], metadata, dayjs('2026-07-10'), alwaysVisible)).toEqual(
      []
    );
  });

  it('does not project a single-day major-type event (isMultiDayEvent must be true)', () => {
    const event = makeEvent({ eventID: 'wild-area-day', eventType: 'wild-area' });
    const metadata = {
      'wild-area-day': makeMetadata({ isMultiDayEvent: false, isSingleDayEvent: true }),
    };

    // Single-day, so it goes through the ordinary single-day branch instead —
    // not projected, and not duplicated.
    const result = getDailySingleDayEvents([event], metadata, dayjs('2026-07-08'), alwaysVisible);
    expect(result).toHaveLength(1);
    expect(isDailyMajorDisplayEvent(result[0])).toBe(false);
  });

  it('places individual single-day events before major-daily projections', () => {
    const single = makeEvent({ eventID: 'single', eventType: 'community-day' });
    const major = makeEvent({
      eventID: 'go-fest',
      eventType: 'pokemon-go-fest',
      start: '2026-07-01',
      end: '2026-07-10',
    });
    const metadata = {
      single: makeMetadata(),
      'go-fest': makeMetadata({
        isMultiDayEvent: true,
        isSingleDayEvent: false,
        startDate: dayjs('2026-07-01'),
        endDate: dayjs('2026-07-10'),
      }),
    };

    const result = getDailySingleDayEvents(
      [major, single],
      metadata,
      dayjs('2026-07-08'),
      alwaysVisible
    );
    expect(result.map((e) => e.eventID)).toEqual(['single', 'go-fest-daily-2026-07-08']);
  });
});

describe('getSourceEventID', () => {
  it('returns the plain eventID for a non-projected event', () => {
    expect(getSourceEventID(makeEvent({ eventID: 'plain' }))).toBe('plain');
  });
});
