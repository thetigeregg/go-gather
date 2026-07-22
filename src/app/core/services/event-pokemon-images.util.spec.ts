import { PogoEvent, PokemonBoss } from '@go-gather/shared';
import {
  getEventPokemonImages,
  getEventSpriteEffect,
  hasEventPokemonImage,
  resolveBossImages,
  resolveCommunityDayImages,
  resolveMaxBattleImages,
  resolveMaxMondayImages,
  resolvePokestopShowcaseImages,
  resolveRaidBattleImages,
  resolveRaidDayImages,
  resolveRaidHourImages,
  resolveSpotlightImages,
} from './event-pokemon-images.util';
import { EventWithExtraData } from './event-sprite-url.util';

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

function withExtraData(event: PogoEvent): EventWithExtraData {
  return { ...event, extraData: event.extraData ?? {} };
}

function makeBoss(overrides: Partial<PokemonBoss> = {}): PokemonBoss {
  return {
    name: 'Bulbasaur',
    image: 'https://leekduck-image.example/bulbasaur.png',
    canBeShiny: false,
    ...overrides,
  };
}

describe('getEventSpriteEffect', () => {
  it('returns SHADOW for a shadow-raid event', () => {
    const event = makeEvent({ eventType: 'raid-battles', name: 'Shadow Mewtwo in Shadow Raids' });
    expect(getEventSpriteEffect(event)).toBe('shadow');
  });

  it('returns DYNAMAX for a max-mondays event', () => {
    const event = makeEvent({ eventType: 'max-mondays', name: 'Dynamax Gengar during Max Monday' });
    expect(getEventSpriteEffect(event)).toBe('dynamax');
  });

  it('returns DYNAMAX for a max-battles event with a Dynamax title', () => {
    const event = makeEvent({
      eventType: 'max-battles',
      name: 'Dynamax Charizard Max Battle Weekend',
    });
    expect(getEventSpriteEffect(event)).toBe('dynamax');
  });

  it('returns undefined for an event with no special effect', () => {
    const event = makeEvent({ eventType: 'community-day', name: 'Bulbasaur Community Day' });
    expect(getEventSpriteEffect(event)).toBeUndefined();
  });
});

describe('resolveBossImages', () => {
  it('resolves images from raidbattles bosses', () => {
    const event = withExtraData(
      makeEvent({ extraData: { raidbattles: { bosses: [makeBoss()] } } })
    );
    expect(resolveBossImages(event)).toHaveLength(1);
  });

  it('returns null when there are no bosses', () => {
    const event = withExtraData(makeEvent({ extraData: {} }));
    expect(resolveBossImages(event)).toBeNull();
  });
});

describe('resolveRaidBattleImages', () => {
  it('prefers bosses data when present', () => {
    const event = withExtraData(
      makeEvent({ extraData: { raidbattles: { bosses: [makeBoss()] } } })
    );
    expect(resolveRaidBattleImages(event)).toHaveLength(1);
  });

  it('falls back to title extraction for a mega raid, applying the mega suffix', () => {
    const event = withExtraData(
      makeEvent({ eventType: 'raid-battles', name: 'Mega Venusaur in Mega Raids', extraData: {} })
    );
    const images = resolveRaidBattleImages(event);
    expect(images?.[0].name).toBe('Venusaur');
    expect(images?.[0].imageUrl).toContain('venusaur-mega');
  });

  it('stamps shieldCount for super-mega-raid titles', () => {
    const event = withExtraData(
      makeEvent({
        eventType: 'raid-battles',
        name: 'Mega Dragonite in Super Mega Raids',
        extraData: {},
      })
    );
    const images = resolveRaidBattleImages(event);
    expect(images?.[0].shieldCount).toBe(10);
  });

  it('returns null when nothing matches', () => {
    const event = withExtraData(
      makeEvent({ eventType: 'raid-battles', name: 'Something Unrecognized', extraData: {} })
    );
    expect(resolveRaidBattleImages(event)).toBeNull();
  });
});

describe('resolveRaidHourImages', () => {
  it('resolves images from a Raid Hour title', () => {
    const event = withExtraData(makeEvent({ name: 'Machamp Raid Hour' }));
    expect(resolveRaidHourImages(event)?.[0].name).toBe('Machamp');
  });

  it('returns null for a non-matching title', () => {
    const event = withExtraData(makeEvent({ name: 'Community Day' }));
    expect(resolveRaidHourImages(event)).toBeNull();
  });
});

