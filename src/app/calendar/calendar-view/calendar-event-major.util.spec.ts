import { PogoEvent } from '@go-gather/shared';
import {
  getMajorCalendarEventVariant,
  isMajorCalendarEventType,
} from './calendar-event-major.util';

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'GO Fest 2026',
    eventType: 'pokemon-go-fest',
    heading: 'Event',
    link: 'https://leekduck.com/events/go-fest-2026/',
    image: 'image.png',
    start: '2026-07-01T00:00:00.000Z',
    end: '2026-07-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('isMajorCalendarEventType', () => {
  it('recognizes the three major event types', () => {
    expect(isMajorCalendarEventType('pokemon-go-fest')).toBe(true);
    expect(isMajorCalendarEventType('pokemon-go-tour')).toBe(true);
    expect(isMajorCalendarEventType('wild-area')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isMajorCalendarEventType('community-day')).toBe(false);
    expect(isMajorCalendarEventType('raid-battles')).toBe(false);
  });
});

describe('getMajorCalendarEventVariant', () => {
  it('returns location-specific for non-major event types regardless of name/link', () => {
    expect(
      getMajorCalendarEventVariant(makeEvent({ eventType: 'community-day', name: 'Global thing' }))
    ).toBe('location-specific');
  });

  it('returns global when eventID/name/link contains "global" (case-insensitive)', () => {
    expect(getMajorCalendarEventVariant(makeEvent({ name: 'GO Fest 2026: Global' }))).toBe(
      'global'
    );
    expect(getMajorCalendarEventVariant(makeEvent({ eventID: 'go-fest-GLOBAL-2026' }))).toBe(
      'global'
    );
    expect(getMajorCalendarEventVariant(makeEvent({ link: 'https://leekduck.com/global/' }))).toBe(
      'global'
    );
  });

  it('returns location-specific for a major event with no "global" substring', () => {
    expect(getMajorCalendarEventVariant(makeEvent({ name: 'GO Fest 2026: New York City' }))).toBe(
      'location-specific'
    );
  });
});
