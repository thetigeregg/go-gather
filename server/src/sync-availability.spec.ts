import { syncAvailability } from './availability-store.js';
import { db, initSchema } from './db.js';
import { main } from './sync-availability';

// db.ts opens the real SQLite file on import, so both it and the network
// sync are replaced — this only checks how main() reports the outcome.
vi.mock('./db.js', () => ({ db: {}, initSchema: vi.fn() }));
vi.mock('./availability-store.js', () => ({ syncAvailability: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
});

describe('main', () => {
  it('resolves when every dataset updated', async () => {
    vi.mocked(syncAvailability).mockResolvedValue([]);

    await expect(main()).resolves.toBeUndefined();
    expect(initSchema).toHaveBeenCalled();
    expect(syncAvailability).toHaveBeenCalledWith(db);
  });

  it('rejects, naming the datasets, when any dataset failed to update', async () => {
    vi.mocked(syncAvailability).mockResolvedValue(['dynamax', 'gigantamax']);

    await expect(main()).rejects.toThrow('dynamax, gigantamax not updated');
  });
});
