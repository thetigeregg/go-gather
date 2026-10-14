import BetterSqlite3 from 'better-sqlite3';
import {
  AVAILABILITY_SOURCES_SCHEMA,
  loadAvailability,
  syncAvailability,
} from './availability-store';
import { availabilityPage, dynamaxPage, row, speciesSections } from './bulbapedia.test-helpers';

const DYNAMAX_PAGE = 'Dynamax (GO)';
const AVAILABILITY_PAGE = 'List of Pokémon by availability in Pokémon GO';
const FIRST_SYNC = new Date('2026-10-01T08:00:00Z');
const SECOND_SYNC = new Date('2026-10-02T08:00:00Z');

interface SourceRow {
  dataset: string;
  payload: string | null;
  fetched_at: string | null;
  last_attempt_at: string;
  last_error: string | null;
}

let database: BetterSqlite3.Database;

function pageFetcher(pages: Record<string, string | Error>) {
  return vi.fn((page: string) => {
    const result = pages[page];
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  });
}

function source(dataset: string): SourceRow {
  return database
    .prepare('SELECT * FROM availability_sources WHERE dataset = ?')
    .get(dataset) as SourceRow;
}

const goodPages = {
  [DYNAMAX_PAGE]: dynamaxPage([
    row('Jun 1, 2025', '{{MSP/GO|0415|Combee}}'),
    row('Nov 6, 2026', '{{MSP/GO|0483|Dialga}}'),
  ]),
  [AVAILABILITY_PAGE]: availabilityPage(
    [row('Nov 6, 2026', '{{MSP/GO|0884GMax|Duraludon}}')],
    15,
    speciesSections({ rows: [row('Nov 14, 2026', '{{MSP/GO|0902|Basculegion}}')] })
  ),
};

beforeEach(() => {
  database = new BetterSqlite3(':memory:');
  database.exec(AVAILABILITY_SOURCES_SCHEMA);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  database.close();
  vi.restoreAllMocks();
});

describe('syncAvailability', () => {
  it('fetches each page once and saves every dataset', async () => {
    const fetchPage = pageFetcher(goodPages);

    await expect(syncAvailability(database, fetchPage, FIRST_SYNC)).resolves.toEqual([]);

    expect(fetchPage).toHaveBeenCalledTimes(2);
    for (const dataset of ['dynamax', 'gigantamax', 'species']) {
      expect(source(dataset)).toMatchObject({
        fetched_at: FIRST_SYNC.toISOString(),
        last_attempt_at: FIRST_SYNC.toISOString(),
        last_error: null,
      });
    }
    expect(JSON.parse(source('dynamax').payload ?? '[]')).toContainEqual({
      dexNr: 483,
      form: null,
      releasedOn: '2026-11-06',
    });
  });

  it('keeps a failing dataset at its last good data while others update', async () => {
    await syncAvailability(database, pageFetcher(goodPages), FIRST_SYNC);
    const goodGigantamax = source('gigantamax').payload;

    const failed = await syncAvailability(
      database,
      pageFetcher({
        [DYNAMAX_PAGE]: dynamaxPage([row('Jun 1, 2025', '{{MSP/GO|0416|Vespiquen}}')]),
        [AVAILABILITY_PAGE]: availabilityPage([row('Mar 28, 2026', '{{MSP/GO|0025|Pikachu}}')]),
      }),
      SECOND_SYNC
    );

    expect(failed).toEqual(['gigantamax']);
    expect(source('dynamax').fetched_at).toBe(SECOND_SYNC.toISOString());
    // Species is parsed from the same page as Gigantamax and still updates.
    expect(source('species')).toMatchObject({
      fetched_at: SECOND_SYNC.toISOString(),
      last_error: null,
    });
    expect(source('dynamax').payload).toContain('"dexNr":416');
    expect(source('gigantamax')).toMatchObject({
      payload: goodGigantamax,
      fetched_at: FIRST_SYNC.toISOString(),
      last_attempt_at: SECOND_SYNC.toISOString(),
      last_error: expect.stringContaining("isn't a GMax code") as unknown,
    });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Availability gigantamax: update failed')
    );
  });

  it('records a failed fetch without throwing, and clears the error on the next success', async () => {
    await syncAvailability(
      database,
      pageFetcher({ ...goodPages, [DYNAMAX_PAGE]: new Error('Bulbapedia: 503') }),
      FIRST_SYNC
    );

    expect(source('dynamax')).toMatchObject({
      payload: null,
      fetched_at: null,
      last_error: 'Bulbapedia: 503',
    });
    expect(source('gigantamax').last_error).toBeNull();

    await syncAvailability(database, pageFetcher(goodPages), SECOND_SYNC);

    expect(source('dynamax')).toMatchObject({
      fetched_at: SECOND_SYNC.toISOString(),
      last_error: null,
    });
  });

  it('records a non-Error rejection as its string value', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the non-Error rejection is what's under test
    const fetchPage = vi.fn(() => Promise.reject('rate limited'));

    await expect(syncAvailability(database, fetchPage, FIRST_SYNC)).resolves.toEqual([
      'dynamax',
      'gigantamax',
      'species',
    ]);

    expect(source('dynamax').last_error).toBe('rate limited');
    expect(source('gigantamax').last_error).toBe('rate limited');
  });
});

