import { PogoEvent, PokemonBoss, RaidScheduleEntry } from '@go-gather/shared';
import {
  buildRaidTierGroupsWithImages,
  buildTierGroupsFromBosses,
  RaidTierGroupWithImages,
  sortTierLabel,
} from './raid-tier-groups.util';

/** Ported from pogo-cal's src/utils/timelineSchedule.ts. */

/** Ported from pogo-cal's src/utils/eventRaidHours.ts — used only by the schedule sort below. */
function parseTimeStartSortKey(timeString?: string): number {
  if (!timeString) {
    // Every call site below only invokes this with a defined, non-empty time
    // string (guarded by isAllDay / the required raidHour.time field) — kept
    // `?:` for parity with source's more general signature.
    return Number.MAX_SAFE_INTEGER;
  }

  const match = timeString.match(/(\d+):(\d+)\s*(a\.m\.|p\.m\.|am|pm)/i);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const [, hourStr, minuteStr, period] = match;
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (period.toLowerCase().includes('p') && hour !== 12) {
    hour += 12;
  } else if (period.toLowerCase().includes('a') && hour === 12) {
    hour = 0;
  }

  return hour * 60 + minute;
}

function formatScheduleSectionLabel(label: string | undefined, isAllDay: boolean): string {
  const normalizedLabel = label?.trim();

  if (isAllDay) {
    return normalizedLabel ? `${normalizedLabel} (All Day)` : 'All Day';
  }

  if (normalizedLabel) {
    return normalizedLabel;
  }

  return 'Scheduled';
}

interface TimelineScheduleSection {
  id: string;
  labelText: string;
  time?: string;
  isAllDay: boolean;
  sortKey: number;
  tierGroups: RaidTierGroupWithImages[];
}

export interface TimelineScheduleDaySection {
  id: string;
  date: string;
  sections: TimelineScheduleSection[];
}

/**
 * Builds the expanded timeline raid schedule: bosses grouped into tiers, nested under their
 * schedule section (incl. raid hours) and ordered day. Returns `undefined` when there is nothing
 * to render.
 */
export function buildTimelineScheduleDaySectionsWithTierGroups(
  event: PogoEvent
): TimelineScheduleDaySection[] | undefined {
  const raidSchedule = event.extraData?.raidSchedule;
  if (!raidSchedule || raidSchedule.length === 0) {
    return undefined;
  }

  const daySectionMap = new Map<string, TimelineScheduleDaySection>();
  const orderedDates: string[] = [];

  function ensureDaySection(date: string, scheduleIndex: number): TimelineScheduleDaySection {
    const normalizedDate = date.trim() || 'Scheduled Day';
    if (!daySectionMap.has(normalizedDate)) {
      daySectionMap.set(normalizedDate, {
        id: `schedule-day-${String(scheduleIndex)}-${normalizedDate}`,
        date: normalizedDate,
        sections: [],
      });
      orderedDates.push(normalizedDate);
    }
    const daySection = daySectionMap.get(normalizedDate);
    if (!daySection) {
      // ensureDaySection always populates the map for normalizedDate immediately above.
      throw new Error('unreachable');
    }
    return daySection;
  }

  function appendScheduleSection(
    daySection: TimelineScheduleDaySection,
    id: string,
    labelText: string,
    time: string | undefined,
    isAllDay: boolean,
    bosses: PokemonBoss[]
  ): void {
    const tierGroups = buildTierGroupsFromBosses(bosses);
    const tierGroupsWithImages = buildRaidTierGroupsWithImages(tierGroups);

    if (!tierGroupsWithImages?.length) {
      // Both call sites below only invoke appendScheduleSection with a
      // non-empty bosses array, so this is never actually empty/null —
      // kept for parity with source's own defensive check.
      return;
    }

    daySection.sections.push({
      id,
      labelText,
      time,
      isAllDay,
      sortKey: isAllDay ? -1 : parseTimeStartSortKey(time),
      tierGroups: tierGroupsWithImages,
    });
  }

  raidSchedule.forEach((schedule: RaidScheduleEntry, scheduleIndex) => {
    const daySection = ensureDaySection(schedule.date, scheduleIndex);

    if (schedule.bosses.length > 0) {
      const isAllDay = !schedule.time;
      appendScheduleSection(
        daySection,
        `schedule-${String(scheduleIndex)}`,
        formatScheduleSectionLabel(schedule.label, isAllDay),
        schedule.time?.trim() || undefined,
        isAllDay,
        schedule.bosses
      );
    }

    schedule.raidHours.forEach((raidHour, hourIndex) => {
      if (raidHour.bosses.length === 0) {
        return;
      }

      appendScheduleSection(
        daySection,
        `schedule-${String(scheduleIndex)}-raidhour-${String(hourIndex)}`,
        formatScheduleSectionLabel(raidHour.label, false),
        raidHour.time.trim() || undefined,
        false,
        raidHour.bosses
      );
    });
  });

  const daySections = orderedDates
    .map((date) => {
      const daySection = daySectionMap.get(date);
      if (!daySection || daySection.sections.length === 0) {
        return undefined;
      }

      daySection.sections.sort((a, b) => {
        if (a.isAllDay !== b.isAllDay) {
          return a.isAllDay ? -1 : 1;
        }
        if (a.sortKey !== b.sortKey) {
          return a.sortKey - b.sortKey;
        }
        return a.labelText.localeCompare(b.labelText);
      });

      return daySection;
    })
    .filter((section): section is TimelineScheduleDaySection => section != null);

  if (daySections.length === 0) {
    return undefined;
  }

  return daySections;
}

export interface CollapsedScheduleDayGroup {
  id: string;
  date: string;
  images: RaidTierGroupWithImages['images'];
}

/**
 * Collapses the expanded schedule into a per-day list of deduped bosses (keyed by name + image),
 * keeping the highest-priority tier label for each. Used for the compact, non-active card layout.
 */
export function buildCollapsedScheduleDayGroups(
  event: PogoEvent
): CollapsedScheduleDayGroup[] | undefined {
  const daySections = buildTimelineScheduleDaySectionsWithTierGroups(event);
  if (!daySections || daySections.length === 0) {
    return undefined;
  }

  return daySections
    .map((daySection) => {
      const dedupedBosses = new Map<
        string,
        {
          boss: RaidTierGroupWithImages['images'][number];
          tierLabel: string;
        }
      >();

      daySection.sections.forEach((section) => {
        section.tierGroups.forEach((group) => {
          group.images.forEach((boss) => {
            const dedupeKey = `${boss.name.toLowerCase()}|${(boss.imageUrl ?? '').toLowerCase()}`;
            const existing = dedupedBosses.get(dedupeKey);

            if (!existing) {
              dedupedBosses.set(dedupeKey, { boss, tierLabel: group.label });
              return;
            }

            if (sortTierLabel(group.label, existing.tierLabel) < 0) {
              dedupedBosses.set(dedupeKey, { boss, tierLabel: group.label });
            }
          });
        });
      });

      const sortedImages = Array.from(dedupedBosses.values())
        .sort((a, b) => sortTierLabel(a.tierLabel, b.tierLabel))
        .map((entry) => entry.boss);

      return {
        id: daySection.id,
        date: daySection.date,
        images: sortedImages,
      };
    })
    .filter((daySection) => daySection.images.length > 0);
}
