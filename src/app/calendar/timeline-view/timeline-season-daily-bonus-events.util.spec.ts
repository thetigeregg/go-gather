import { PogoEvent, SeasonDailyBonus } from '@go-gather/shared';
import { generateSeasonDailyBonusEvents } from './timeline-season-daily-bonus-events.util';

function makeSeasonEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'forever-forward',
    name: 'Forever Forward',
    eventType: 'season',
    heading: 'Season',
    link: 'https://leekduck.com/events/forever-forward/',
    image: 'https://example.com/season.png',
    start: '2026-06-02T10:00:00.000',
    end: '2026-09-08T10:00:00.000',
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

describe('generateSeasonDailyBonusEvents', () => {
  it('returns nothing for a non-season event', () => {
    const result = generateSeasonDailyBonusEvents([
      makeSeasonEvent({
        eventType: 'community-day',
        extraData: { season: { note: null, dailyBonuses: [makeDailyBonus()], seasonBonuses: [] } },
      }),
    ]);

    expect(result).toEqual([]);
  });

  it('returns nothing when the season event has no season extraData', () => {
    expect(generateSeasonDailyBonusEvents([makeSeasonEvent()])).toEqual([]);
  });

  it('returns nothing when dailyBonuses is empty', () => {
    const result = generateSeasonDailyBonusEvents([
      makeSeasonEvent({
        extraData: { season: { note: null, dailyBonuses: [], seasonBonuses: [] } },
      }),
    ]);

    expect(result).toEqual([]);
  });

  it('projects one pseudo-event per matching weekday across the whole season range', () => {
    const result = generateSeasonDailyBonusEvents([
      makeSeasonEvent({
        start: '2026-07-01T10:00:00.000',
        end: '2026-07-21T10:00:00.000',
        extraData: {
          season: { note: null, dailyBonuses: [makeDailyBonus()], seasonBonuses: [] },
        },
      }),
    ]);

    // Fridays between 2026-07-01 and 2026-07-21 inclusive: 07-03, 07-10, 07-17
    expect(result.map((event) => event.start.slice(0, 10))).toEqual([
      '2026-07-03',
      '2026-07-10',
      '2026-07-17',
    ]);
  });

  it('names the pseudo-event from the first titled bonus group', () => {
    const result = generateSeasonDailyBonusEvents([
      makeSeasonEvent({
        start: '2026-07-03T10:00:00.000',
        end: '2026-07-03T10:00:00.000',
        extraData: {
          season: { note: null, dailyBonuses: [makeDailyBonus()], seasonBonuses: [] },
        },
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Friendship Friday');
  });

  it('falls back to "<Day> Bonus" when no bonus group has a title', () => {
    const result = generateSeasonDailyBonusEvents([
      makeSeasonEvent({
        start: '2026-07-03T10:00:00.000',
        end: '2026-07-03T10:00:00.000',
        extraData: {
          season: {
            note: null,
            dailyBonuses: [
              makeDailyBonus({ bonuses: [{ title: null, items: ['Some bonus line.'] }] }),
            ],
            seasonBonuses: [],
          },
        },
      }),
    ]);

    expect(result[0].name).toBe('Friday Bonus');
  });

  it('scopes the pseudo-event to a single day, with the matching dailyBonus entry only and no seasonBonuses', () => {
    const dailyBonus = makeDailyBonus();
    const result = generateSeasonDailyBonusEvents([
      makeSeasonEvent({
        start: '2026-07-03T10:00:00.000',
        end: '2026-07-03T10:00:00.000',
        extraData: {
          season: {
            note: 'ignored',
            dailyBonuses: [dailyBonus],
            seasonBonuses: [{ milestone: null, text: 'A season-long bonus', image: null }],
          },
        },
      }),
    ]);

    expect(result[0].start.slice(0, 10)).toBe(result[0].end.slice(0, 10));
    expect(result[0].extraData?.season).toEqual({
      note: null,
      dailyBonuses: [dailyBonus],
      seasonBonuses: [],
    });
    expect(result[0].extraData?.isSeasonDailyBonusSubEvent).toBe(true);
    expect(result[0].extraData?.parentEventId).toBe('forever-forward');
  });

  it('carries the parent event type, link, image, and heading', () => {
    const result = generateSeasonDailyBonusEvents([
      makeSeasonEvent({
        start: '2026-07-03T10:00:00.000',
        end: '2026-07-03T10:00:00.000',
        eventType: 'season',
        heading: 'Season',
        link: 'https://leekduck.com/events/forever-forward/',
        image: 'https://example.com/season.png',
        extraData: {
          season: { note: null, dailyBonuses: [makeDailyBonus()], seasonBonuses: [] },
        },
      }),
    ]);

    expect(result[0].eventType).toBe('season');
    expect(result[0].heading).toBe('Season');
    expect(result[0].link).toBe('https://leekduck.com/events/forever-forward/');
    expect(result[0].image).toBe('https://example.com/season.png');
  });

  it('gives each pseudo-event a unique, stable eventID derived from the parent + date', () => {
    const result = generateSeasonDailyBonusEvents([
      makeSeasonEvent({
        start: '2026-07-03T10:00:00.000',
        end: '2026-07-03T10:00:00.000',
        extraData: {
          season: { note: null, dailyBonuses: [makeDailyBonus()], seasonBonuses: [] },
        },
      }),
    ]);

    expect(result[0].eventID).toBe('forever-forward-daily-bonus-2026-07-03');
  });

  it('skips a weekday entry with no bonus groups', () => {
    const result = generateSeasonDailyBonusEvents([
      makeSeasonEvent({
        start: '2026-07-03T10:00:00.000',
        end: '2026-07-03T10:00:00.000',
        extraData: {
          season: {
            note: null,
            dailyBonuses: [makeDailyBonus({ bonuses: [] })],
            seasonBonuses: [],
          },
        },
      }),
    ]);

    expect(result).toEqual([]);
  });

  it('handles multiple season events, projecting each independently', () => {
    const result = generateSeasonDailyBonusEvents([
      makeSeasonEvent({
        eventID: 'season-a',
        start: '2026-07-03T10:00:00.000',
        end: '2026-07-03T10:00:00.000',
        extraData: { season: { note: null, dailyBonuses: [makeDailyBonus()], seasonBonuses: [] } },
      }),
      makeSeasonEvent({
        eventID: 'season-b',
        start: '2026-07-10T10:00:00.000',
        end: '2026-07-10T10:00:00.000',
        extraData: { season: { note: null, dailyBonuses: [makeDailyBonus()], seasonBonuses: [] } },
      }),
    ]);

    expect(result.map((event) => event.eventID)).toEqual([
      'season-a-daily-bonus-2026-07-03',
      'season-b-daily-bonus-2026-07-10',
    ]);
  });
});
