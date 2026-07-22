import {
  getGigantamaxSpriteUrl,
  getPokemonId,
  getPokemonSpriteUrl,
  getSpriteFallbackUrl,
  getSprite256FallbackUrl,
  hasExactSpriteForm,
  hasSplitMegaXYForms,
  isValidStaticSprite,
  normalizePokemonName,
} from './pokemon-sprite-mapper.util';

describe('normalizePokemonName', () => {
  it('lowercases and maps gender symbols to letters', () => {
    expect(normalizePokemonName('Nidoran♀')).toBe('nidoranf');
    expect(normalizePokemonName('Nidoran♂')).toBe('nidoranm');
  });

  it('converts underscores to spaces and collapses whitespace', () => {
    expect(normalizePokemonName('Mr__Mime')).toBe('mr mime');
  });

  it('strips accents via NFD decomposition', () => {
    expect(normalizePokemonName('Flabébé')).toBe('flabebe');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizePokemonName('  Pikachu  ')).toBe('pikachu');
  });
});

describe('getPokemonId', () => {
  it('resolves a known name to its ID', () => {
    expect(getPokemonId('Bulbasaur')).toBe(1);
    expect(getPokemonId('Charizard')).toBe(6);
  });

  it('matches case-insensitively via normalization', () => {
    expect(getPokemonId('bulbasaur')).toBe(1);
  });

  it('returns null for an unknown name', () => {
    expect(getPokemonId('Not A Real Pokemon')).toBeNull();
  });
});

describe('isValidStaticSprite', () => {
  it('is true for a known static sprite slug', () => {
    expect(isValidStaticSprite('bulbasaur')).toBe(true);
    expect(isValidStaticSprite('BULBASAUR')).toBe(true);
  });

  it('is false for an unknown slug', () => {
    expect(isValidStaticSprite('not-a-real-slug')).toBe(false);
  });
});

describe('hasExactSpriteForm', () => {
  it('is true for a base-form Pokemon with no suffix', () => {
    expect(hasExactSpriteForm('Bulbasaur')).toBe(true);
  });

  it('is true when the exact suffixed form exists as a static sprite', () => {
    expect(hasExactSpriteForm('Charizard', '-megax')).toBe(true);
  });

  it('is false for an unknown Pokemon', () => {
    expect(hasExactSpriteForm('Not A Real Pokemon', '-mega')).toBe(false);
  });

  it('is false when the requested suffix matches neither a static sprite nor a PokeMiners form', () => {
    expect(hasExactSpriteForm('Bulbasaur', '-nonexistentform')).toBe(false);
  });
});

describe('hasSplitMegaXYForms', () => {
  it('is true for Pokemon whose Mega splits into X/Y (Mewtwo)', () => {
    expect(hasSplitMegaXYForms('Mewtwo')).toBe(true);
  });

  it('is false for a Pokemon with no split Mega forms', () => {
    expect(hasSplitMegaXYForms('Bulbasaur')).toBe(false);
  });

  it('is false for an unknown Pokemon', () => {
    expect(hasSplitMegaXYForms('Not A Real Pokemon')).toBe(false);
  });
});

describe('getSprite256FallbackUrl / getSpriteFallbackUrl', () => {
  const pokeminersUrl =
    'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon/Addressable%20Assets/pm1.icon.png';

  it('rewrites a PokeMiners icon URL to the 256x256 folder', () => {
    expect(getSprite256FallbackUrl(pokeminersUrl)).toBe(
      'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon%20-%20256x256/Addressable%20Assets/pm1.icon.png'
    );
  });

  it('rewrites a PokeMiners icon URL to the pokemongohub.net mirror', () => {
    expect(getSpriteFallbackUrl(pokeminersUrl)).toBe(
      'https://db.pokemongohub.net/images/ingame/normal/pm1.icon.png'
    );
  });

  it('returns null for a non-PokeMiners URL', () => {
    expect(getSprite256FallbackUrl('https://example.com/foo.png')).toBeNull();
    expect(getSpriteFallbackUrl('https://example.com/foo.png')).toBeNull();
  });
});

