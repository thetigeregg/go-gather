import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

/**
 * Ported from pogo-cal's src/utils/eventDate.ts, minus the manualOffsetHours
 * parameter — the "manual clock offset" display preference it supported is
 * resolved dropped entirely for this port (see pogo-cal's migration
 * OPEN-DECISIONS.md), and no consumer here will ever supply a non-zero value.
 */
export function parseEventDate(dateStr: string): Dayjs {
  return dateStr.endsWith('Z') ? dayjs.utc(dateStr).local() : dayjs(dateStr);
}

export function formatEventTime(dateStr: string): string {
  const eventDate = parseEventDate(dateStr);
  return eventDate.minute() === 0 ? eventDate.format('ha') : eventDate.format('h:mma');
}
