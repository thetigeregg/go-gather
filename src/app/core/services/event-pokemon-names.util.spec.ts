import { PogoEvent } from '@go-gather/shared';
import {
  extractPokemonNameFromMaxMonday,
  extractPokemonNameFromRaidBattle,
  extractPokemonNamesFromRaidHour,
  extractPokemonNamesFromSpotlightHour,
  parseDynamaxMaxBattleName,
  parseEventPokemonNames,
  parseGigantamaxMaxBattleName,
  parsePokemonNameAndSuffix,
} from './event-pokemon-names.util';

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

describe('parseEventPokemonNames', () => {
  it('splits a special-case parenthetical-forme-with-ampersand title', () => {
    expect(parseEventPokemonNames('Deoxys (Attack & Speed Forme)')).toEqual([
      'Deoxys (Attack Forme)',
      'Deoxys (Speed Forme)',
    ]);
  });

  it('splits comma-separated names, handling a trailing "and"', () => {
    expect(parseEventPokemonNames('Pokemon A, Pokemon B, and Pokemon C')).toEqual([
      'Pokemon A',
      'Pokemon B',
      'Pokemon C',
    ]);
  });

  it('splits comma-separated names with a leading "and " on a middle part', () => {
    expect(parseEventPokemonNames('Pokemon A, and Pokemon B')).toEqual(['Pokemon A', 'Pokemon B']);
  });

  it('further splits the last comma-separated part when it itself contains " and " (no Oxford comma)', () => {
    expect(parseEventPokemonNames('Pokemon A, Pokemon B and Pokemon C')).toEqual([
      'Pokemon A',
      'Pokemon B',
      'Pokemon C',
    ]);
  });

  it('splits on "and" alone when there are no commas', () => {
    expect(parseEventPokemonNames('Mega Latias and Mega Latios')).toEqual([
      'Mega Latias',
      'Mega Latios',
    ]);
  });

  it('returns a single-element array for a lone Pokemon name', () => {
    expect(parseEventPokemonNames('Bulbasaur')).toEqual(['Bulbasaur']);
  });
});

describe('extractPokemonNamesFromRaidHour', () => {
  it('extracts the Pokemon name(s) from a Raid Hour title', () => {
    expect(extractPokemonNamesFromRaidHour('Machamp Raid Hour')).toEqual(['Machamp']);
  });

  it('decodes HTML entities before matching', () => {
    expect(extractPokemonNamesFromRaidHour('Mr. Mime &amp; Raid Hour')).toEqual(['Mr. Mime &']);
  });

  it('returns an empty array for a non-matching title', () => {
    expect(extractPokemonNamesFromRaidHour('Community Day')).toEqual([]);
  });
});

describe('extractPokemonNameFromMaxMonday', () => {
  it('extracts the Pokemon name from a Max Monday title', () => {
    expect(extractPokemonNameFromMaxMonday('Dynamax Gengar during Max Monday')).toBe('Gengar');
  });

  it('returns null for a non-matching title', () => {
    expect(extractPokemonNameFromMaxMonday('Community Day')).toBeNull();
  });
});

describe('parseGigantamaxMaxBattleName / parseDynamaxMaxBattleName', () => {
  it('extracts the Pokemon name from a Gigantamax Max Battle title', () => {
    expect(parseGigantamaxMaxBattleName('Gigantamax Toxtricity Max Battle Day')).toBe('Toxtricity');
    expect(parseGigantamaxMaxBattleName('Gigantamax Urshifu Max Battle Weekend')).toBe('Urshifu');
  });

  it('extracts the Pokemon name from a Dynamax Max Battle title', () => {
    expect(parseDynamaxMaxBattleName('Dynamax Charizard Max Battle Weekend')).toBe('Charizard');
  });

  it('returns null for non-matching titles', () => {
    expect(parseGigantamaxMaxBattleName('Community Day')).toBeNull();
    expect(parseDynamaxMaxBattleName('Community Day')).toBeNull();
  });
});

