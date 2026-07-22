import dayjs from 'dayjs';
import {
  buildEventStatusInfo,
  buildTimeDisplayParts,
  formatSingleDayTimes,
} from './timeline-event-time-display.util';

describe('formatSingleDayTimes', () => {
  it('omits AM/PM from the start time when both times share the same period', () => {
    const result = formatSingleDayTimes(
      dayjs('2026-07-08T18:00:00.000'),
      dayjs('2026-07-08T19:00:00.000')
    );
    expect(result).toEqual({ startTime: '6', endTime: '7pm' });
  });

  it('keeps AM/PM on both times when the periods differ', () => {
    const result = formatSingleDayTimes(
      dayjs('2026-07-08T11:00:00.000'),
      dayjs('2026-07-08T13:00:00.000')
    );
    expect(result).toEqual({ startTime: '11am', endTime: '1pm' });
  });

  it('formats non-zero minutes with the :mm suffix', () => {
    const result = formatSingleDayTimes(
      dayjs('2026-07-08T18:30:00.000'),
      dayjs('2026-07-08T19:45:00.000')
    );
    expect(result).toEqual({ startTime: '6:30', endTime: '7:45pm' });
  });
});

describe('buildTimeDisplayParts', () => {
  const start = dayjs('2026-07-08T18:00:00.000'); // Wednesday
  const end = dayjs('2026-07-08T19:00:00.000');

  it('formats a single-day event with a date prefix and dash separator', () => {
    const result = buildTimeDisplayParts(start, end, dayjs('2026-07-08T12:00:00.000'), true);

    expect(result.prefix).toBe('Wed Jul 8 • ');
    expect(result.separator).toBe('-');
    expect(result.startTime).toBe('6');
    expect(result.endTime).toBe('7pm');
  });

  it('formats a multi-day event with no prefix and an arrow separator', () => {
    const multiStart = dayjs('2026-07-08T00:00:00.000');
    const multiEnd = dayjs('2026-09-01T23:59:00.000');

    const result = buildTimeDisplayParts(
      multiStart,
      multiEnd,
      dayjs('2026-07-08T12:00:00.000'),
      false
    );

    expect(result.prefix).toBe('');
    expect(result.separator).toBe(' → ');
    expect(result.startTime).toBe('Jul 8, 12am');
    expect(result.endTime).toBe('Sep 1, 11:59pm');
  });

  it('flags an ended event as completed with both times past', () => {
    const result = buildTimeDisplayParts(start, end, dayjs('2026-07-08T20:00:00.000'), true);
    expect(result).toMatchObject({
      startIsPast: true,
      endIsPast: true,
      isCompleted: true,
      focusEnd: false,
    });
  });

  it('flags a live event with the end time focused', () => {
    const result = buildTimeDisplayParts(start, end, dayjs('2026-07-08T18:30:00.000'), true);
    expect(result).toMatchObject({
      startIsPast: true,
      endIsPast: false,
      isCompleted: false,
      focusEnd: true,
    });
  });

  it('flags an upcoming event with the start (and prefix) focused', () => {
    const result = buildTimeDisplayParts(start, end, dayjs('2026-07-08T10:00:00.000'), true);
    expect(result).toMatchObject({
      startIsPast: false,
      endIsPast: false,
      isCompleted: false,
      focusStart: true,
      focusPrefix: true,
    });
  });
});

