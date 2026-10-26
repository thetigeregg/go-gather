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
const TOMORROW = '2026-10-16';

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

  it("drops a change that's undone before it's seen", async () => {
    await setCheckDate(YESTERDAY);
    await service.recordCatalogReplacement([entry('a', '2016-07-06')], [entry('a', null)], TODAY);

    await service.recordCatalogReplacement([entry('a', null)], [entry('a', '2016-07-06')], TODAY);

    expect(await service.getPending()).toEqual([]);
  });

  it('ignores a device date that moved backwards', async () => {
    await setCheckDate(TODAY);

    await service.recordCatalogReplacement(
      [entry('a', TODAY)],
      [entry('a', TODAY), entry('b', '2016-07-06')],
      YESTERDAY
    );

    expect(await pendingIds()).toEqual(['b:available']);
    expect((await engine.getSyncMeta('availabilityCheckDate'))?.value).toBe(TODAY);
  });

  describe('checkForDateChanges', () => {
    it("skips reading the catalog when it's already been checked today or later", async () => {
      await engine.bulkPutCatalog([entry('a', TODAY)]);
      const listCatalog = vi.spyOn(engine, 'listCatalog');

      await setCheckDate(TODAY);
      await service.checkForDateChanges(TODAY);
      await service.checkForDateChanges(YESTERDAY);

      expect(listCatalog).not.toHaveBeenCalled();
      expect(await service.getPending()).toEqual([]);
    });

    it('starts from today on the first check', async () => {
      await engine.bulkPutCatalog([entry('a', TODAY)]);

      await service.checkForDateChanges(TODAY);

      expect(await service.getPending()).toEqual([]);
      expect((await engine.getSyncMeta('availabilityCheckDate'))?.value).toBe(TODAY);
    });

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

  describe('takePending and acknowledge', () => {
    it('drops only the changes that were shown', async () => {
      await setCheckDate(YESTERDAY);
      await service.recordCatalogReplacement(
        [entry('a', null), entry('b', null)],
        [entry('a', '2016-07-06'), entry('b', '2016-07-06')],
        TODAY
      );
      const shown = await service.takePending();
      expect(await service.getPending()).toEqual([]);
      // A newer change to `a` arrives while the popup is open.
      await service.recordCatalogReplacement(
        [entry('a', '2016-07-06'), entry('b', '2016-07-06')],
        [entry('a', '2026-11-06'), entry('b', '2016-07-06')],
        TODAY
      );

      await service.acknowledge(shown);

      expect(await pendingIds()).toEqual(['a:announced']);
      expect(await service.takePending()).toMatchObject([
        { id: 'a', kind: 'announced', seenState: 'released' },
      ]);
    });

    it('reports a change that reverses one the open sheet shows', async () => {
      await setCheckDate(YESTERDAY);
      await service.recordCatalogReplacement([entry('a', '2016-07-06')], [entry('a', null)], TODAY);
      const shown = await service.takePending();
      expect(shown).toMatchObject([{ id: 'a', kind: 'unavailable' }]);

      // Restored before the "No longer available" sheet is dismissed.
      await service.recordCatalogReplacement([entry('a', null)], [entry('a', '2016-07-06')], TODAY);
      await service.acknowledge(shown);

      expect(await service.takePending()).toMatchObject([
        { id: 'a', kind: 'available', seenState: 'hidden' },
      ]);
    });

    it('shows changes again after a reload with the sheet open, folding in newer ones', async () => {
      await setCheckDate(YESTERDAY);
      await service.recordCatalogReplacement(
        [entry('a', '2016-07-06'), entry('b', null)],
        [entry('a', null), entry('b', '2016-07-06')],
        TODAY
      );
      await service.takePending();
      // `a` is restored, then the app restarts before the sheet is dismissed.
      await service.recordCatalogReplacement(
        [entry('a', null), entry('b', '2016-07-06')],
        [entry('a', '2016-07-06'), entry('b', '2016-07-06')],
        TODAY
      );
      const published = vi.fn();
      service.pending$.subscribe(published);

      await service.publishPending();

      expect(published).toHaveBeenCalledTimes(1);
      expect((await service.takePending()).map(({ id, kind }) => `${id}:${kind}`)).toEqual([
        'b:available',
      ]);
    });

    it('publishes a snapshot shown but never dismissed', async () => {
      await setCheckDate(YESTERDAY);
      await service.recordCatalogReplacement([entry('a', null)], [entry('a', '2016-07-06')], TODAY);
      const shown = await service.takePending();
      const published = vi.fn();
      service.pending$.subscribe(published);

      await service.publishPending();
      await service.acknowledge(shown);
      await service.publishPending();

      expect(published).toHaveBeenCalledTimes(1);
      expect(await service.takePending()).toEqual([]);
    });
  });

  describe('log', () => {
    const logged = async () =>
      (await service.getLog()).map(
        ({ loggedOn, changes }) =>
          `${loggedOn} ${changes.map(({ id, kind }) => `${id}:${kind}`).join(',')}`
      );

    it('logs changes when shown, before they are dismissed', async () => {
      await setCheckDate(YESTERDAY);
      await service.recordCatalogReplacement(
        [entry('a', null), entry('b', '2016-07-06')],
        [entry('a', '2016-07-06'), entry('b', null)],
        TODAY
      );
      expect(await service.getLog()).toEqual([]);

      await service.takePending(TODAY);

      expect(await logged()).toEqual([`${TODAY} a:available,b:unavailable`]);
    });

    it("doesn't log a snapshot again when shown after a reload with the sheet open", async () => {
      await setCheckDate(YESTERDAY);
      await service.recordCatalogReplacement([entry('a', null)], [entry('a', '2016-07-06')], TODAY);
      await service.takePending(TODAY);
      // Picked up the next day, before the sheet from yesterday is dismissed.
      await service.recordCatalogReplacement(
        [entry('a', '2016-07-06'), entry('b', null)],
        [entry('a', '2016-07-06'), entry('b', '2016-07-06')],
        TOMORROW
      );

      await service.takePending(TOMORROW);

      expect(await logged()).toEqual([`${TOMORROW} b:available`, `${TODAY} a:available`]);
    });

    it('logs a change reversing one the open sheet shows', async () => {
      await setCheckDate(YESTERDAY);
      await service.recordCatalogReplacement([entry('a', '2016-07-06')], [entry('a', null)], TODAY);
      const shown = await service.takePending(TODAY);
      await service.recordCatalogReplacement([entry('a', null)], [entry('a', '2016-07-06')], TODAY);
      await service.acknowledge(shown);

      await service.takePending(TODAY);

      expect(await logged()).toEqual([`${TODAY} a:unavailable,a:available`]);
    });

    it('logs the same change again once the earlier one was dismissed', async () => {
      await setCheckDate(YESTERDAY);
      await service.recordCatalogReplacement([entry('a', null)], [entry('a', '2016-07-06')], TODAY);
      await service.acknowledge(await service.takePending(TODAY));
      await service.recordCatalogReplacement([entry('a', '2016-07-06')], [entry('a', null)], TODAY);
      await service.acknowledge(await service.takePending(TODAY));
      await service.recordCatalogReplacement([entry('a', null)], [entry('a', '2016-07-06')], TODAY);

      await service.takePending(TOMORROW);

      expect(await logged()).toEqual([
        `${TOMORROW} a:available`,
        `${TODAY} a:available,a:unavailable`,
      ]);
    });

    it('emits logged$ only when something was logged', async () => {
      const emitted = vi.fn();
      service.logged$.subscribe(emitted);
      await service.takePending(TODAY);
      expect(emitted).not.toHaveBeenCalled();

      await setCheckDate(YESTERDAY);
      await service.recordCatalogReplacement([entry('a', null)], [entry('a', '2016-07-06')], TODAY);
      await service.takePending(TODAY);
      await service.takePending(TODAY);

      expect(emitted).toHaveBeenCalledTimes(1);
    });

    it('treats unreadable log data as an empty log', async () => {
      for (const value of ['{not json', 'null', '{"loggedOn":"2026-10-15"}']) {
        await engine.putSyncMeta({ key: 'availabilityChangeLog', value });

        expect(await service.getLog()).toEqual([]);
      }
    });
  });

  it('treats unreadable pending data as nothing pending', async () => {
    for (const value of ['{not json', 'null', '{"id":"a"}']) {
      await engine.putSyncMeta({ key: 'pendingAvailabilityChanges', value });

      expect(await service.getPending()).toEqual([]);
    }
  });

  it('records over pending data that is valid JSON but not a list', async () => {
    await engine.putSyncMeta({ key: 'pendingAvailabilityChanges', value: 'null' });
    await setCheckDate(YESTERDAY);

    await service.recordCatalogReplacement([entry('a', null)], [entry('a', '2016-07-06')], TODAY);
    await service.publishPending();
    await service.acknowledge([]);

    expect(await pendingIds()).toEqual(['a:available']);
  });
});