describe('resolveRaidDayImages', () => {
  it('prefers bosses data when present', () => {
    const event = withExtraData(
      makeEvent({ extraData: { raidbattles: { bosses: [makeBoss()] } } })
    );
    expect(resolveRaidDayImages(event)).toHaveLength(1);
  });

  it('returns an empty array for a known title exception', () => {
    const event = withExtraData(makeEvent({ name: 'Fashion Raid Day', extraData: {} }));
    expect(resolveRaidDayImages(event)).toEqual([]);
  });

  it('returns an empty array for a generic placeholder title', () => {
    const event = withExtraData(makeEvent({ name: 'Shadow Raid Day', extraData: {} }));
    expect(resolveRaidDayImages(event)).toEqual([]);
  });

  it('applies a Mega suffix and renames for a "Mega ... Raid Day" title', () => {
    const event = withExtraData(makeEvent({ name: 'Venusaur Mega Raid Day', extraData: {} }));
    const images = resolveRaidDayImages(event);
    expect(images?.[0].name).toBe('Mega Venusaur');
    expect(images?.[0].imageUrl).toContain('venusaur-mega');
  });

  it('does not guess a Mega X/Y suffix for Pokemon with split Mega forms', () => {
    const event = withExtraData(makeEvent({ name: 'Charizard Mega Raid Day', extraData: {} }));
    const images = resolveRaidDayImages(event);
    // Ambiguous (could be Mega X or Mega Y) — renders the plain sprite, not a guessed form.
    expect(images?.[0].imageUrl).toContain('graphics/pogo/charizard.png');
  });

  it('stamps shieldCount for a "Super Mega ... Raid Day" title', () => {
    const event = withExtraData(
      makeEvent({ name: 'Dragonite Super Mega Raid Day', extraData: {} })
    );
    const images = resolveRaidDayImages(event);
    expect(images?.[0].shieldCount).toBe(10);
  });

  it('returns null for a non-matching title', () => {
    const event = withExtraData(makeEvent({ name: 'Something Unrecognized', extraData: {} }));
    expect(resolveRaidDayImages(event)).toBeNull();
  });
});

describe('resolveMaxMondayImages', () => {
  it('resolves an image from a Max Monday title', () => {
    const event = withExtraData(
      makeEvent({ name: 'Dynamax Gengar during Max Monday', extraData: {} })
    );
    expect(resolveMaxMondayImages(event)?.[0].name).toBe('Gengar');
  });

  it('returns null for a non-matching title', () => {
    const event = withExtraData(makeEvent({ name: 'Community Day', extraData: {} }));
    expect(resolveMaxMondayImages(event)).toBeNull();
  });
});

describe('resolveSpotlightImages', () => {
  it('prefers a structured spotlight.list payload', () => {
    const event = withExtraData(
      makeEvent({
        extraData: {
          spotlight: {
            name: 'x',
            canBeShiny: false,
            list: [{ name: 'Eevee', canBeShiny: true, image: 'x.png' }],
          },
        },
      })
    );
    expect(resolveSpotlightImages(event)?.[0].name).toBe('Eevee');
  });

  it('falls back to spotlight.name when there is no list', () => {
    const event = withExtraData(
      makeEvent({ extraData: { spotlight: { name: 'Eevee', canBeShiny: true } } })
    );
    expect(resolveSpotlightImages(event)?.[0].name).toBe('Eevee');
  });

  it('falls back to a generic name when only spotlight.image is present', () => {
    const event = withExtraData(
      makeEvent({ extraData: { spotlight: { name: '', canBeShiny: false, image: 'x.png' } } })
    );
    const images = resolveSpotlightImages(event);
    expect(images?.[0]).toEqual({ name: 'Spotlight Pokemon', imageUrl: 'x.png' });
  });

  it('falls back to title parsing when there is no spotlight data at all', () => {
    const event = withExtraData(makeEvent({ name: 'Eevee Spotlight Hour', extraData: {} }));
    expect(resolveSpotlightImages(event)?.[0].name).toBe('Eevee');
  });

  it('returns null when neither spotlight data nor a matching title exist', () => {
    const event = withExtraData(makeEvent({ name: 'Community Day', extraData: {} }));
    expect(resolveSpotlightImages(event)).toBeNull();
  });
});

describe('resolveCommunityDayImages', () => {
  it('prefers spawns data when present', () => {
    const event = withExtraData(
      makeEvent({
        extraData: {
          communityday: { spawns: [{ name: 'Bulbasaur', image: 'x.png', canBeShiny: true }] },
        },
      })
    );
    expect(resolveCommunityDayImages(event)?.[0].name).toBe('Bulbasaur');
  });

  it('falls back to title parsing, resolving real Pokemon names', () => {
    const event = withExtraData(makeEvent({ name: 'Bulbasaur Community Day', extraData: {} }));
    expect(resolveCommunityDayImages(event)?.[0].name).toBe('Bulbasaur');
  });

  it('returns null for a pre-reveal placeholder title with no real Pokemon name', () => {
    const event = withExtraData(makeEvent({ name: 'August Community Day', extraData: {} }));
    expect(resolveCommunityDayImages(event)).toBeNull();
  });

  it('returns null for a non-matching title', () => {
    const event = withExtraData(makeEvent({ name: 'Something Unrecognized', extraData: {} }));
    expect(resolveCommunityDayImages(event)).toBeNull();
  });
});

