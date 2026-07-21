import dayjs, { Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import utc from 'dayjs/plugin/utc';
import { PogoEvent, PokemonBoss } from '@go-gather/shared';

dayjs.extend(utc);
dayjs.extend(customParseFormat);
dayjs.extend(isSameOrBefore);

const DAY_NAME_TO_NUMBER: Partial<Record<string, number>> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/**
 * Ported from pogo-cal's src/utils/eventRaidHours.ts (parseRaidScheduleDate()
 * only — the rest of that file is calendar/timeline schedule-rendering logic
 * for later phases). Handles three raid-schedule date formats: a full date
 * ("Monday, November 10"), a bare day of week ("Monday", resolved to the
 * first matching day within the parent event's range), or month+day
 * ("April 1", year inferred from the parent event).
 */
function parseRaidScheduleDate(
  dateString: string,
  parentEventStart: string,
  parentEventEnd: string
): Dayjs | null {
  const parentStart = dayjs.utc(parentEventStart).local();
  const parentEnd = dayjs.utc(parentEventEnd).local();
  const parentYear = parentStart.year();

  const fullDateMatch = /([A-Za-z]+),\s+([A-Za-z]+)\s+(\d+)/.exec(dateString);
  if (fullDateMatch) {
    const [, , month, day] = fullDateMatch;
    const parsed = dayjs(`${month} ${day}, ${String(parentYear)}`, 'MMMM D, YYYY');
    if (parsed.isValid()) {
      if (parsed.isBefore(parentStart, 'day')) {
        const nextYear = dayjs(`${month} ${day}, ${String(parentYear + 1)}`, 'MMMM D, YYYY');
        if (nextYear.isValid()) {
          return nextYear;
        }
      }
      return parsed;
    }
  }

  const dayOfWeekMatch = /^([A-Za-z]+)$/.exec(dateString);
  if (dayOfWeekMatch) {
    const targetDayNum = DAY_NAME_TO_NUMBER[dayOfWeekMatch[1]];
    if (targetDayNum !== undefined) {
      let current = parentStart.startOf('day');
      const maxSearchDays = parentEnd.diff(parentStart, 'day') + 2;

      for (let i = 0; i < maxSearchDays; i++) {
        if (current.day() === targetDayNum && current.isSameOrBefore(parentEnd)) {
          return current;
        }
        current = current.add(1, 'day');
      }
    }
  }

  const monthDayMatch = /^([A-Za-z]+)\s+(\d{1,2})$/.exec(dateString);
  if (monthDayMatch) {
    const [, month, day] = monthDayMatch;
    const parsed = dayjs(`${month} ${day}, ${String(parentYear)}`, 'MMMM D, YYYY');
    if (parsed.isValid()) {
      if (parsed.isBefore(parentStart, 'day')) {
        const nextYear = dayjs(`${month} ${day}, ${String(parentYear + 1)}`, 'MMMM D, YYYY');
        if (nextYear.isValid()) {
          return nextYear;
        }
      }
      return parsed;
    }
  }

  return null;
}

/** Example: "6:00 p.m. to 7:00 p.m. local time" -> { startHour: 18, endHour: 19 }. */
function parseRaidHourTime(timeString: string): { startHour: number; endHour: number } {
  const defaultTime = { startHour: 18, endHour: 19 };
  if (!timeString) {
    return defaultTime;
  }

  const timeMatch =
    /(\d+):(\d+)\s*(a\.m\.|p\.m\.|am|pm)\s+to\s+(\d+):(\d+)\s*(a\.m\.|p\.m\.|am|pm)/i.exec(
      timeString
    );
  if (!timeMatch) {
    return defaultTime;
  }

  const [, startHourStr, , startPeriod, endHourStr, , endPeriod] = timeMatch;
  let startHour = parseInt(startHourStr, 10);
  let endHour = parseInt(endHourStr, 10);

  if (startPeriod.toLowerCase().includes('p') && startHour !== 12) {
    startHour += 12;
  } else if (startPeriod.toLowerCase().includes('a') && startHour === 12) {
    startHour = 0;
  }

  if (endPeriod.toLowerCase().includes('p') && endHour !== 12) {
    endHour += 12;
  } else if (endPeriod.toLowerCase().includes('a') && endHour === 12) {
    endHour = 0;
  }

  return { startHour, endHour };
}

/**
 * 1 Pokemon: "Lugia Raid Hour"; 2: "Lugia and Ho-Oh Raid Hour"; 3-6: "A, B,
 * and C Raid Hour"; 7+: "N Bosses Raid Hour".
 */
function formatPokemonList(bosses: PokemonBoss[]): string {
  if (bosses.length === 0) {
    return 'Raid Hour';
  }
  if (bosses.length === 1) {
    return `${bosses[0].name} Raid Hour`;
  }
  if (bosses.length === 2) {
    return `${bosses[0].name} and ${bosses[1].name} Raid Hour`;
  }
  if (bosses.length > 6) {
    return `${String(bosses.length)} Bosses Raid Hour`;
  }

  const allButLast = bosses
    .slice(0, -1)
    .map((boss) => boss.name)
    .join(', ');
  const last = bosses[bosses.length - 1].name;
  return `${allButLast}, and ${last} Raid Hour`;
}

function formatSpotlightEventName(pokemon: PokemonBoss): string {
  return `${pokemon.name} Spotlight Hour`;
}

/**
 * Ported from pogo-cal's src/utils/eventSubEvents.ts. Splits a multi-day
 * event's per-hour raid schedule into individually-schedulable 1-hour "Raid
 * Hour" child events, so they render as their own calendar/timeline items
 * instead of being buried inside one giant multi-day block.
 */
export function generateEventRaidHourSubEvents(parentEvent: PogoEvent): PogoEvent[] {
  if (parentEvent.eventType !== 'event') {
    return [];
  }

  const raidSchedule = parentEvent.extraData?.raidSchedule;
  if (!raidSchedule || raidSchedule.length === 0) {
    return [];
  }

  const pseudoEvents: PogoEvent[] = [];

  raidSchedule.forEach((schedule) => {
    if (schedule.raidHours.length === 0) {
      return;
    }

    const raidDate = parseRaidScheduleDate(schedule.date, parentEvent.start, parentEvent.end);
    if (!raidDate) {
      console.warn(
        `Could not parse raid schedule date: "${schedule.date}" for event ${parentEvent.eventID}`
      );
      return;
    }

    schedule.raidHours.forEach((raidHour, index) => {
      if (raidHour.bosses.length === 0) {
        return;
      }

      const { startHour, endHour } = parseRaidHourTime(raidHour.time);
      const startDateTime = raidDate.hour(startHour).minute(0).second(0);
      const endDateTime = raidDate.hour(endHour).minute(0).second(0);
      const dateKey = raidDate.format('YYYY-MM-DD');

      pseudoEvents.push({
        eventID: `${parentEvent.eventID}-raid-hour-${dateKey}-${String(index)}`,
        name: formatPokemonList(raidHour.bosses),
        eventType: 'event',
        heading: 'Event',
        link: parentEvent.link,
        image: raidHour.bosses[0]?.image || parentEvent.image,
        start: startDateTime.format('YYYY-MM-DDTHH:mm:ss.SSS'),
        end: endDateTime.format('YYYY-MM-DDTHH:mm:ss.SSS'),
        extraData: {
          isRaidHourSubEvent: true,
          parentEventId: parentEvent.eventID,
          generic: { hasSpawns: false, hasFieldResearchTasks: false },
          raidbattles: { bosses: raidHour.bosses },
          ...(schedule.bonuses && schedule.bonuses.length > 0
            ? { raidHourBonuses: schedule.bonuses }
            : {}),
        },
      });
    });
  });

  return pseudoEvents;
}

/**
 * Ported from pogo-cal's src/utils/eventSubEvents.ts. Same rationale as
 * generateEventRaidHourSubEvents(), for Spotlight Hour schedules.
 */
export function generateEventSpotlightSubEvents(parentEvent: PogoEvent): PogoEvent[] {
  if (parentEvent.eventType !== 'event') {
    return [];
  }

  const spotlightSchedule = parentEvent.extraData?.spotlightSchedule;
  if (!spotlightSchedule || spotlightSchedule.length === 0) {
    return [];
  }

  const pseudoEvents: PogoEvent[] = [];

  spotlightSchedule.forEach((schedule, index) => {
    if (!schedule.pokemon.name) {
      return;
    }

    const spotlightDate = parseRaidScheduleDate(schedule.date, parentEvent.start, parentEvent.end);
    if (!spotlightDate) {
      console.warn(
        `Could not parse spotlight schedule date: "${schedule.date}" for event ${parentEvent.eventID}`
      );
      return;
    }

    const { startHour, endHour } = parseRaidHourTime(schedule.time || '');
    const startDateTime = spotlightDate.hour(startHour).minute(0).second(0);
    const endDateTime = spotlightDate.hour(endHour).minute(0).second(0);
    const dateKey = spotlightDate.format('YYYY-MM-DD');

    pseudoEvents.push({
      eventID: `${parentEvent.eventID}-spotlight-hour-${dateKey}-${String(index)}`,
      name: formatSpotlightEventName(schedule.pokemon),
      eventType: parentEvent.eventType,
      heading: parentEvent.heading,
      link: parentEvent.link,
      image: schedule.pokemon.image || parentEvent.image,
      start: startDateTime.format('YYYY-MM-DDTHH:mm:ss.SSS'),
      end: endDateTime.format('YYYY-MM-DDTHH:mm:ss.SSS'),
      extraData: {
        isSpotlightSubEvent: true,
        parentEventId: parentEvent.eventID,
        generic: { hasSpawns: false, hasFieldResearchTasks: false },
        spotlight: {
          name: schedule.pokemon.name,
          image: schedule.pokemon.image,
          canBeShiny: schedule.pokemon.canBeShiny,
        },
      },
    });
  });

  return pseudoEvents;
}
