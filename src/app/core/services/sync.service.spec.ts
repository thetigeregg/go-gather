import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@go-gather/shared';
import { AppDb } from '../data/app-db';
import { DexieStorageEngine } from '../data/dexie-storage-engine';
import { StorageEngineFactory } from '../data/storage-engine.factory';
import { SyncService } from './sync.service';

vi.mock(
  '../data/storage-transaction-context',
  () => import('../data/storage-transaction-context.node')
);

/** Dexie/fake-indexeddb operations resolve via the real event loop, not pure
 * microtasks, and each sync step chains several of them before making its
 * HTTP call — polls (rather than a single fixed delay) until the request
 * appears, so the wait scales with however many ticks the chain actually
 * needs instead of guessing a fixed count. */
async function waitForRequest(httpMock: HttpTestingController, url: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const matches = httpMock.match(url);
    if (matches.length > 0) {
      return matches[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error(`Timed out waiting for request to ${url}`);
}

describe('SyncService', () => {
  let db: AppDb;
  let engine: DexieStorageEngine;
  let httpMock: HttpTestingController;
  let syncService: SyncService;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AppDb,
        DexieStorageEngine,
        StorageEngineFactory,
      ],
    });

    db = TestBed.inject(AppDb);
    engine = TestBed.inject(DexieStorageEngine);
    await TestBed.inject(StorageEngineFactory).initialize();
    httpMock = TestBed.inject(HttpTestingController);
    syncService = TestBed.inject(SyncService);
  });

  afterEach(async () => {
    httpMock.verify();
    await db.delete();
  });

  it('pushes queued outbox entries and clears them on an applied result', async () => {
    await engine.putOutboxEntry({
      opId: 'op-1',
      entityType: 'progress',
      operation: 'upsert',
      payload: { catalogEntryId: 'a', caught: true, updatedAt: '2026-01-01T00:00:00.000Z' },
      clientTimestamp: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      attemptCount: 0,
      lastError: null,
    });

    const syncPromise = syncService.syncNow();

    const pushReq = await waitForRequest(httpMock, 'http://localhost:3000/api/sync/push');
    const pushBody = pushReq.request.body as { operations: unknown[] };
    expect(pushBody.operations).toHaveLength(1);
    pushReq.flush({ results: [{ opId: 'op-1', status: 'applied' }] });

    const pullReq = await waitForRequest(httpMock, 'http://localhost:3000/api/sync/pull');
    pullReq.flush({ cursor: '0', changes: [] });

    const catalogReq = await waitForRequest(httpMock, 'http://localhost:3000/api/catalog');
    catalogReq.flush({ syncedAt: null, entries: [] });

    await syncPromise;

    expect(await engine.listOutboxOrderedByCreatedAt()).toEqual([]);
  });

  it('applies pulled progress/settings changes locally and advances the cursor', async () => {
    // No outbox entries queued, so pushOutbox() is a no-op — no push request
    // is made at all (verified by httpMock.verify() in afterEach).
    const syncPromise = syncService.syncNow();

    const pullReq = await waitForRequest(httpMock, 'http://localhost:3000/api/sync/pull');
    const pullBody = pullReq.request.body as { cursor: number };
    expect(pullBody.cursor).toBe(0);
    pullReq.flush({
      cursor: '5',
      changes: [
        {
          eventId: '5',
          entityType: 'settings',
          operation: 'upsert',
          payload: { ...DEFAULT_SETTINGS, pokedexType: 'max' },
          serverTimestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    (await waitForRequest(httpMock, 'http://localhost:3000/api/catalog')).flush({
      syncedAt: null,
      entries: [],
    });

    await syncPromise;

    expect((await engine.getSettings())?.pokedexType).toBe('max');
    expect((await engine.getSyncMeta('progressSettingsCursor'))?.value).toBe('5');
  });

  it('replaces the local catalog when the server syncedAt changes, and skips when unchanged', async () => {
    const catalogEntry = {
      id: 'a',
      dexNr: 1,
      generation: 1,
      speciesId: 'a',
      formId: 'a',
      name: 'A',
      speciesName: 'A',
      imgUrl: '/images/a.png',
      isShiny: false,
      isFemale: false,
      form: null,
      costume: null,
      region: null,
      primaryType: 'grass',
      secondaryType: null,
      pokemonClass: null,
      isBaseForm: true,
      pokedexType: 'regular' as const,
      order: 0,
    };

    // No outbox entries queued in either sync below, so pushOutbox() is a
    // no-op each time — no push request is made (verified by
    // httpMock.verify() in afterEach).
    let syncPromise = syncService.syncNow();
    (await waitForRequest(httpMock, 'http://localhost:3000/api/sync/pull')).flush({
      cursor: '0',
      changes: [],
    });
    (await waitForRequest(httpMock, 'http://localhost:3000/api/catalog')).flush({
      syncedAt: '2026-01-01T00:00:00.000Z',
      entries: [catalogEntry],
    });
    await syncPromise;

    expect((await engine.listCatalog()).length).toBe(1);
    expect((await engine.getSyncMeta('catalogVersion'))?.value).toBe('2026-01-01T00:00:00.000Z');

    // Second sync with the same syncedAt should not touch the catalog again.
    syncPromise = syncService.syncNow();
    (await waitForRequest(httpMock, 'http://localhost:3000/api/sync/pull')).flush({
      cursor: '0',
      changes: [],
    });
    (await waitForRequest(httpMock, 'http://localhost:3000/api/catalog')).flush({
      syncedAt: '2026-01-01T00:00:00.000Z',
      entries: [],
    });
    await syncPromise;

    expect((await engine.listCatalog()).length).toBe(1);
  });
});
