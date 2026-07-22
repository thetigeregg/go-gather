import { Dayjs } from 'dayjs';
import { EventMetadata, PogoEvent } from '@go-gather/shared';
import { formatEventTime, parseEventDate } from './calendar-event-date.util';
import { formatEventName } from './calendar-event-name.util';
import { getEventTypeColor, getEventTypeInfo } from './calendar-event-type-info.util';
import { getSpotlightBonusInfo, getSpotlightBonusTypeIcon } from './spotlight-bonus.util';
import { buildTierGroupsFromBosses } from './raid-tier-groups.util';

/**
 * Ported from pogo-cal's src/utils/eventMetadata.ts (buildEventMetadata()),
 * minus the manualOffsetHours parameter (dropped display preference).
 *
 * Called once per event per fetch/refresh (see CalendarEventsService), not
 * recomputed per render.
 */
export function buildEventMetadata(event: PogoEvent, now: Dayjs): EventMetadata {
  const startDate = parseEventDate(event.start);
  const endDate = parseEventDate(event.end);
  const isMultiDay = !startDate.startOf('day').isSame(endDate.startOf('day'));
  const spotlightBonus = getSpotlightBonusInfo(event);

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
    spotlightBonus,
    spotlightBonusIconUrl: spotlightBonus
      ? getSpotlightBonusTypeIcon(spotlightBonus.bonusType)
      : null,
    raidBossTierGroups: buildTierGroupsFromBosses(event.extraData?.raidbattles?.bosses),
  };
}
