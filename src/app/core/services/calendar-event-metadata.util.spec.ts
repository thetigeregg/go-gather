import dayjs from 'dayjs';
import type { PogoEvent } from '@go-gather/shared';
import { buildEventMetadata } from './calendar-event-metadata.util';

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'community-day-january-2026',
    name: 'Pokemon Community Day: Bulbasaur',
    eventType: 'community-day',
    heading: 'Community Day',
    link: 'https://leekduck.com/events/community-day-january-2026/',
    image: 'https://example.com/community-day.png',
    start: '2026-01-11T14:00:00.000',
    end: '2026-01-11T17:00:00.000',
    ...overrides,
  };
}

describe('buildEventMetadata', () => {
  it('computes display name, type info, color, and formatted start time', () => {
    const now = dayjs('2026-01-01T00:00:00.000');
    const metadata = buildEventMetadata(makeEvent(), now);

    expect(metadata.displayName).toBe('Community Day: Bulbasaur');
    expect(metadata.typeInfo).toEqual({
      name: 'Community Day',
      priority: 88,
      category: 'community-and-raids',
    });
    expect(metadata.color).toBe('#1660a9');
    expect(metadata.formattedStartTime).toBe('2pm');
  });

  it('flags a same-day event as single-day', () => {
    const now = dayjs('2026-01-01T00:00:00.000');
    const metadata = buildEventMetadata(makeEvent(), now);

    expect(metadata.isSingleDayEvent).toBe(true);
    expect(metadata.isMultiDayEvent).toBe(false);
  });

  it('flags a multi-day event correctly', () => {
    const now = dayjs('2026-01-01T00:00:00.000');
    const metadata = buildEventMetadata(
      makeEvent({ start: '2026-01-11T00:00:00.000', end: '2026-01-13T23:59:59.000' }),
      now
    );

    expect(metadata.isMultiDayEvent).toBe(true);
    expect(metadata.isSingleDayEvent).toBe(false);
  });

  it('flags an event that has already ended as past', () => {
    const now = dayjs('2026-02-01T00:00:00.000');
    const metadata = buildEventMetadata(makeEvent(), now);

    expect(metadata.isPastEvent).toBe(true);
    expect(metadata.isFutureEvent).toBe(false);
  });

  it('flags an event that has not started yet as future', () => {
    const now = dayjs('2025-12-01T00:00:00.000');
    const metadata = buildEventMetadata(makeEvent(), now);

    expect(metadata.isFutureEvent).toBe(true);
    expect(metadata.isPastEvent).toBe(false);
  });

  it('falls back gracefully for an unrecognized event type', () => {
    const now = dayjs('2026-01-01T00:00:00.000');
    const metadata = buildEventMetadata(makeEvent({ eventType: 'some-new-event-type' }), now);

    expect(metadata.typeInfo.name).toBe('Some New Event Type');
    expect(metadata.color).toBe('#666666');
  });
});
