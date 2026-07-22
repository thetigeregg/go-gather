import dayjs from 'dayjs';
import { buildCalendarDays } from './calendar-grid.util';

describe('buildCalendarDays', () => {
  it('pads July 2026 (starts Wed, ends Fri) to a Sunday-aligned 5-week grid', () => {
    const days = buildCalendarDays(dayjs('2026-07-15'), { year: 2026, month: 6, firstDayIndex: 0 });

    expect(days).toHaveLength(35);
    expect(days[0].dayInstance.format('YYYY-MM-DD')).toBe('2026-06-28');
    expect(days[0].isCurrentMonth).toBe(false);
    expect(days[days.length - 1].dayInstance.format('YYYY-MM-DD')).toBe('2026-08-01');
    expect(days[days.length - 1].isCurrentMonth).toBe(false);

    const july1 = days.find((d) => d.dayInstance.format('YYYY-MM-DD') === '2026-07-01');
    expect(july1?.isCurrentMonth).toBe(true);
    expect(july1?.date).toBe(1);
    expect(july1?.month).toBe(6);
    expect(july1?.year).toBe(2026);
  });

  it('shifts alignment when firstDayIndex is Monday (1)', () => {
    const days = buildCalendarDays(dayjs('2026-07-15'), { year: 2026, month: 6, firstDayIndex: 1 });

    expect(days).toHaveLength(35);
    expect(days[0].dayInstance.format('YYYY-MM-DD')).toBe('2026-06-29');
    expect(days[days.length - 1].dayInstance.format('YYYY-MM-DD')).toBe('2026-08-02');
  });

  it('marks isToday true only for the cell matching referenceDay', () => {
    const referenceDay = dayjs('2026-07-15');
    const days = buildCalendarDays(referenceDay, { year: 2026, month: 6, firstDayIndex: 0 });

    const todayCells = days.filter((d) => d.isToday);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0].date).toBe(15);
  });

  it('produces no isToday cell when referenceDay falls outside the requested month', () => {
    const referenceDay = dayjs('2026-01-01');
    const days = buildCalendarDays(referenceDay, { year: 2026, month: 6, firstDayIndex: 0 });

    expect(days.some((d) => d.isToday)).toBe(false);
  });

  it('produces a 4-week grid for a month that is already whole-week-aligned on both ends', () => {
    // Verifies the grid isn't forced to a fixed 6 weeks — it only pads as needed.
    // February 2026: Feb 1 is a Sunday, Feb 28 is a Saturday (2026 is not a leap year).
    const days = buildCalendarDays(dayjs('2026-02-15'), { year: 2026, month: 1, firstDayIndex: 0 });

    expect(days).toHaveLength(28);
    expect(days[0].dayInstance.format('YYYY-MM-DD')).toBe('2026-02-01');
    expect(days[days.length - 1].dayInstance.format('YYYY-MM-DD')).toBe('2026-02-28');
  });
});
