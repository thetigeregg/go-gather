import {
  calculateCP,
  calculateRaidCP,
  cleanPokemonName,
  formatCP,
  formatCPDisplay,
} from './pokemon-cp.util';

describe('calculateCP', () => {
  it('matches a known reference CP for Mewtwo at level 20 (perfect IVs)', () => {
    expect(calculateCP(300, 182, 214, 0.5974)).toBe(2387);
  });

  it('matches a known reference CP for Mewtwo at level 25 (perfect IVs)', () => {
    expect(calculateCP(300, 182, 214, 0.667934)).toBe(2984);
  });

  it('accepts explicit non-perfect IVs', () => {
    const perfect = calculateCP(300, 182, 214, 0.5974, 15, 15, 15);
    const zeroIv = calculateCP(300, 182, 214, 0.5974, 0, 0, 0);
    expect(zeroIv).toBeLessThan(perfect);
  });

  it('floors the result to a minimum of 10 for very weak Pokemon at low CPM', () => {
    expect(calculateCP(1, 1, 1, 0.1)).toBe(10);
  });
});

describe('calculateRaidCP', () => {
  it('returns both level20Max and level25Max using perfect IVs', () => {
    expect(calculateRaidCP({ baseAttack: 300, baseDefense: 182, baseStamina: 214 })).toEqual({
      level20Max: 2387,
      level25Max: 2984,
    });
  });

  it('level25Max is always higher than level20Max for the same stats', () => {
    const { level20Max, level25Max } = calculateRaidCP({
      baseAttack: 198,
      baseDefense: 189,
      baseStamina: 190,
    });
    expect(level25Max).toBeGreaterThan(level20Max);
  });
});

describe('cleanPokemonName', () => {
  it('lowercases and strips non-alphanumeric characters', () => {
    expect(cleanPokemonName("Farfetch'd")).toBe('farfetchd');
  });

  it('strips spaces and hyphens', () => {
    expect(cleanPokemonName('Mr. Mime')).toBe('mrmime');
    expect(cleanPokemonName('Ho-Oh')).toBe('hooh');
  });

  it('leaves an already-clean name unchanged (lowercased)', () => {
    expect(cleanPokemonName('Pikachu')).toBe('pikachu');
  });
});

describe('formatCP', () => {
  it('adds a thousands separator', () => {
    expect(formatCP(2387)).toBe('2,387');
  });

  it('does not add a separator under 1000', () => {
    expect(formatCP(999)).toBe('999');
  });
});

describe('formatCPDisplay', () => {
  it('shows only level20Max when weather boost is not shown', () => {
    expect(formatCPDisplay(2387, 2984, false)).toBe('2,387');
  });

  it('shows both values separated by " / " when weather boost is shown', () => {
    expect(formatCPDisplay(2387, 2984, true)).toBe('2,387 / 2,984');
  });
});
