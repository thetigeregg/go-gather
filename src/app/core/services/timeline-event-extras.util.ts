import { BonusItem, EventBonusGroup, PogoEvent, SeasonData } from '@go-gather/shared';

/**
 * Ported from pogo-cal's src/components/Calendar/EventExtras/EventExtras.vue
 * and its 5 bonus sub-components, minus all sprite/icon rendering (raid-boss
 * art is text-only for this port) — the bonus text itself isn't boss art,
 * so it's kept. Matches hasEventExtras()'s exact 5-branch OR condition
 * (src/utils/eventSubtype.ts), returning null instead of a boolean so the
 * component can render (or not) off one value.
 */
export interface TimelineEventExtras {
  communityDayBonuses: BonusItem[] | null;
  raidHourBonuses: string[] | null;
  spotlightBonus: string | null;
  eventBonusGroups: EventBonusGroup[] | null;
  seasonData: SeasonData | null;
}

export function getTimelineEventExtras(event: PogoEvent): TimelineEventExtras | null {
  const extra = event.extraData;
  if (!extra) {
    return null;
  }

  const spotlightBonus =
    event.eventType === 'pokemon-spotlight-hour' && extra.spotlight?.bonus
      ? extra.spotlight.bonus
      : null;

  const raidHourBonuses =
    extra.isRaidHourSubEvent && extra.raidHourBonuses && extra.raidHourBonuses.length > 0
      ? extra.raidHourBonuses
      : null;

  const communityDayBonuses =
    event.eventType === 'community-day' &&
    extra.communityday?.bonuses &&
    extra.communityday.bonuses.length > 0
      ? extra.communityday.bonuses
      : null;

  const seasonData =
    (event.eventType === 'season' || event.eventType === 'season-daily-bonus') && extra.season
      ? extra.season
      : null;

  // Gate on at least one group having items (matching hasEventExtras()
  // exactly), but pass through every group once gated — an individual
  // empty-items group can still carry a startTime/endTime header, matching
  // source's own EventBonuses.vue rendering.
  const bonusGroups = extra.bonuses;
  const eventBonusGroups =
    bonusGroups && bonusGroups.some((group) => group.items.length > 0) ? bonusGroups : null;

  if (
    !spotlightBonus &&
    !raidHourBonuses &&
    !communityDayBonuses &&
    !seasonData &&
    !eventBonusGroups
  ) {
    return null;
  }

  return { communityDayBonuses, raidHourBonuses, spotlightBonus, eventBonusGroups, seasonData };
}
