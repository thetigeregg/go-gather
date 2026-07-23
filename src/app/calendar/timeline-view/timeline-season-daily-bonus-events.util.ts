import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { PogoEvent } from '@go-gather/shared';
import { parseEventDate } from '../../core/services/calendar-event-date.util';

dayjs.extend(isSameOrBefore);

/**
 * Projects a `season`-type event's per-weekday `dailyBonuses` (the same data
 * driving the calendar view's "Daily Discovery" chip) into individual
 * single-day pseudo-events — one per date the season is active and a bonus
 * applies — so each shows up as its own line in the timeline instead of only
 * being visible nested inside the season event's own expanded card.
 *
 * Deliberately kept out of CalendarEventsService/generateEventRaidHourSubEvents'
 * shared pipeline: those pseudo-events would also flow into the calendar
 * grid's day cells (via calendar-single-day-events.util.ts), duplicating the
 * season chip there — the calendar view's chip-only presentation is meant to
 * stay as-is. This is timeline-only, computed fresh alongside the timeline's
 * own event list rather than cached on the shared service.
 */
export function generateSeasonDailyBonusEvents(events: readonly PogoEvent[]): PogoEvent[] {
  const pseudoEvents: PogoEvent[] = [];

  for (const parentEvent of events) {
    if (parentEvent.eventType !== 'season') {
      continue;
    }

    const season = parentEvent.extraData?.season;
    if (!season || season.dailyBonuses.length === 0) {
      continue;
    }

    const seasonStart = parseEventDate(parentEvent.start).startOf('day');
    const seasonEnd = parseEventDate(parentEvent.end).startOf('day');

    for (
      let day = seasonStart.clone();
      day.isSameOrBefore(seasonEnd, 'day');
      day = day.add(1, 'day')
    ) {
      const dailyBonus = season.dailyBonuses.find((entry) => entry.dayOfWeek === day.day());
      if (!dailyBonus || dailyBonus.bonuses.length === 0) {
        continue;
      }

      const dateKey = day.format('YYYY-MM-DD');
      const name =
        dailyBonus.bonuses.find((group) => group.title)?.title ?? `${dailyBonus.day} Bonus`;

      pseudoEvents.push({
        eventID: `${parentEvent.eventID}-daily-bonus-${dateKey}`,
        name,
        eventType: 'season-daily-bonus',
        heading: parentEvent.heading,
        link: parentEvent.link,
        image: parentEvent.image,
        start: day.format('YYYY-MM-DDTHH:mm:ss.SSS'),
        end: day.endOf('day').format('YYYY-MM-DDTHH:mm:ss.SSS'),
        extraData: {
          isSeasonDailyBonusSubEvent: true,
          parentEventId: parentEvent.eventID,
          season: {
            note: null,
            dailyBonuses: [dailyBonus],
            seasonBonuses: [],
          },
        },
      });
    }
  }

  return pseudoEvents;
}
