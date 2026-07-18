import { GeneralUtil } from './general.util';

describe('GeneralUtil', () => {
  it('capitalizes the first letter, leaving the rest unchanged', () => {
    expect(GeneralUtil.capitalizeFirstLetter('alola')).toBe('Alola');
    expect(GeneralUtil.capitalizeFirstLetter('kANTO')).toBe('KANTO');
  });
});
