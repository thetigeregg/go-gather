import { Region } from '@go-gather/shared';
import { regionFromFormId } from './transform';

describe('regionFromFormId', () => {
  it.each([
    ['VULPIX_ALOLA', Region.Alola],
    ['DARMANITAN_GALARIAN_STANDARD', Region.Galar],
    ['GROWLITHE_HISUIAN', Region.Hisui],
    ['WOOPER_PALDEA', Region.Paldea],
  ])('maps %s to %s', (formId, expected) => {
    expect(regionFromFormId(formId)).toBe(expected);
  });

  it('returns null for non-regional form ids', () => {
    expect(regionFromFormId('BULBASAUR_NORMAL')).toBeNull();
  });
});
