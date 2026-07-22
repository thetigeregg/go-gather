import { Dayjs } from 'dayjs';
import { Season } from '@go-gather/shared';

/** Ported from pogo-cal's src/utils/seasonChipLabel.ts. */
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Case-insensitive, whole-word/phrase; longer keys applied first so multi-word phrases win. */
export const CHIP_ABBREVIATIONS: Record<string, string> = {
  'GO Battle': 'GBL',
  and: '&',
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ABBREVIATION_RULES: { pattern: RegExp; replacement: string }[] = Object.entries(
  CHIP_ABBREVIATIONS
)
  .sort(([a], [b]) => b.length - a.length)
  .map(([phrase, replacement]) => ({
    pattern: new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi'),
    replacement,
  }));

export function formatSeasonChipLabel(title: string, dayOfWeek: number): string {
  let label = title;

  const weekday = WEEKDAY_NAMES[dayOfWeek];
  if (weekday) {
    label = label.replace(new RegExp(`\\b${weekday}s?\\b`, 'gi'), '');
  }

  for (const { pattern, replacement } of ABBREVIATION_RULES) {
    label = label.replace(pattern, replacement);
  }

  label = label.replace(/\s{2,}/g, ' ').trim();
  return label.length ? label : title;
}

/**
 * Ported from pogo-cal's src/components/Calendar/SeasonDailyChip.vue +
 * src/stores/seasons.ts's getDailyBonusForDate(). go-gather's
 * CalendarEventsService.season is a single current-season object (not
 * pogo-cal's array requiring a date-range search) and the chip only ever
 * renders for the current week anyway — so no Season.start/end range check
 * is needed at all, unlike the source. The "only show for the current week"
 * gate itself is ported as-is; it's intrinsic to the feature's UX, not a
 * dropped display preference (the toggle for turning the chip off entirely
 * was dropped, per the display-preferences decision — the chip is always
 * considered "on").
 */
export interface SeasonChip {
  label: string;
  extraCount: number;
  /** The season event's own eventID, for Phase 5 to wire a detail-click to. */
  sourceEventID: string;
}

export function isDayInCurrentWeek(
  dayInstance: Dayjs,
  today: Dayjs,
  firstDayIndex: number
): boolean {
  let weekStart = today.clone();
  while (weekStart.day() !== firstDayIndex) {
    weekStart = weekStart.subtract(1, 'day');
  }
  const weekEnd = weekStart.add(6, 'day');

  const day = dayInstance.startOf('day');
  return !day.isBefore(weekStart.startOf('day')) && !day.isAfter(weekEnd.startOf('day'));
}

export function getSeasonDailyChip(
  season: Season | undefined,
  dayInstance: Dayjs,
  today: Dayjs,
  firstDayIndex: number
): SeasonChip | null {
  if (!season || !isDayInCurrentWeek(dayInstance, today, firstDayIndex)) {
    return null;
  }

  // Note: matches the source's own asymmetry — the week-gating check above
  // offsets `today`-relative, but the day-of-week lookup here uses the raw,
  // non-offset day of the target date (there is no manual-offset concept in
  // this port at all, so this is now just "dayInstance.day()").
  const dayOfWeek = dayInstance.day();
  const bonus = season.dailyBonuses.find((entry) => entry.dayOfWeek === dayOfWeek);
  if (!bonus || bonus.bonuses.length === 0) {
    return null;
  }

  const firstTitle = bonus.bonuses[0].title;
  const label = firstTitle ? formatSeasonChipLabel(firstTitle, bonus.dayOfWeek) : 'Bonus';

  return {
    label,
    extraCount: Math.max(0, bonus.bonuses.length - 1),
    sourceEventID: season.eventID,
  };
}
