import dayjs, { Dayjs } from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { EventMetadata, PogoEvent } from '@go-gather/shared';
import { isMajorCalendarEventType } from '../../core/services/calendar-event-major.util';
import { sortEventsByPriority } from './calendar-grid-slots.util';

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

/**
 * Ported from pogo-cal's src/composables/useCalendarDaySingleEvents.ts,
 * minus the raid-schedule boss-list rebuild for major-event daily
 * projections — its only purpose there was feeding sprite rendering, and
 * raid-boss art is resolved deferred/text-only for this port.
 */
export interface DailyMajorDisplayEvent extends PogoEvent {
  _isMajorDailyDisplay: true;
  _sourceEventID: string;
}

export function isDailyMajorDisplayEvent(event: PogoEvent): event is DailyMajorDisplayEvent {
  return (event as Partial<DailyMajorDisplayEvent>)._isMajorDailyDisplay === true;
}

/** Resolves an event back to its real source ID — a major-daily projection's
 * own eventID carries a `-daily-YYYY-MM-DD` suffix that must never be used
 * for metadata lookups, tooltip content, or selection state. */
export function getSourceEventID(event: PogoEvent): string {
  return isDailyMajorDisplayEvent(event) ? event._sourceEventID : event.eventID;
}

function getEventsForDate(
  events: readonly PogoEvent[],
  eventMetadata: Readonly<Record<string, EventMetadata>>,
  dayInstance: Dayjs
): PogoEvent[] {
  const targetDateStr = dayInstance.format('YYYY-MM-DD');

  return events.filter((event) => {
    const metadata = eventMetadata[event.eventID];
    const startDateStr = metadata.startDate.format('YYYY-MM-DD');
    const endDateStr = metadata.endDate.format('YYYY-MM-DD');
    return targetDateStr >= startDateStr && targetDateStr <= endDateStr;
  });
}

/**
 * The single-day event list for one calendar-day cell: the day's
 * individually-scheduled single-day events, plus per-day projections of
 * ongoing major multi-day events (GO Fest/GO Tour/Wild Area) so each day of
 * a major event still shows its own card. Individual events first, daily
 * projections appended at the end (a distinct trailing visual lane).
 */
export function getDailySingleDayEvents(
  events: readonly PogoEvent[],
  eventMetadata: Readonly<Record<string, EventMetadata>>,
  dayInstance: Dayjs,
  isEventVisible: (eventType: string, eventId: string) => boolean
): PogoEvent[] {
  const enabledEvents = getEventsForDate(events, eventMetadata, dayInstance).filter((event) =>
    isEventVisible(event.eventType, event.eventID)
  );

  const singleDayEvents = sortEventsByPriority(
    enabledEvents.filter((event) => eventMetadata[event.eventID].isSingleDayEvent)
  );

  const targetDay = dayInstance.startOf('day');
  const dateKey = targetDay.format('YYYY-MM-DD');

  const majorDailyDisplayEvents: DailyMajorDisplayEvent[] = enabledEvents
    .filter((event) => {
      if (!isMajorCalendarEventType(event.eventType)) {
        return false;
      }
      const metadata = eventMetadata[event.eventID];
      if (!metadata.isMultiDayEvent) {
        return false;
      }
      const startDay = metadata.startDate.startOf('day');
      const endDay = metadata.endDate.startOf('day');
      return targetDay.isSameOrAfter(startDay, 'day') && targetDay.isSameOrBefore(endDay, 'day');
    })
    .map((event) => ({
      ...event,
      eventID: `${event.eventID}-daily-${dateKey}`,
      _isMajorDailyDisplay: true,
      _sourceEventID: event.eventID,
    }));

  return [...singleDayEvents, ...majorDailyDisplayEvents];
}