describe('extractPokemonNamesFromSpotlightHour', () => {
  it('extracts the Pokemon name from a Spotlight Hour title', () => {
    expect(extractPokemonNamesFromSpotlightHour('Eevee Spotlight Hour')).toEqual(['Eevee']);
  });

  it('returns an empty array for a non-matching title', () => {
    expect(extractPokemonNamesFromSpotlightHour('Community Day')).toEqual([]);
  });
});

describe('extractPokemonNameFromRaidBattle', () => {
  it('extracts from a shadow-raid "in Shadow Raids" title', () => {
    const event = makeEvent({ name: 'Shadow Mewtwo in Shadow Raids', eventType: 'raid-battles' });
    expect(extractPokemonNameFromRaidBattle(event)).toBe('Mewtwo');
  });

  it('extracts from a shadow-raid "Raid Weekend" title', () => {
    const event = makeEvent({ name: 'Shadow Mewtwo Raid Weekend', eventType: 'raid-weekend' });
    expect(extractPokemonNameFromRaidBattle(event)).toBe('Mewtwo');
  });

  it('returns null for an unrecognized shadow-raid title', () => {
    const event = makeEvent({ name: 'Shadow Something Else', eventType: 'raid-battles' });
    expect(extractPokemonNameFromRaidBattle(event)).toBeNull();
  });

  it('extracts from a super-mega-raid title', () => {
    const event = makeEvent({
      name: 'Mega Venusaur in Super Mega Raids',
      eventType: 'raid-battles',
    });
    expect(extractPokemonNameFromRaidBattle(event)).toBe('Venusaur');
  });

  it('returns null for an unrecognized super-mega-raid title', () => {
    const event = makeEvent({ name: 'Super Mega Something Else', eventType: 'raid-battles' });
    expect(extractPokemonNameFromRaidBattle(event)).toBeNull();
  });

  it('extracts from a mega-raid title', () => {
    const event = makeEvent({ name: 'Mega Charizard in Mega Raids', eventType: 'raid-battles' });
    expect(extractPokemonNameFromRaidBattle(event)).toBe('Charizard');
  });

  it('returns null for an unrecognized mega-raid title', () => {
    const event = makeEvent({ name: 'Mega Something Else', eventType: 'raid-battles' });
    expect(extractPokemonNameFromRaidBattle(event)).toBeNull();
  });

  it('extracts from a primal-raid title', () => {
    const event = makeEvent({ name: 'Primal Kyogre in Primal Raids', eventType: 'raid-battles' });
    expect(extractPokemonNameFromRaidBattle(event)).toBe('Kyogre');
  });

  it('returns null for an unrecognized primal-raid title', () => {
    const event = makeEvent({ name: 'Primal Something Else', eventType: 'raid-battles' });
    expect(extractPokemonNameFromRaidBattle(event)).toBeNull();
  });

  it('extracts from a "N-star Raid battles" title', () => {
    const event = makeEvent({ name: 'Machamp in 3-star Raid battles', eventType: 'raid-battles' });
    expect(extractPokemonNameFromRaidBattle(event)).toBe('Machamp');
  });

  it('extracts from a "Raid Weekend" title, including an optional Fusion prefix', () => {
    const event = makeEvent({ name: 'Kyurem Fusion Raid Weekend', eventType: 'raid-weekend' });
    expect(extractPokemonNameFromRaidBattle(event)).toBe('Kyurem');
  });

  it('returns null for an unrecognized raid-battles title', () => {
    const event = makeEvent({ name: 'Something Else Entirely', eventType: 'raid-battles' });
    expect(extractPokemonNameFromRaidBattle(event)).toBeNull();
  });

  it('returns null when the event has no raid subtype at all', () => {
    const event = makeEvent({ name: 'Community Day', eventType: 'community-day' });
    expect(extractPokemonNameFromRaidBattle(event)).toBeNull();
  });
});

