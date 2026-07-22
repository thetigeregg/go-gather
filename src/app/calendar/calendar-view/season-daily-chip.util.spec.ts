import dayjs from 'dayjs';
import { Season, SeasonDailyBonus } from '@go-gather/shared';
import {
  formatSeasonChipLabel,
  getSeasonDailyChip,
  isDayInCurrentWeek,
} from './season-daily-chip.util';

describe('formatSeasonChipLabel', () => {
  it('strips the weekday word (and its plural) case-insensitively', () => {
    expect(formatSeasonChipLabel('Catch Mastery Mondays', 1)).toBe('Catch Mastery');
    expect(formatSeasonChipLabel('monday Catch Mastery', 1)).toBe('Catch Mastery');
  });

  it('applies abbreviations, longer phrases first', () => {
    expect(formatSeasonChipLabel('GO Battle League Sundays', 0)).toBe('GBL League');
    expect(formatSeasonChipLabel('Catching and Hatching', 2)).toBe('Catching & Hatching');
  });

  it('collapses repeated whitespace left over from stripping', () => {
    expect(formatSeasonChipLabel('Raids  and  Research', 3)).toBe('Raids & Research');
  });

  it('falls back to the original title when stripping empties the label', () => {
    expect(formatSeasonChipLabel('Sunday', 0)).toBe('Sunday');
  });

  it('leaves the title untouched when dayOfWeek is out of range', () => {
    expect(formatSeasonChipLabel('Catch Mastery', 7)).toBe('Catch Mastery');
  });
});

describe('isDayInCurrentWeek', () => {
  it('is true for today itself', () => {
    const today = dayjs('2026-07-08'); // Wednesday
    expect(isDayInCurrentWeek(today, today, 0)).toBe(true);
  });

  it("is true at the current week's start and end boundaries", () => {
    const today = dayjs('2026-07-08'); // Wednesday, firstDayIndex 0 -> week is Jul 5 - Jul 11
    expect(isDayInCurrentWeek(dayjs('2026-07-05'), today, 0)).toBe(true);
    expect(isDayInCurrentWeek(dayjs('2026-07-11'), today, 0)).toBe(true);
  });

  it('is false just outside the current week boundaries', () => {
    const today = dayjs('2026-07-08');
    expect(isDayInCurrentWeek(dayjs('2026-07-04'), today, 0)).toBe(false);
    expect(isDayInCurrentWeek(dayjs('2026-07-12'), today, 0)).toBe(false);
  });

  it('shifts week boundaries when firstDayIndex changes', () => {
    const today = dayjs('2026-07-08'); // Wednesday, firstDayIndex 1 (Monday) -> week is Jul 6 - Jul 12
    expect(isDayInCurrentWeek(dayjs('2026-07-05'), today, 1)).toBe(false);
    expect(isDayInCurrentWeek(dayjs('2026-07-06'), today, 1)).toBe(true);
    expect(isDayInCurrentWeek(dayjs('2026-07-12'), today, 1)).toBe(true);
  });
});

function makeSeason(overrides: Partial<Season> = {}): Season {
  return {
    name: 'Forever Forward',
    eventID: 'season-23-forever-forward',
    link: 'https://leekduck.com/events/season-23-forever-forward/',
    start: '2026-06-02T10:00:00.000',
    end: '2026-09-08T10:00:00.000',
    note: null,
    dailyBonuses: [],
    seasonBonuses: [],
    ...overrides,
  };
}

function makeDailyBonus(overrides: Partial<SeasonDailyBonus> = {}): SeasonDailyBonus {
  return {
    day: 'Wednesday',
    dayOfWeek: 3,
    bonuses: [{ title: 'Catch Mastery Wednesdays', items: ['2x Catch XP'] }],
    footnote: null,
    ...overrides,
  };
}

describe('getSeasonDailyChip', () => {
  const today = dayjs('2026-07-08'); // Wednesday, day 3

  it('returns null when there is no season', () => {
    expect(getSeasonDailyChip(undefined, today, today, 0)).toBeNull();
  });

  it('returns null for a day outside the current week', () => {
    const season = makeSeason({ dailyBonuses: [makeDailyBonus()] });
    expect(getSeasonDailyChip(season, dayjs('2026-08-01'), today, 0)).toBeNull();
  });

  it('returns null when there is no bonus for that day of week', () => {
    const season = makeSeason({ dailyBonuses: [makeDailyBonus({ dayOfWeek: 1 })] }); // Monday only
    expect(getSeasonDailyChip(season, today, today, 0)).toBeNull();
  });

  it('returns null when the matching bonus has an empty bonuses list', () => {
    const season = makeSeason({ dailyBonuses: [makeDailyBonus({ bonuses: [] })] });
    expect(getSeasonDailyChip(season, today, today, 0)).toBeNull();
  });

  it("resolves the label from the first bonus group's title, formatted", () => {
    const season = makeSeason({ dailyBonuses: [makeDailyBonus()] });
    const chip = getSeasonDailyChip(season, today, today, 0);
    expect(chip?.label).toBe('Catch Mastery');
    expect(chip?.sourceEventID).toBe('season-23-forever-forward');
  });

  it('falls back to "Bonus" when the first bonus group has no title', () => {
    const season = makeSeason({
      dailyBonuses: [makeDailyBonus({ bonuses: [{ title: null, items: ['Something'] }] })],
    });
    expect(getSeasonDailyChip(season, today, today, 0)?.label).toBe('Bonus');
  });

  it('reports extraCount as one less than the number of bonus groups, floored at 0', () => {
    const single = makeSeason({ dailyBonuses: [makeDailyBonus()] });
    expect(getSeasonDailyChip(single, today, today, 0)?.extraCount).toBe(0);

    const multiple = makeSeason({
      dailyBonuses: [
        makeDailyBonus({
          bonuses: [
            { title: 'Catch Mastery', items: ['a'] },
            { title: 'Bonus Two', items: ['b'] },
            { title: 'Bonus Three', items: ['c'] },
          ],
        }),
      ],
    });
    expect(getSeasonDailyChip(multiple, today, today, 0)?.extraCount).toBe(2);
  });
});
