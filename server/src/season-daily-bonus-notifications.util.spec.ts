import type { Season, SeasonDailyBonus } from '@go-gather/shared';
import { generateSeasonDailyBonusCandidateEvents } from './season-daily-bonus-notifications.util';

function makeSeason(overrides: Partial<Season> = {}): Season {
  return {
    name: 'Forever Forward',
    eventID: 'season-1',
    link: 'https://leekduck.com/events/season-1/',
    start: '2026-07-01T10:00:00.000',
    end: '2026-07-21T10:00:00.000',
    note: null,
    dailyBonuses: [],
    seasonBonuses: [],
    ...overrides,
  };
}

function makeDailyBonus(overrides: Partial<SeasonDailyBonus> = {}): SeasonDailyBonus {
  return {
    day: 'Friday',
    dayOfWeek: 5,
    bonuses: [{ title: 'Friendship Friday', items: ['Up to two additional Special Trades.'] }],
    footnote: null,
    ...overrides,
  };
}

describe('generateSeasonDailyBonusCandidateEvents', () => {
  it('returns nothing when dailyBonuses is empty', () => {
    expect(generateSeasonDailyBonusCandidateEvents(makeSeason())).toEqual([]);
  });

  it('projects one candidate per matching weekday across the whole season range', () => {
    const result = generateSeasonDailyBonusCandidateEvents(
      makeSeason({ dailyBonuses: [makeDailyBonus()] })
    );

    // Fridays between 2026-07-01 and 2026-07-21 inclusive: 07-03, 07-10, 07-17
    expect(result.map((event) => event.start.slice(0, 10))).toEqual([
      '2026-07-03',
      '2026-07-10',
      '2026-07-17',
    ]);
  });

  it('sets eventType, dayOfWeek, name from the first titled bonus group, and a bonus-line heading', () => {
    const result = generateSeasonDailyBonusCandidateEvents(
      makeSeason({
        start: '2026-07-03T10:00:00.000',
        end: '2026-07-03T10:00:00.000',
        dailyBonuses: [makeDailyBonus()],
      })
    );

    expect(result).toHaveLength(1);
    expect(result[0].eventType).toBe('season-daily-bonus');
    expect(result[0].dayOfWeek).toBe(5);
    expect(result[0].name).toBe('Friendship Friday');
    expect(result[0].heading).toBe('Up to two additional Special Trades.');
  });

  it('falls back to "<Day> Bonus" when no bonus group has a title', () => {
    const result = generateSeasonDailyBonusCandidateEvents(
      makeSeason({
        start: '2026-07-03T10:00:00.000',
        end: '2026-07-03T10:00:00.000',
        dailyBonuses: [makeDailyBonus({ bonuses: [{ title: null, items: ['Some bonus line.'] }] })],
      })
    );

    expect(result[0].name).toBe('Friday Bonus');
    expect(result[0].heading).toBe('Some bonus line.');
  });

  it('skips a weekday entry with no bonus groups', () => {
    const result = generateSeasonDailyBonusCandidateEvents(
      makeSeason({
        start: '2026-07-03T10:00:00.000',
        end: '2026-07-03T10:00:00.000',
        dailyBonuses: [makeDailyBonus({ bonuses: [] })],
      })
    );

    expect(result).toEqual([]);
  });

  it('gives each candidate a unique, stable eventID derived from the season + date', () => {
    const result = generateSeasonDailyBonusCandidateEvents(
      makeSeason({
        start: '2026-07-03T10:00:00.000',
        end: '2026-07-03T10:00:00.000',
        dailyBonuses: [makeDailyBonus()],
      })
    );

    expect(result[0].eventId).toBe('season-1-daily-bonus-2026-07-03');
  });
});
