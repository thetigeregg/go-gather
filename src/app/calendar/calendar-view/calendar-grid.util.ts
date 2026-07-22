import { Dayjs } from 'dayjs';

/** Ported from pogo-cal's src/utils/calendarGrid.ts. */
export interface CalendarDayCell {
  date: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  dayInstance: Dayjs;
}

interface CalendarDaysOptions {
  year: number;
  month: number;
  firstDayIndex: number;
}

/**
 * Builds the day cells for the given month, padded to whole weeks aligned to
 * firstDayIndex. referenceDay is "today" (or the day-cell of an event's own
 * reference in a test) — used both to seed the target month and to compute
 * isToday.
 */
export function buildCalendarDays(
  referenceDay: Dayjs,
  { year, month, firstDayIndex }: CalendarDaysOptions
): CalendarDayCell[] {
  const currentDate = referenceDay.year(year).month(month);
  const startOfMonth = currentDate.startOf('month');
  const endOfMonth = currentDate.endOf('month');

  let startDate = startOfMonth.clone();
  while (startDate.day() !== firstDayIndex) {
    startDate = startDate.subtract(1, 'day');
  }

  let endDate = endOfMonth.clone();
  const lastDayIndex = (firstDayIndex + 6) % 7;
  while (endDate.day() !== lastDayIndex) {
    endDate = endDate.add(1, 'day');
  }

  const days: CalendarDayCell[] = [];
  let day = startDate;

  while (day.isBefore(endDate) || day.isSame(endDate, 'day')) {
    days.push({
      date: day.date(),
      month: day.month(),
      year: day.year(),
      isCurrentMonth: day.isSame(currentDate, 'month'),
      isToday: day.isSame(referenceDay, 'day'),
      dayInstance: day,
    });
    day = day.add(1, 'day');
  }

  return days;
}
