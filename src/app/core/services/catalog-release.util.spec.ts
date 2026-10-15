import { CatalogEntry } from '@go-gather/shared';
import {
  hasReleaseDate,
  isReleased,
  localDateChanges,
  localDateString,
} from './catalog-release.util';

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

describe('hasReleaseDate', () => {
  it('is true for a date or null, false for an entry cached before release dates existed', () => {
    expect(hasReleaseDate(entryReleasedOn('2016-07-06'))).toBe(true);
    expect(hasReleaseDate(entryReleasedOn(null))).toBe(true);
    expect(hasReleaseDate({} as CatalogEntry)).toBe(false);
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

describe('localDateChanges', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits the new local date once when the date rolls over', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 14, 23, 59, 30) });
    const dates: string[] = [];
    const subscription = localDateChanges(60_000).subscribe((date) => dates.push(date));

    vi.advanceTimersByTime(60_000);
    vi.advanceTimersByTime(60_000);
    subscription.unsubscribe();

    expect(dates).toEqual(['2026-10-15']);
  });

  it('emits nothing while the date stays the same', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 14, 12) });
    const dates: string[] = [];
    const subscription = localDateChanges(60_000).subscribe((date) => dates.push(date));

    vi.advanceTimersByTime(10 * 60_000);
    subscription.unsubscribe();

    expect(dates).toEqual([]);
  });
});