describe('buildEventStatusInfo', () => {
  const isSingleDay = true;

  it('reports an ended single-day event', () => {
    const result = buildEventStatusInfo(
      dayjs('2026-07-08T10:00:00.000'),
      dayjs('2026-07-08T12:00:00.000'),
      dayjs('2026-07-08T13:00:00.000'),
      isSingleDay
    );
    expect(result).toEqual({ prefix: null, text: 'Event ended', type: 'ended' });
  });

  it('reports an ended multi-day event with lowercase text and a day-count prefix', () => {
    const result = buildEventStatusInfo(
      dayjs('2026-07-01T00:00:00.000'),
      dayjs('2026-07-05T00:00:00.000'),
      dayjs('2026-07-08T00:00:00.000'),
      false
    );
    expect(result).toEqual({ prefix: '5 days • ', text: 'event ended', type: 'ended' });
  });

  it('reports a single-day multi-day-span event with singular "day"', () => {
    const result = buildEventStatusInfo(
      dayjs('2026-07-01T00:00:00.000'),
      dayjs('2026-07-01T23:00:00.000'),
      dayjs('2026-07-05T00:00:00.000'),
      false
    );
    expect(result?.prefix).toBe('1 day • ');
  });

  it('reports minutes-until-start when starting later today, under an hour away', () => {
    const result = buildEventStatusInfo(
      dayjs('2026-07-08T10:30:00.000'),
      dayjs('2026-07-08T12:00:00.000'),
      dayjs('2026-07-08T10:00:00.000'),
      isSingleDay
    );
    expect(result).toEqual({ prefix: null, text: 'Starts in 30m', type: 'upcoming' });
  });

  it('reports hours-until-start when starting later today, an hour or more away', () => {
    const result = buildEventStatusInfo(
      dayjs('2026-07-08T15:00:00.000'),
      dayjs('2026-07-08T17:00:00.000'),
      dayjs('2026-07-08T10:00:00.000'),
      isSingleDay
    );
    expect(result).toEqual({ prefix: null, text: 'Starts in 5h', type: 'upcoming' });
  });

  it('reports "Starts tomorrow" for a single-day event starting the next calendar day', () => {
    const result = buildEventStatusInfo(
      dayjs('2026-07-09T10:00:00.000'),
      dayjs('2026-07-09T12:00:00.000'),
      dayjs('2026-07-08T10:00:00.000'),
      isSingleDay
    );
    expect(result).toEqual({ prefix: null, text: 'Starts tomorrow', type: 'upcoming' });
  });

  it('reports lowercase "starts tomorrow" for a multi-day event', () => {
    const result = buildEventStatusInfo(
      dayjs('2026-07-09T00:00:00.000'),
      dayjs('2026-07-11T00:00:00.000'),
      dayjs('2026-07-08T10:00:00.000'),
      false
    );
    expect(result?.text).toBe('starts tomorrow');
  });

  it('reports days-until-start for an event starting more than a day out', () => {
    const result = buildEventStatusInfo(
      dayjs('2026-07-15T10:00:00.000'),
      dayjs('2026-07-15T12:00:00.000'),
      dayjs('2026-07-08T10:00:00.000'),
      isSingleDay
    );
    expect(result).toEqual({ prefix: null, text: 'Starts in 7d', type: 'normal' });
  });

  it('reports "Live • " prefix for a currently-live single-day event ending today, under an hour left', () => {
    const result = buildEventStatusInfo(
      dayjs('2026-07-08T08:00:00.000'),
      dayjs('2026-07-08T10:30:00.000'),
      dayjs('2026-07-08T10:00:00.000'),
      isSingleDay
    );
    expect(result).toEqual({ prefix: 'Live • ', text: 'ends in 30m', type: 'urgent' });
  });

  it('reports minutes/hours remaining for a live multi-day event ending today', () => {
    const result = buildEventStatusInfo(
      dayjs('2026-07-01T00:00:00.000'),
      dayjs('2026-07-08T15:00:00.000'),
      dayjs('2026-07-08T10:00:00.000'),
      false
    );
    expect(result).toEqual({ prefix: '8 days • ', text: 'ends in 5h', type: 'urgent' });
  });

  it('reports "ends tomorrow" for a live event ending the next calendar day', () => {
    const result = buildEventStatusInfo(
      dayjs('2026-07-01T00:00:00.000'),
      dayjs('2026-07-09T00:00:00.000'),
      dayjs('2026-07-08T10:00:00.000'),
      false
    );
    expect(result).toEqual({ prefix: '9 days • ', text: 'ends tomorrow', type: 'urgent' });
  });

  it('reports days-remaining (normal) for a live event ending more than a day out', () => {
    const result = buildEventStatusInfo(
      dayjs('2026-07-01T00:00:00.000'),
      dayjs('2026-07-15T00:00:00.000'),
      dayjs('2026-07-08T10:00:00.000'),
      false
    );
    expect(result).toEqual({ prefix: '15 days • ', text: 'ends in 7d', type: 'normal' });
  });

  it('returns null at the exact instant an event starts (neither before, live, nor after)', () => {
    const instant = dayjs('2026-07-08T10:00:00.000');
    const result = buildEventStatusInfo(
      instant,
      dayjs('2026-07-08T12:00:00.000'),
      instant,
      isSingleDay
    );
    expect(result).toBeNull();
  });
});
