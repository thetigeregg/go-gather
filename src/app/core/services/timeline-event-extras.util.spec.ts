import { PogoEvent } from '@go-gather/shared';
import { getTimelineEventExtras } from './timeline-event-extras.util';

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Test Event',
    eventType: 'raid-day',
    heading: 'Event',
    link: 'https://leekduck.com/events/test/',
    image: 'image.png',
    start: '2026-07-08T00:00:00.000',
    end: '2026-07-08T23:59:59.999',
    ...overrides,
  };
}

describe('getTimelineEventExtras', () => {
  it('returns null when the event has no extraData', () => {
    expect(getTimelineEventExtras(makeEvent({ extraData: undefined }))).toBeNull();
  });

  it('returns null when extraData has none of the 5 bonus sources', () => {
    expect(getTimelineEventExtras(makeEvent({ extraData: {} }))).toBeNull();
  });

  it('extracts a spotlight bonus only for pokemon-spotlight-hour events', () => {
    const event = makeEvent({
      eventType: 'pokemon-spotlight-hour',
      extraData: { spotlight: { name: 'Bulbasaur', canBeShiny: true, bonus: '2x Catch XP' } },
    });

    expect(getTimelineEventExtras(event)?.spotlightBonus).toBe('2x Catch XP');
  });

  it('does not extract a spotlight bonus for a non-spotlight event even if extraData.spotlight is present', () => {
    const event = makeEvent({
      eventType: 'raid-day',
      extraData: { spotlight: { name: 'Bulbasaur', canBeShiny: true, bonus: '2x Catch XP' } },
    });

    expect(getTimelineEventExtras(event)).toBeNull();
  });

  it('extracts raid-hour bonuses only when isRaidHourSubEvent is true and bonuses are non-empty', () => {
    const event = makeEvent({
      extraData: {
        isRaidHourSubEvent: true,
        raidHourBonuses: ['2x Catch XP', '3x Catch Stardust'],
      },
    });

    expect(getTimelineEventExtras(event)?.raidHourBonuses).toEqual([
      '2x Catch XP',
      '3x Catch Stardust',
    ]);
  });

  it('does not extract raid-hour bonuses when isRaidHourSubEvent is false', () => {
    const event = makeEvent({
      extraData: { isRaidHourSubEvent: false, raidHourBonuses: ['2x Catch XP'] },
    });

    expect(getTimelineEventExtras(event)).toBeNull();
  });

  it('does not extract raid-hour bonuses when the array is empty', () => {
    const event = makeEvent({ extraData: { isRaidHourSubEvent: true, raidHourBonuses: [] } });

    expect(getTimelineEventExtras(event)).toBeNull();
  });

  it('extracts community-day bonuses only for community-day events with a non-empty bonuses list', () => {
    const event = makeEvent({
      eventType: 'community-day',
      extraData: { communityday: { bonuses: [{ text: '3x Catch XP', image: 'icon.png' }] } },
    });

    expect(getTimelineEventExtras(event)?.communityDayBonuses).toEqual([
      { text: '3x Catch XP', image: 'icon.png' },
    ]);
  });

  it('does not extract community-day bonuses for a non-community-day event', () => {
    const event = makeEvent({
      eventType: 'raid-day',
      extraData: { communityday: { bonuses: [{ text: '3x Catch XP', image: 'icon.png' }] } },
    });

    expect(getTimelineEventExtras(event)).toBeNull();
  });

  it('extracts season data only for season events', () => {
    const seasonData = { note: null, dailyBonuses: [], seasonBonuses: [] };
    const event = makeEvent({ eventType: 'season', extraData: { season: seasonData } });

    expect(getTimelineEventExtras(event)?.seasonData).toBe(seasonData);
  });

  it('extracts season data for season-daily-bonus pseudo-events', () => {
    const seasonData = { note: null, dailyBonuses: [], seasonBonuses: [] };
    const event = makeEvent({
      eventType: 'season-daily-bonus',
      extraData: { season: seasonData },
    });

    expect(getTimelineEventExtras(event)?.seasonData).toBe(seasonData);
  });

  it('does not extract season data for a non-season event', () => {
    const seasonData = { note: null, dailyBonuses: [], seasonBonuses: [] };
    const event = makeEvent({ eventType: 'raid-day', extraData: { season: seasonData } });

    expect(getTimelineEventExtras(event)).toBeNull();
  });

  it('extracts event bonus groups (all groups, once any group has items)', () => {
    const groups = [
      { description: 'empty group', items: [] },
      { description: 'real group', items: [{ text: 'Bonus', image: 'icon.png' }] },
    ];
    const event = makeEvent({ extraData: { bonuses: groups } });

    expect(getTimelineEventExtras(event)?.eventBonusGroups).toBe(groups);
  });

  it('does not extract event bonus groups when every group has an empty items list', () => {
    const event = makeEvent({ extraData: { bonuses: [{ description: 'empty', items: [] }] } });

    expect(getTimelineEventExtras(event)).toBeNull();
  });

  it('combines multiple applicable sources on the same event', () => {
    const event = makeEvent({
      eventType: 'community-day',
      extraData: {
        communityday: { bonuses: [{ text: '3x Catch XP', image: 'icon.png' }] },
        bonuses: [{ description: 'g', items: [{ text: 'Bonus', image: 'icon.png' }] }],
      },
    });

    const result = getTimelineEventExtras(event);
    expect(result?.communityDayBonuses).toHaveLength(1);
    expect(result?.eventBonusGroups).toHaveLength(1);
  });
});
