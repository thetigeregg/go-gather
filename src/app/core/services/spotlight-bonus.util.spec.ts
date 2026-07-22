import { PogoEvent } from '@go-gather/shared';
import { getSpotlightBonusInfo, getSpotlightBonusTypeIcon } from './spotlight-bonus.util';

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Eevee Spotlight Hour',
    eventType: 'pokemon-spotlight-hour',
    heading: 'Event',
    link: 'https://leekduck.com/events/test/',
    image: 'image.png',
    start: '2026-07-08T00:00:00.000',
    end: '2026-07-08T00:00:00.000',
    ...overrides,
  };
}

describe('getSpotlightBonusInfo', () => {
  it('returns null for a non-spotlight-hour event', () => {
    const event = makeEvent({
      eventType: 'raid-day',
      extraData: { spotlight: { name: 'x', canBeShiny: false, bonus: 'Catch XP' } },
    });
    expect(getSpotlightBonusInfo(event)).toBeNull();
  });

  it('returns null when there is no bonus string', () => {
    const event = makeEvent({ extraData: { spotlight: { name: 'x', canBeShiny: false } } });
    expect(getSpotlightBonusInfo(event)).toBeNull();
  });

  it('parses "Catch XP" as catch/xp', () => {
    const event = makeEvent({
      extraData: { spotlight: { name: 'x', canBeShiny: false, bonus: 'Catch XP' } },
    });
    expect(getSpotlightBonusInfo(event)).toEqual({ category: 'catch', bonusType: 'xp' });
  });

  it('parses "Catch Stardust" as catch/stardust', () => {
    const event = makeEvent({
      extraData: { spotlight: { name: 'x', canBeShiny: false, bonus: 'Catch Stardust' } },
    });
    expect(getSpotlightBonusInfo(event)).toEqual({ category: 'catch', bonusType: 'stardust' });
  });

  it('parses "Evolution Candy" as evolve/candy', () => {
    const event = makeEvent({
      extraData: { spotlight: { name: 'x', canBeShiny: false, bonus: 'Evolution Candy' } },
    });
    expect(getSpotlightBonusInfo(event)).toEqual({ category: 'evolve', bonusType: 'candy' });
  });

  it('parses "Transfer Candy" as transfer/candy', () => {
    const event = makeEvent({
      extraData: { spotlight: { name: 'x', canBeShiny: false, bonus: 'Transfer Candy' } },
    });
    expect(getSpotlightBonusInfo(event)).toEqual({ category: 'transfer', bonusType: 'candy' });
  });

  it('returns null when no bonus type matches', () => {
    const event = makeEvent({
      extraData: { spotlight: { name: 'x', canBeShiny: false, bonus: 'Something Else' } },
    });
    expect(getSpotlightBonusInfo(event)).toBeNull();
  });

  it('returns null when a bonus type matches but no category matches', () => {
    const event = makeEvent({
      extraData: { spotlight: { name: 'x', canBeShiny: false, bonus: 'Double XP for everyone' } },
    });
    expect(getSpotlightBonusInfo(event)).toBeNull();
  });
});

describe('getSpotlightBonusTypeIcon', () => {
  it('maps each bonus type to its icon path', () => {
    expect(getSpotlightBonusTypeIcon('xp')).toBe('/assets/pokemon-icons/xp.png');
    expect(getSpotlightBonusTypeIcon('stardust')).toBe('/assets/pokemon-icons/stardust.png');
    expect(getSpotlightBonusTypeIcon('candy')).toBe('/assets/pokemon-icons/candy.png');
  });
});
