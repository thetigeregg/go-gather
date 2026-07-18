import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@go-gather/shared';
import { AppDb } from './app-db';
import { DexieStorageEngine } from './dexie-storage-engine';
import { LocalUserDataRepository } from './local-user-data-repository';
import { STORAGE_ENGINE } from './storage-engine';
import { SYNC_OUTBOX_WRITER, SyncOutboxWriter } from './sync-outbox-writer';

vi.mock('./storage-transaction-context', () => import('./storage-transaction-context.node'));

describe('LocalUserDataRepository', () => {
  let db: AppDb;
  let repository: LocalUserDataRepository;
  let syncNow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    syncNow = vi.fn().mockResolvedValue(undefined);
    const outboxWriter: SyncOutboxWriter = {
      enqueueOperation: vi.fn().mockResolvedValue(undefined),
      syncNow,
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AppDb,
        DexieStorageEngine,
        { provide: STORAGE_ENGINE, useExisting: DexieStorageEngine },
        { provide: SYNC_OUTBOX_WRITER, useValue: outboxWriter },
      ],
    });

    db = TestBed.inject(AppDb);
    repository = TestBed.inject(LocalUserDataRepository);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('setCaught writes the progress row and enqueues an outbox entry', async () => {
    await repository.setCaught('bulbasaur-regular', true);

    const stored = await repository.getProgress('bulbasaur-regular');
    expect(stored?.caught).toBe(true);

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].entityType).toBe('progress');
    expect(outbox[0].operation).toBe('upsert');

    expect(syncNow).toHaveBeenCalled();
  });

  it('updateSettings writes the settings row and enqueues an outbox entry', async () => {
    await repository.updateSettings({ ...DEFAULT_SETTINGS, pokedexType: 'mega' });

    const stored = await repository.getSettings();
    expect(stored?.pokedexType).toBe('mega');

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].entityType).toBe('settings');
  });

  it('listProgress reflects writes made through the repository', async () => {
    await repository.setCaught('a', true);
    await repository.setCaught('b', false);

    const all = await repository.listProgress();
    expect(all.map((entry) => entry.catalogEntryId).sort()).toEqual(['a', 'b']);
  });

  it('bulkSetCaught writes all entries and enqueues one outbox row per entry, in a single transaction', async () => {
    await repository.bulkSetCaught([
      { catalogEntryId: 'x', caught: true },
      { catalogEntryId: 'y', caught: false },
    ]);

    const all = await repository.listProgress();
    expect(all.map((entry) => entry.catalogEntryId).sort()).toEqual(['x', 'y']);

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(2);
    expect(outbox.every((entry) => entry.entityType === 'progress')).toBe(true);

    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it("bulkSetCaught doesn't clear progress entries absent from the given list", async () => {
    await repository.setCaught('pre-existing', true);
    syncNow.mockClear();

    await repository.bulkSetCaught([{ catalogEntryId: 'new-entry', caught: true }]);

    const all = await repository.listProgress();
    expect(all.map((entry) => entry.catalogEntryId).sort()).toEqual(['new-entry', 'pre-existing']);
  });
});
