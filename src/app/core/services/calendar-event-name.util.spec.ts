import { decodeHtmlEntities, formatEventName } from './calendar-event-name.util';

describe('decodeHtmlEntities', () => {
  it('decodes named HTML entities', () => {
    expect(decodeHtmlEntities('Fire &amp; Ice')).toBe('Fire & Ice');
    expect(decodeHtmlEntities('&quot;Community Day&quot;')).toBe('"Community Day"');
  });

  it('decodes numeric and hex HTML entities', () => {
    expect(decodeHtmlEntities('&#39;s Day')).toBe("'s Day");
    expect(decodeHtmlEntities('&#x27;s Day')).toBe("'s Day");
  });

  it('returns falsy input unchanged', () => {
    expect(decodeHtmlEntities('')).toBe('');
  });
});

describe('formatEventName', () => {
  it('strips a leading "Pokemon "/"Pokémon " prefix', () => {
    expect(formatEventName('Pokemon GO Fest 2026')).toBe('GO Fest 2026');
    expect(formatEventName('Pokémon GO Tour: Kanto')).toBe('GO Tour: Kanto');
  });

  it('decodes HTML entities and strips the prefix together', () => {
    expect(formatEventName('Pokemon GO Fest: Kanto &amp; Johto')).toBe('GO Fest: Kanto & Johto');
  });

  it('leaves names without the prefix unchanged', () => {
    expect(formatEventName('Community Day: Bulbasaur')).toBe('Community Day: Bulbasaur');
  });
});
