import { PogoEvent, PokemonBoss } from '@go-gather/shared';
import {
  getPokemonImagesFromBosses,
  getRaidBossesWithTierFallback,
  getSpriteImagesFromNames,
  getSpriteUrl,
} from './event-sprite-url.util';

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Test Event',
    eventType: 'raid-battles',
    heading: 'Event',
    link: 'https://leekduck.com/events/test/',
    image: 'image.png',
    start: '2026-07-08T00:00:00.000',
    end: '2026-07-08T00:00:00.000',
    ...overrides,
  };
}

function makeBoss(overrides: Partial<PokemonBoss> = {}): PokemonBoss {
  return {
    name: 'Bulbasaur',
    image: 'https://leekduck-image.example/bulbasaur.png',
    canBeShiny: false,
    ...overrides,
  };
}

describe('getSpriteUrl', () => {
  it('resolves a known Pokemon to its static sprite URL', () => {
    expect(getSpriteUrl('Bulbasaur')).toBe(
      'https://raw.githubusercontent.com/mgrann03/pokemon-resources/refs/heads/main/graphics/pogo/bulbasaur.png'
    );
  });

  it('applies the isMega option as a suffix default when no explicit suffix is given', () => {
    expect(getSpriteUrl('Venusaur', undefined, { isMega: true })).toBe(
      'https://raw.githubusercontent.com/mgrann03/pokemon-resources/refs/heads/main/graphics/pogo/venusaur-mega.png'
    );
  });

  it('falls back to the caller-supplied fallback URL when no sprite resolves', () => {
    expect(
      getSpriteUrl(
        'Not A Real Pokemon',
        undefined,
        undefined,
        'https://leekduck-image.example/x.png'
      )
    ).toBe('https://leekduck-image.example/x.png');
  });

  it('returns null when nothing resolves and no fallback is given', () => {
    expect(getSpriteUrl('Not A Real Pokemon')).toBeNull();
  });
});

describe('getRaidBossesWithTierFallback', () => {
  it('returns an empty array when the event has no raid bosses', () => {
    const event = makeEvent({ extraData: {} });
    expect(getRaidBossesWithTierFallback(event)).toEqual([]);
  });

  it('returns all bosses when no excludeTiers option is given', () => {
    const bosses = [makeBoss({ raidType: 'Tier 1' }), makeBoss({ raidType: 'Tier 3' })];
    const event = makeEvent({ extraData: { raidbattles: { bosses } } });
    expect(getRaidBossesWithTierFallback(event)).toBe(bosses);
  });

  it('filters out excluded tiers when the result stays non-empty', () => {
    const tier1 = makeBoss({ name: 'Tier1Boss', raidType: 'Tier 1' });
    const tier5 = makeBoss({ name: 'Tier5Boss', raidType: 'Tier 5' });
    const event = makeEvent({ extraData: { raidbattles: { bosses: [tier1, tier5] } } });

    expect(getRaidBossesWithTierFallback(event, { excludeTiers: ['Tier 1'] })).toEqual([tier5]);
  });

  it('progressively relaxes exclusions if applying all of them would empty the result', () => {
    const tier1 = makeBoss({ name: 'Tier1Boss', raidType: 'Tier 1' });
    const tier3 = makeBoss({ name: 'Tier3Boss', raidType: 'Tier 3' });
    const event = makeEvent({ extraData: { raidbattles: { bosses: [tier1, tier3] } } });

    // Excluding both Tier 1 and Tier 3 would empty the list, so it falls back to excluding just one.
    expect(getRaidBossesWithTierFallback(event, { excludeTiers: ['Tier 1', 'Tier 3'] })).toEqual([
      tier3,
    ]);
  });
});

describe('getPokemonImagesFromBosses', () => {
  it('resolves a boss with an exact sprite form via getSpriteUrl', () => {
    const event = makeEvent({
      extraData: { raidbattles: { bosses: [makeBoss({ name: 'Bulbasaur' })] } },
    });
    const images = getPokemonImagesFromBosses(event);

    expect(images).toHaveLength(1);
    expect(images[0].imageUrl).toBe(
      'https://raw.githubusercontent.com/mgrann03/pokemon-resources/refs/heads/main/graphics/pogo/bulbasaur.png'
    );
    expect(images[0].fallbackImageUrl).toBe('https://leekduck-image.example/bulbasaur.png');
  });

  it('prefers the boss image when the requested form has no exact sprite match', () => {
    const boss = makeBoss({
      name: 'Bulbasaur (Some Unmapped Form)',
      image: 'https://leekduck-image.example/boss.png',
    });
    const event = makeEvent({ extraData: { raidbattles: { bosses: [boss] } } });

    const images = getPokemonImagesFromBosses(event);
    expect(images[0].imageUrl).toBe('https://leekduck-image.example/boss.png');
  });

  it('stamps shieldCount only for Super Mega raidType bosses', () => {
    const superMegaBoss = makeBoss({ name: 'Mega Dragonite', raidType: 'Super Mega' });
    const regularBoss = makeBoss({ name: 'Dragonite', raidType: 'Tier 5' });
    const event = makeEvent({
      extraData: { raidbattles: { bosses: [superMegaBoss, regularBoss] } },
    });

    const images = getPokemonImagesFromBosses(event);
    expect(images[0].shieldCount).toBe(10);
    expect(images[1].shieldCount).toBeUndefined();
  });
});

describe('getSpriteImagesFromNames', () => {
  it('resolves each name to its sprite URL', () => {
    const images = getSpriteImagesFromNames(['Bulbasaur', 'Charizard']);
    expect(images).toHaveLength(2);
    expect(images[0].name).toBe('Bulbasaur');
    expect(images[1].imageUrl).toContain('charizard');
  });

  it('applies the megaFallback suffix when a name has no suffix of its own', () => {
    const images = getSpriteImagesFromNames(['Venusaur'], undefined, true);
    expect(images[0].imageUrl).toBe(
      'https://raw.githubusercontent.com/mgrann03/pokemon-resources/refs/heads/main/graphics/pogo/venusaur-mega.png'
    );
  });

  it('does not apply the megaFallback suffix when the name already parses its own suffix', () => {
    const images = getSpriteImagesFromNames(['Mega Charizard X'], undefined, true);
    expect(images[0].imageUrl).toContain('charizard-megax');
  });
});
