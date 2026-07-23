import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import type { Season } from '@go-gather/shared';
import type { CandidateEvent } from './notification-scheduler.js';

dayjs.extend(isSameOrBefore);

/**
 * Server-side port of the client's generateSeasonDailyBonusEvents() (see
 * timeline-season-daily-bonus-events.util.ts) — projects a season's
 * per-weekday dailyBonuses into individual single-day CandidateEvents so
 * they can flow through the existing notification pipeline. Kept as its own
 * pure function, mirroring computeDueNotifications()'s testability rationale.
 */
export function generateSeasonDailyBonusCandidateEvents(season: Season): CandidateEvent[] {
  const candidates: CandidateEvent[] = [];

  if (season.dailyBonuses.length === 0) {
    return candidates;
  }

  const seasonStart = dayjs(season.start).startOf('day');
  const seasonEnd = dayjs(season.end).startOf('day');

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
    const heading = dailyBonus.bonuses.flatMap((group) => group.items)[0] ?? dailyBonus.day;

    candidates.push({
      eventId: `${season.eventID}-daily-bonus-${dateKey}`,
      eventType: 'season-daily-bonus',
      dayOfWeek: dailyBonus.dayOfWeek,
      name,
      heading,
      start: day.format('YYYY-MM-DDTHH:mm:ss.SSS'),
    });
  }

  return candidates;
}