describe('getGigantamaxSpriteUrl', () => {
  it('returns the generic filename for a Gigantamax Pokemon with no special-form entry', () => {
    expect(getGigantamaxSpriteUrl('Charizard')).toBe(
      'https://raw.githubusercontent.com/HybridShivam/Pokemon/master/assets/images/0006-Gmax.png'
    );
  });

  it('returns the default filename for a Gigantamax Pokemon with multiple forms and no form slug given', () => {
    expect(getGigantamaxSpriteUrl('Toxtricity')).toBe(
      'https://raw.githubusercontent.com/HybridShivam/Pokemon/master/assets/images/0849-Amped-Gmax.png'
    );
  });

  it('returns the matching form-specific filename when a form slug is given', () => {
    expect(getGigantamaxSpriteUrl('Toxtricity', 'low-key')).toBe(
      'https://raw.githubusercontent.com/HybridShivam/Pokemon/master/assets/images/0849-Low-Key-Gmax.png'
    );
  });

  it('returns null for a Pokemon with no Gigantamax asset', () => {
    expect(getGigantamaxSpriteUrl('Bulbasaur')).toBeNull();
  });

  it('returns null for an unknown Pokemon name', () => {
    expect(getGigantamaxSpriteUrl('Not A Real Pokemon')).toBeNull();
  });
});

describe('getPokemonSpriteUrl', () => {
  it('resolves a known Pokemon name to the primary static-sprite CDN URL', () => {
    expect(getPokemonSpriteUrl('Bulbasaur')).toBe(
      'https://raw.githubusercontent.com/mgrann03/pokemon-resources/refs/heads/main/graphics/pogo/bulbasaur.png'
    );
  });

  it('resolves by Pokemon ID', () => {
    expect(getPokemonSpriteUrl(1)).toBe(
      'https://raw.githubusercontent.com/mgrann03/pokemon-resources/refs/heads/main/graphics/pogo/bulbasaur.png'
    );
  });

  it('resolves a suffixed form to the primary static-sprite CDN when valid', () => {
    expect(getPokemonSpriteUrl('Charizard', '-megax')).toBe(
      'https://raw.githubusercontent.com/mgrann03/pokemon-resources/refs/heads/main/graphics/pogo/charizard-megax.png'
    );
  });

  it('falls back to a PokeMiners URL (using the form-map default suffix) when no static sprite exists for the base form', () => {
    const url = getPokemonSpriteUrl('Kyurem');
    expect(url).toBe(
      'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon/Addressable%20Assets/pm646.fNORMAL.icon.png'
    );
  });

  it('falls back to a PokeMiners URL (matching the requested suffix against the form map) when the exact static slug does not exist', () => {
    // Zygarde's static sprite slugs are "zygarde-fiftypercent" etc, not "zygarde-50" — so this
    // exercises the form-matched (not default-suffix) PokeMiners branch.
    const url = getPokemonSpriteUrl('Zygarde', '-50');
    expect(url).toBe(
      'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon/Addressable%20Assets/pm718.f50.icon.png'
    );
  });

  it('falls back to a base PokeMiners URL for a base-form-only Pokemon with no static sprite', () => {
    const url = getPokemonSpriteUrl('Okidogi');
    expect(url).toBe(
      'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon/Addressable%20Assets/pm1014.icon.png'
    );
  });

  it('falls back to the form-map default suffix when a requested suffix matches no PokeMiners form', () => {
    const url = getPokemonSpriteUrl('Zygarde', '-nonexistentform');
    expect(url).toBe(
      'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon/Addressable%20Assets/pm718.f50.icon.png'
    );
  });

  it('returns null for an unknown Pokemon name', () => {
    expect(getPokemonSpriteUrl('Not A Real Pokemon')).toBeNull();
  });

  it('returns null for an unknown Pokemon ID', () => {
    expect(getPokemonSpriteUrl(999999)).toBeNull();
  });
});
