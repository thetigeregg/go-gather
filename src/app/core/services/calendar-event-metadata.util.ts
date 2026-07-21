import { Dayjs } from 'dayjs';
import { EventMetadata, PogoEvent } from '@go-gather/shared';
import { formatEventTime, parseEventDate } from './calendar-event-date.util';
import { formatEventName } from './calendar-event-name.util';
import { getEventTypeColor, getEventTypeInfo } from './calendar-event-type-info.util';

/**
 * Ported from pogo-cal's src/utils/eventMetadata.ts (buildEventMetadata()),
 * minus the manualOffsetHours parameter (dropped display preference) and the
 * spotlightBonus/raidBossTierGroups fields (raid-boss art rendering is
 * resolved deferred/text-only for this port — see OPEN-DECISIONS.md). The
 * type still carries those fields as optional for shape completeness; they
 * just aren't populated by this pass.
 *
 * Called once per event per fetch/refresh (see CalendarEventsService), not
 * recomputed per render.
 */
export function buildEventMetadata(event: PogoEvent, now: Dayjs): EventMetadata {
  const startDate = parseEventDate(event.start);
  const endDate = parseEventDate(event.end);
  const isMultiDay = !startDate.startOf('day').isSame(endDate.startOf('day'));

  return {
    startDate,
    endDate,
    isMultiDayEvent: isMultiDay,
    isSingleDayEvent: !isMultiDay,
    isPastEvent: endDate.isBefore(now),
    isFutureEvent: startDate.isAfter(now),
    typeInfo: getEventTypeInfo(event.eventType),
    color: getEventTypeColor(event.eventType),
    formattedStartTime: formatEventTime(event.start),
    displayName: formatEventName(event.name),
  };
}
