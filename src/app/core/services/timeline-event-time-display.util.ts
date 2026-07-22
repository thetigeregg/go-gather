import { Dayjs } from 'dayjs';

/** Ported from pogo-cal's src/utils/eventTimeDisplay.ts. */
export interface TimeDisplayParts {
  prefix: string;
  startTime: string;
  separator: string;
  endTime: string;
  focusPrefix: boolean;
  focusStart: boolean;
  focusEnd: boolean;
  startIsPast: boolean;
  endIsPast: boolean;
  isCompleted: boolean;
}

export type EventStatusType = 'ended' | 'upcoming' | 'normal' | 'urgent';

export interface EventStatusInfo {
  prefix: string | null;
  text: string;
  type: EventStatusType;
}

export function formatSingleDayTimes(
  startDate: Dayjs,
  endDate: Dayjs
): { startTime: string; endTime: string } {
  const endTime = endDate.minute() === 0 ? endDate.format('ha') : endDate.format('h:mma');

  const startPeriod = startDate.format('A');
  const endPeriod = endDate.format('A');

  if (startPeriod === endPeriod) {
    const startTimeWithoutPeriod =
      startDate.minute() === 0 ? startDate.format('h') : startDate.format('h:mm');
    return { startTime: startTimeWithoutPeriod, endTime };
  }

  const startTime = startDate.minute() === 0 ? startDate.format('ha') : startDate.format('h:mma');
  return { startTime, endTime };
}

type TimePhase = 'ended' | 'live' | 'upcoming';

/** Focus/past/completed flags keyed on timing phase — identical across
 * single-day and multi-day display; for multi-day the prefix is always
 * empty, so focusPrefix is never actually rendered. */
const PHASE_FLAGS: Record<
  TimePhase,
  Omit<TimeDisplayParts, 'prefix' | 'startTime' | 'separator' | 'endTime'>
> = {
  ended: {
    focusPrefix: false,
    focusStart: false,
    focusEnd: false,
    startIsPast: true,
    endIsPast: true,
    isCompleted: true,
  },
  live: {
    focusPrefix: false,
    focusStart: false,
    focusEnd: true,
    startIsPast: true,
    endIsPast: false,
    isCompleted: false,
  },
  upcoming: {
    focusPrefix: true,
    focusStart: true,
    focusEnd: false,
    startIsPast: false,
    endIsPast: false,
    isCompleted: false,
  },
};

function resolveTimePhase(eventStart: Dayjs, eventEnd: Dayjs, currentTime: Dayjs): TimePhase {
  if (currentTime.isAfter(eventEnd)) {
    return 'ended';
  }
  if (currentTime.isAfter(eventStart) && currentTime.isBefore(eventEnd)) {
    return 'live';
  }
  return 'upcoming';
}

export function buildTimeDisplayParts(
  startDate: Dayjs,
  endDate: Dayjs,
  currentTime: Dayjs,
  isSingleDay: boolean
): TimeDisplayParts {
  const flags = PHASE_FLAGS[resolveTimePhase(startDate, endDate, currentTime)];

  if (isSingleDay) {
    const datePrefix = `${startDate.format('ddd')} ${startDate.format('MMM D')} • `;
    const { startTime, endTime } = formatSingleDayTimes(startDate, endDate);
    return { prefix: datePrefix, startTime, separator: '-', endTime, ...flags };
  }

  const startDateStr = startDate.format('MMM D, h:mma').replace(':00', '');
  const endDateStr = endDate.format('MMM D, h:mma').replace(':00', '');
  return { prefix: '', startTime: startDateStr, separator: ' → ', endTime: endDateStr, ...flags };
}

export function buildEventStatusInfo(
  eventStart: Dayjs,
  eventEnd: Dayjs,
  currentTime: Dayjs,
  isSingleDay: boolean
): EventStatusInfo | null {
  const totalDays = isSingleDay ? null : eventEnd.diff(eventStart, 'day') + 1;
  const prefix = totalDays ? `${String(totalDays)} day${totalDays > 1 ? 's' : ''} • ` : null;

  if (currentTime.isAfter(eventEnd)) {
    const text = isSingleDay ? 'Event ended' : 'event ended';
    return { prefix, text, type: 'ended' };
  }

  if (eventStart.isAfter(currentTime)) {
    const daysUntilStart = eventStart.startOf('day').diff(currentTime.startOf('day'), 'day');

    if (eventStart.startOf('day').isSame(currentTime.startOf('day'))) {
      const hoursUntilStart = eventStart.diff(currentTime, 'hour', true);
      if (hoursUntilStart < 1) {
        const minutesUntilStart = Math.ceil(eventStart.diff(currentTime, 'minute', true));
        const text = isSingleDay
          ? `Starts in ${String(minutesUntilStart)}m`
          : `starts in ${String(minutesUntilStart)}m`;
        return { prefix, text, type: 'upcoming' };
      }
      const roundedHours = Math.ceil(hoursUntilStart);
      const text = isSingleDay
        ? `Starts in ${String(roundedHours)}h`
        : `starts in ${String(roundedHours)}h`;
      return { prefix, text, type: 'upcoming' };
    }

    if (daysUntilStart === 1) {
      const text = isSingleDay ? 'Starts tomorrow' : 'starts tomorrow';
      return { prefix, text, type: 'upcoming' };
    }

    const text = isSingleDay
      ? `Starts in ${String(daysUntilStart)}d`
      : `starts in ${String(daysUntilStart)}d`;
    return { prefix, text, type: 'normal' };
  }

  if (currentTime.isAfter(eventStart) && currentTime.isBefore(eventEnd)) {
    const daysUntilEnd = eventEnd.startOf('day').diff(currentTime.startOf('day'), 'day');
    const livePrefix = isSingleDay ? 'Live • ' : prefix;

    if (eventEnd.startOf('day').isSame(currentTime.startOf('day'))) {
      const hoursUntilEnd = eventEnd.diff(currentTime, 'hour', true);
      if (hoursUntilEnd < 1) {
        const minutesUntilEnd = Math.ceil(eventEnd.diff(currentTime, 'minute', true));
        return { prefix: livePrefix, text: `ends in ${String(minutesUntilEnd)}m`, type: 'urgent' };
      }
      const roundedHours = Math.ceil(hoursUntilEnd);
      return { prefix: livePrefix, text: `ends in ${String(roundedHours)}h`, type: 'urgent' };
    }

    if (daysUntilEnd === 1) {
      return { prefix: livePrefix, text: 'ends tomorrow', type: 'urgent' };
    }
    if (daysUntilEnd > 1) {
      return { prefix: livePrefix, text: `ends in ${String(daysUntilEnd)}d`, type: 'normal' };
    }
    // Unreachable under current semantics: any daysUntilEnd <= 0 while still
    // "live" already matched the same-day branch above. Ported verbatim
    // (dead code in the source too) for parity, matching this port's
    // established practice elsewhere (e.g. calendar-day-layout.util.ts's
    // middle-continue branch).
    return { prefix: livePrefix, text: 'ends today', type: 'urgent' };
  }

  return null;
}