describe('loadAvailability', () => {
  beforeEach(async () => {
    await syncAvailability(database, pageFetcher(goodPages), FIRST_SYNC);
  });

  it('returns every saved dataset with dates, including announced releases', () => {
    const availability = loadAvailability(database, SECOND_SYNC);

    expect(availability.dynamax).toContainEqual({
      dexNr: 483,
      form: null,
      releasedOn: '2026-11-06',
    });
    expect(availability.gigantamax).toContainEqual({
      dexNr: 884,
      form: null,
      releasedOn: '2026-11-06',
    });
    expect(availability.gigantamax).toHaveLength(16);
    expect(availability.species).toContainEqual({
      dexNr: 902,
      formCode: '',
      releasedOn: '2026-11-14',
    });
  });

  it('warns when the saved data is a week or more old', () => {
    loadAvailability(database, new Date('2026-10-07T12:00:00Z'));
    expect(console.warn).not.toHaveBeenCalled();

    loadAvailability(database, new Date('2026-10-08T08:00:00Z'));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('saved data is 7 days old'));
  });

  it('throws when a dataset has never been fetched successfully', async () => {
    const fresh = new BetterSqlite3(':memory:');
    fresh.exec(AVAILABILITY_SOURCES_SCHEMA);
    await syncAvailability(
      fresh,
      pageFetcher({ ...goodPages, [AVAILABILITY_PAGE]: new Error('Bulbapedia: timeout') }),
      FIRST_SYNC
    );

    expect(() => loadAvailability(fresh, SECOND_SYNC)).toThrow(
      /No saved gigantamax availability yet .*Bulbapedia: timeout/
    );
    fresh.close();
  });

  it('returns null species data, without throwing, when species has never been saved', async () => {
    const fresh = new BetterSqlite3(':memory:');
    fresh.exec(AVAILABILITY_SOURCES_SCHEMA);
    await syncAvailability(
      fresh,
      pageFetcher({
        ...goodPages,
        [AVAILABILITY_PAGE]: availabilityPage(
          [],
          15,
          speciesSections({ fillerCount: 500, unreleased: [] })
        ),
      }),
      FIRST_SYNC
    );

    const availability = loadAvailability(fresh, SECOND_SYNC);

    expect(availability.species).toBeNull();
    expect(availability.gigantamax).toHaveLength(15);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /No saved species availability yet .*Treating every species as released/
      )
    );
    fresh.close();
  });

  it('throws when nothing has ever been attempted', () => {
    const fresh = new BetterSqlite3(':memory:');
    fresh.exec(AVAILABILITY_SOURCES_SCHEMA);

    expect(() => loadAvailability(fresh, SECOND_SYNC)).toThrow(
      /No saved dynamax availability yet .*last error: none recorded/
    );
    fresh.close();
  });
});
