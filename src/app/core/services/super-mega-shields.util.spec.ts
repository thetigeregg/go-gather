import { getSuperMegaShieldCount } from './super-mega-shields.util';

describe('getSuperMegaShieldCount', () => {
  it('resolves a known boss name without a Mega prefix', () => {
    expect(getSuperMegaShieldCount('Dragonite')).toBe(10);
  });

  it('resolves a known boss name with a "Mega " prefix stripped', () => {
    expect(getSuperMegaShieldCount('Mega Dragonite')).toBe(10);
  });

  it('is case-insensitive', () => {
    expect(getSuperMegaShieldCount('MEGA DRAGONITE')).toBe(10);
  });

  it('resolves a two-word boss name (Mewtwo X)', () => {
    expect(getSuperMegaShieldCount('Mewtwo X')).toBe(10);
  });

  it('returns undefined for a boss not in the table', () => {
    expect(getSuperMegaShieldCount('Not A Real Boss')).toBeUndefined();
  });
});
