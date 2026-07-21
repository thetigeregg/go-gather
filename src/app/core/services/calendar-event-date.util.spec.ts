import { formatEventTime, parseEventDate } from './calendar-event-date.util';

describe('parseEventDate', () => {
  it('parses a UTC (Z-suffixed) date string and converts it to local time', () => {
    const parsed = parseEventDate('2026-01-11T14:00:00.000Z');
    expect(parsed.isValid()).toBe(true);
    expect(parsed.toISOString()).toBe('2026-01-11T14:00:00.000Z');
  });

  it('treats a non-Z date string as local time (no UTC conversion)', () => {
    const parsed = parseEventDate('2026-01-11T14:00:00.000');
    expect(parsed.isValid()).toBe(true);
    expect(parsed.hour()).toBe(14);
  });
});

describe('formatEventTime', () => {
  it('omits minutes when they are zero', () => {
    expect(formatEventTime('2026-01-11T14:00:00.000')).toBe('2pm');
  });

  it('includes minutes when non-zero', () => {
    expect(formatEventTime('2026-01-11T14:30:00.000')).toBe('2:30pm');
  });
});
