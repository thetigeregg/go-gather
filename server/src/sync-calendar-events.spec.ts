import { main, withDates } from './sync-calendar-events';

// db.ts opens the real SQLite file on import, so it's replaced with just
// enough of better-sqlite3's surface to record what upsertCalendarEvents writes.
const { run, exec } = vi.hoisted(() => ({ run: vi.fn(), exec: vi.fn() }));
vi.mock('./db.js', () => ({
  db: {
    prepare: vi.fn(() => ({ run })),
    exec,
    transaction: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
  },
  initSchema: vi.fn(),
}));

function feedEvent(eventID: string, start: string | null, end: string | null) {
  return {
    eventID,
    name: eventID,
    eventType: 'event',
    heading: 'Event',
    link: '',
    image: '',
    start,
    end,
  };
}

const dated = feedEvent('dated', '2026-10-27T10:00:00.000', '2026-10-27T17:00:00.000');
const undated = feedEvent('minior-showers-orionids-2026', null, null);
const missingEnd = feedEvent('missing-end', '2026-10-28T10:00:00.000', null);

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('withDates', () => {
  it('keeps only events with both a start and an end', () => {
    expect(withDates([dated, undated, missingEnd])).toEqual([dated]);
  });
});

describe('main', () => {
  it('syncs dated events and skips undated ones instead of failing', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([dated, undated]) })
    );

    await expect(main()).resolves.toBeUndefined();

    expect(exec).toHaveBeenCalledWith('DELETE FROM pokemon_go_events');
    expect(run).toHaveBeenCalledTimes(2); // one event insert + the sync_meta upsert
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'dated', start: dated.start, end: dated.end })
    );
    expect(console.log).toHaveBeenCalledWith(
      'Skipping 1 events without start/end dates: minior-showers-orionids-2026'
    );
  });

  it('rejects when the feed request fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })
    );

    await expect(main()).rejects.toThrow('Failed to fetch events.min.json: 503');
  });
});
