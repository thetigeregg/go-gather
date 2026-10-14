import { CatalogEntry } from '@go-gather/shared';
import { isReleased, localDateString } from './catalog-release.util';

function entryReleasedOn(releasedOn: string | null): CatalogEntry {
  return { releasedOn } as CatalogEntry;
}

describe('localDateString', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats the local calendar date with zero padding', () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDateString(new Date(2026, 10, 6, 0, 30))).toBe('2026-11-06');
  });

  it("defaults to the device's current date", () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 8) });

    expect(localDateString()).toBe('2026-10-14');
  });
});

describe('isReleased', () => {
  const today = '2026-10-14';

  it('includes entries released today or earlier', () => {
    expect(isReleased(entryReleasedOn('2016-07-06'), today)).toBe(true);
    expect(isReleased(entryReleasedOn('2026-10-14'), today)).toBe(true);
  });

  it('excludes announced releases until their date', () => {
    expect(isReleased(entryReleasedOn('2026-10-15'), today)).toBe(false);
  });

  it('excludes entries that are not released', () => {
    expect(isReleased(entryReleasedOn(null), today)).toBe(false);
  });

  it('treats an entry cached before release dates existed as released', () => {
    expect(isReleased({} as CatalogEntry, today)).toBe(true);
  });
});
