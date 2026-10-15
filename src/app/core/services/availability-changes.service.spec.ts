import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { CatalogEntry } from '@go-gather/shared';
import { AppDb } from '../data/app-db';
import { DexieStorageEngine } from '../data/dexie-storage-engine';
import { makeContractCatalogEntry } from '../data/storage-engine.contract';
import { StorageEngineFactory } from '../data/storage-engine.factory';
import { AvailabilityChangesService } from './availability-changes.service';

vi.mock(
  '../data/storage-transaction-context',
  () => import('../data/storage-transaction-context.node')
);

const YESTERDAY = '2026-10-14';
const TODAY = '2026-10-15';

function entry(id: string, releasedOn: string | null): CatalogEntry {
  return makeContractCatalogEntry({ id, name: id, releasedOn });
}

describe('AvailabilityChangesService', () => {
  let db: AppDb;
  let engine: DexieStorageEngine;
  let service: AvailabilityChangesService;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [AppDb, DexieStorageEngine, StorageEngineFactory],
    });
    db = TestBed.inject(AppDb);
    engine = TestBed.inject(DexieStorageEngine);
    await TestBed.inject(StorageEngineFactory).initialize();
    service = TestBed.inject(AvailabilityChangesService);
  });

  afterEach(async () => {
    await db.delete();
  });

  const pendingIds = async () =>
    (await service.getPending()).map(({ id, kind }) => `${id}:${kind}`);
  const setCheckDate = (value: string) =>
    engine.putSyncMeta({ key: 'availabilityCheckDate', value });

  describe('recordCatalogReplacement', () => {
    it('records the changes and the check date', async () => {
      await setCheckDate(YESTERDAY);

      await service.recordCatalogReplacement(
        [entry('a', '2016-07-06'), entry('b', null)],
        [entry('a', null), entry('b', '2016-07-06')],
        TODAY
      );

      expect(await pendingIds()).toEqual(['a:unavailable', 'b:available']);
      expect((await engine.getSyncMeta('availabilityCheckDate'))?.value).toBe(TODAY);
    });

    it('starts from today without a previous check', async () => {
      await service.recordCatalogReplacement([entry('a', null)], [entry('a', '2016-07-06')], TODAY);

      expect(await service.getPending()).toEqual([]);
      expect((await engine.getSyncMeta('availabilityCheckDate'))?.value).toBe(TODAY);
    });

    it('starts from today when replacing an empty catalog', async () => {
      await setCheckDate(YESTERDAY);

      await service.recordCatalogReplacement([], [entry('a', '2016-07-06')], TODAY);

      expect(await service.getPending()).toEqual([]);
    });

    it('starts from today when the previous catalog predates release dates', async () => {
      await setCheckDate(YESTERDAY);
      const { releasedOn: _releasedOn, ...undated } = entry('a', '2016-07-06');

      await service.recordCatalogReplacement([undated as CatalogEntry], [entry('a', null)], TODAY);

      expect(await service.getPending()).toEqual([]);
      expect((await engine.getSyncMeta('availabilityCheckDate'))?.value).toBe(TODAY);
    });

    it('merges with changes not yet seen, keeping the newer per entry', async () => {
      await setCheckDate(YESTERDAY);
      await service.recordCatalogReplacement(
        [entry('a', null), entry('b', null)],
        [entry('a', '2026-11-06'), entry('b', '2016-07-06')],
        YESTERDAY
      );

      await service.recordCatalogReplacement(
        [entry('a', '2026-11-06'), entry('b', '2016-07-06')],
        [entry('a', '2016-07-06'), entry('b', '2016-07-06')],
        TODAY
      );

      expect(await pendingIds()).toEqual(['b:available', 'a:available']);
    });
  });

  describe('checkForDateChanges', () => {
    it('records announced releases whose day arrived and publishes them', async () => {
      await engine.bulkPutCatalog([entry('a', TODAY), entry('b', '2026-11-06')]);
      await setCheckDate(YESTERDAY);
      const published = vi.fn();
      service.pending$.subscribe(published);

      await service.checkForDateChanges(TODAY);

      expect(await pendingIds()).toEqual(['a:available']);
      expect(published).toHaveBeenCalledTimes(1);
    });

    it('publishes changes left from an earlier session even with nothing new', async () => {
      await engine.bulkPutCatalog([entry('a', TODAY)]);
      await setCheckDate(YESTERDAY);
      await service.checkForDateChanges(TODAY);
      const published = vi.fn();
      service.pending$.subscribe(published);

      await service.checkForDateChanges(TODAY);

      expect(await pendingIds()).toEqual(['a:available']);
      expect(published).toHaveBeenCalledTimes(1);
    });

    it("doesn't publish when nothing is pending", async () => {
      await engine.bulkPutCatalog([entry('a', '2016-07-06')]);
      await setCheckDate(YESTERDAY);
      const published = vi.fn();
      service.pending$.subscribe(published);

      await service.checkForDateChanges(TODAY);

      expect(published).not.toHaveBeenCalled();
    });

    it('serializes with a concurrent catalog replacement', async () => {
      await engine.bulkPutCatalog([entry('a', TODAY)]);
      await setCheckDate(YESTERDAY);

      await Promise.all([
        service.checkForDateChanges(TODAY),
        engine.runInTransaction(['catalog', 'syncMeta'], async () => {
          const previous = await engine.listCatalog();
          await engine.clearCatalog();
          await engine.bulkPutCatalog([entry('a', TODAY), entry('b', '2016-07-06')]);
          await service.recordCatalogReplacement(previous, await engine.listCatalog(), TODAY);
        }),
      ]);

      expect((await pendingIds()).sort()).toEqual(['a:available', 'b:available']);
    });
  });

  describe('acknowledge', () => {
    it('drops only the changes that were shown', async () => {
      await setCheckDate(YESTERDAY);
      await service.recordCatalogReplacement(
        [entry('a', null), entry('b', null)],
        [entry('a', '2016-07-06'), entry('b', '2016-07-06')],
        TODAY
      );
      const shown = await service.getPending();
      // A newer change to `a` arrives while the popup is open.
      await service.recordCatalogReplacement(
        [entry('a', '2016-07-06'), entry('b', '2016-07-06')],
        [entry('a', null), entry('b', '2016-07-06')],
        TODAY
      );

      await service.acknowledge(shown);

      expect(await pendingIds()).toEqual(['a:unavailable']);
    });
  });

  it('treats unreadable pending data as nothing pending', async () => {
    await engine.putSyncMeta({ key: 'pendingAvailabilityChanges', value: '{not json' });

    expect(await service.getPending()).toEqual([]);
  });
});