describe('resolveMaxBattleImages', () => {
  it('resolves a Gigantamax title to a Gmax-effect sprite', () => {
    const event = withExtraData(
      makeEvent({ name: 'Gigantamax Charizard Max Battle Day', extraData: {} })
    );
    const images = resolveMaxBattleImages(event);
    expect(images?.[0].name).toBe('Gigantamax Charizard');
    expect(images?.[0].effect).toBe('gigantamax');
  });

  it('falls back to a plain sprite (no effect, no "Gigantamax " rename) when the named Pokemon has no Gigantamax asset', () => {
    const event = withExtraData(
      makeEvent({ name: 'Gigantamax Bulbasaur Max Battle Day', extraData: {} })
    );
    const images = resolveMaxBattleImages(event);
    expect(images?.[0].name).toBe('Bulbasaur');
    expect(images?.[0].imageUrl).toContain('bulbasaur.png');
    expect(images?.[0].effect).toBeUndefined();
  });

  it('resolves a Dynamax title to a plain sprite', () => {
    const event = withExtraData(
      makeEvent({ name: 'Dynamax Machamp Max Battle Weekend', extraData: {} })
    );
    expect(resolveMaxBattleImages(event)?.[0].name).toBe('Machamp');
  });

  it('falls back to the event image when neither title pattern matches', () => {
    const event = withExtraData(
      makeEvent({ name: 'Max Battle Weekend', image: 'x.png', extraData: {} })
    );
    expect(resolveMaxBattleImages(event)).toEqual([{ name: 'Max Battle', imageUrl: 'x.png' }]);
  });

  it('returns null when nothing matches and there is no event image', () => {
    const event = withExtraData(
      makeEvent({ name: 'Max Battle Weekend', image: '', extraData: {} })
    );
    expect(resolveMaxBattleImages(event)).toBeNull();
  });
});

describe('resolvePokestopShowcaseImages', () => {
  it('resolves Pokemon names from a showcase title', () => {
    const event = withExtraData(makeEvent({ name: 'Bulbasaur PokéStop Showcase', extraData: {} }));
    expect(resolvePokestopShowcaseImages(event)?.[0].name).toBe('Bulbasaur');
  });

  it('returns an empty array for a generic type-based showcase', () => {
    const event = withExtraData(
      makeEvent({ name: 'Grass-type PokéStop Showcases', extraData: {} })
    );
    expect(resolvePokestopShowcaseImages(event)).toEqual([]);
  });

  it('returns null for a non-matching title', () => {
    const event = withExtraData(makeEvent({ name: 'Something Unrecognized', extraData: {} }));
    expect(resolvePokestopShowcaseImages(event)).toBeNull();
  });
});

describe('getEventPokemonImages (dispatcher)', () => {
  it('dispatches to the resolver for a known event type', () => {
    const event = makeEvent({ eventType: 'community-day', name: 'Bulbasaur Community Day' });
    expect(getEventPokemonImages(event)).toHaveLength(1);
  });

  it('returns an empty array for an event type with no resolver (e.g. elite-raids)', () => {
    const event = makeEvent({ eventType: 'elite-raids', name: 'Elite Raid Day' });
    expect(getEventPokemonImages(event)).toEqual([]);
  });

  it('falls back to the spotlight resolver for a spotlight sub-event of an otherwise-unresolved type', () => {
    const event = makeEvent({
      eventType: 'elite-raids',
      name: 'Some Sub Event',
      extraData: { isSpotlightSubEvent: true, spotlight: { name: 'Eevee', canBeShiny: true } },
    });
    expect(getEventPokemonImages(event)[0].name).toBe('Eevee');
  });

  it('applies the event-level sprite effect to images without their own effect', () => {
    const event = makeEvent({
      eventType: 'raid-battles',
      name: 'Shadow Mewtwo in Shadow Raids',
      extraData: {},
    });
    const images = getEventPokemonImages(event);
    expect(images[0].effect).toBe('shadow');
  });

  it('does not override a per-sprite effect already set by the resolver (Gigantamax)', () => {
    const event = makeEvent({
      eventType: 'max-battles',
      name: 'Gigantamax Charizard Max Battle Day',
      extraData: {},
    });
    const images = getEventPokemonImages(event);
    expect(images[0].effect).toBe('gigantamax');
  });
});

describe('hasEventPokemonImage', () => {
  it('is true when the event resolves at least one image', () => {
    const event = makeEvent({ eventType: 'community-day', name: 'Bulbasaur Community Day' });
    expect(hasEventPokemonImage(event)).toBe(true);
  });

  it('is false when the event resolves no images', () => {
    const event = makeEvent({ eventType: 'elite-raids', name: 'Elite Raid Day' });
    expect(hasEventPokemonImage(event)).toBe(false);
  });
});