describe('parsePokemonNameAndSuffix', () => {
  it('parses Mega X/Y variants', () => {
    expect(parsePokemonNameAndSuffix('Mega Charizard X')).toEqual({
      pokemonName: 'Charizard',
      suffix: '-megax',
    });
    expect(parsePokemonNameAndSuffix('Mega Charizard Y')).toEqual({
      pokemonName: 'Charizard',
      suffix: '-megay',
    });
  });

  it('parses a plain Mega Pokemon', () => {
    expect(parsePokemonNameAndSuffix('Mega Venusaur')).toEqual({
      pokemonName: 'Venusaur',
      suffix: '-mega',
    });
  });

  it('parses a Primal Pokemon', () => {
    expect(parsePokemonNameAndSuffix('Primal Kyogre')).toEqual({
      pokemonName: 'Kyogre',
      suffix: '-primal',
    });
  });

  it('parses a Shadow Pokemon with no suffix', () => {
    expect(parsePokemonNameAndSuffix('Shadow Mewtwo')).toEqual({ pokemonName: 'Mewtwo' });
  });

  it('parses regional-form prefixes with their irregular slugs', () => {
    expect(parsePokemonNameAndSuffix('Alolan Raichu')).toEqual({
      pokemonName: 'Raichu',
      suffix: '-alola',
    });
    expect(parsePokemonNameAndSuffix('Galarian Zapdos')).toEqual({
      pokemonName: 'Zapdos',
      suffix: '-galarian',
    });
    expect(parsePokemonNameAndSuffix('Hisuian Braviary')).toEqual({
      pokemonName: 'Braviary',
      suffix: '-hisuian',
    });
    expect(parsePokemonNameAndSuffix('Paldean Wooper')).toEqual({
      pokemonName: 'Wooper',
      suffix: '-paldea',
    });
  });

  it('parses "Forme" prefix words', () => {
    expect(parsePokemonNameAndSuffix('Therian Forme Landorus')).toEqual({
      pokemonName: 'Landorus',
      suffix: '-therian',
    });
  });

  it('parses a parenthetical form name, normalizing to a slug', () => {
    expect(parsePokemonNameAndSuffix('Landorus (Therian Form)')).toEqual({
      pokemonName: 'Landorus',
      suffix: '-therian',
    });
    expect(parsePokemonNameAndSuffix('Palkia (Origin Forme)')).toEqual({
      pokemonName: 'Palkia',
      suffix: '-origin',
    });
  });

  it('special-cases Deoxys (Normal) to no suffix', () => {
    expect(parsePokemonNameAndSuffix('Deoxys (Normal)')).toEqual({ pokemonName: 'Deoxys' });
  });

  it('special-cases Deoxys other forms to a suffix', () => {
    expect(parsePokemonNameAndSuffix('Deoxys (Attack)')).toEqual({
      pokemonName: 'Deoxys',
      suffix: '-attack',
    });
  });

  it('special-cases Genesect Drive forms, stripping " drive"', () => {
    expect(parsePokemonNameAndSuffix('Genesect (Burn Drive)')).toEqual({
      pokemonName: 'Genesect',
      suffix: '-burn',
    });
  });

  it('applies form-name overrides for multi-word forms', () => {
    expect(parsePokemonNameAndSuffix('Necrozma (Dawn Wings)')).toEqual({
      pokemonName: 'Necrozma',
      suffix: '-dawnwings',
    });
    expect(parsePokemonNameAndSuffix('Zacian (Crowned Sword)')).toEqual({
      pokemonName: 'Zacian',
      suffix: '-crownedsword',
    });
  });

  it('defaults bare Genesect (no form specified) to the normal-form suffix', () => {
    expect(parsePokemonNameAndSuffix('Genesect')).toEqual({
      pokemonName: 'Genesect',
      suffix: '-normal',
    });
  });

  it('returns the trimmed name with no suffix for a plain Pokemon name', () => {
    expect(parsePokemonNameAndSuffix('Bulbasaur')).toEqual({ pokemonName: 'Bulbasaur' });
  });
});
