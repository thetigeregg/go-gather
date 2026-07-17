import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CatalogEntry, ProgressEntry, UserSettings } from '@go-gather/shared';
import { DEFAULT_SETTINGS } from '@go-gather/shared';
import type { ImageCacheRecord, StorageEngine, SyncMetaEntry } from './storage-engine';

export interface StorageEngineContractHarness {
  engine: StorageEngine;
  cleanup: () => Promise<void>;
}

export function makeContractCatalogEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: 'bulbasaur-regular',
    dexNr: 1,
    generation: 1,
    speciesId: 'bulbasaur',
    formId: 'bulbasaur-normal',
    name: 'Bulbasaur',
    speciesName: 'Bulbasaur',
    imgUrl: 'https://example.com/bulbasaur.png',
    isShiny: false,
    isFemale: false,
    form: null,
    costume: null,
    region: null,
    primaryType: 'grass',
    secondaryType: 'poison',
    pokemonClass: null,
    isBaseForm: true,
    pokedexType: 'regular',
    order: 1,
    ...overrides,
  };
}

export function makeContractProgressEntry(overrides: Partial<ProgressEntry> = {}): ProgressEntry {
  return {
    catalogEntryId: 'bulbasaur-regular',
    caught: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeContractSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
}

export function makeContractImageCacheRecord(
  overrides: Partial<ImageCacheRecord> = {}
): ImageCacheRecord {
  return {
    key: 'bulbasaur-regular',
    blob: undefined,
    filePath: null,
    ...overrides,
  };
}

export function makeContractSyncMetaEntry(overrides: Partial<SyncMetaEntry> = {}): SyncMetaEntry {
  return {
    key: 'catalogVersion',
    value: '1',
    ...overrides,
  };
}

/**
 * Behavioral contract every StorageEngine implementation must satisfy.
 * Run from an engine-specific spec file by providing a factory that creates a
 * fresh engine (with empty storage) per test.
 */
export function describeStorageEngineContract(
  engineName: string,
  createHarness: () => Promise<StorageEngineContractHarness>
): void {
  describe(`StorageEngine contract: ${engineName}`, () => {
    let engine: StorageEngine;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const harness = await createHarness();
      engine = harness.engine;
      cleanup = harness.cleanup;
      await engine.initialize();
    });

    afterEach(async () => {
      await cleanup();
    });

    describe('catalog', () => {
      it('putCatalogEntry stores a row and getCatalogEntry retrieves it', async () => {
        await engine.putCatalogEntry(makeContractCatalogEntry());

        const stored = await engine.getCatalogEntry('bulbasaur-regular');
        expect(stored?.name).toBe('Bulbasaur');
      });

      it('putCatalogEntry replaces an existing row by id', async () => {
        await engine.putCatalogEntry(makeContractCatalogEntry());
        await engine.putCatalogEntry(makeContractCatalogEntry({ name: 'Bulbasaur (Shiny)' }));

        const stored = await engine.getCatalogEntry('bulbasaur-regular');
        expect(stored?.name).toBe('Bulbasaur (Shiny)');
        expect((await engine.listCatalog()).length).toBe(1);
      });

      it('bulkPutCatalog stores many rows and clearCatalog empties the store', async () => {
        const entries = Array.from({ length: 10 }, (_, index) =>
          makeContractCatalogEntry({ id: `entry-${String(index)}`, dexNr: index + 1 })
        );

        await engine.bulkPutCatalog(entries);
        expect((await engine.listCatalog()).length).toBe(10);

        await engine.clearCatalog();
        expect(await engine.listCatalog()).toEqual([]);
      });
    });

    describe('progress', () => {
      it('putProgress stores a row and getProgress retrieves it', async () => {
        await engine.putProgress(makeContractProgressEntry());

        const stored = await engine.getProgress('bulbasaur-regular');
        expect(stored?.caught).toBe(false);
      });

      it('putProgress replaces an existing row by catalogEntryId', async () => {
        await engine.putProgress(makeContractProgressEntry({ caught: false }));
        await engine.putProgress(
          makeContractProgressEntry({ caught: true, updatedAt: '2026-01-02T00:00:00.000Z' })
        );

        const stored = await engine.getProgress('bulbasaur-regular');
        expect(stored?.caught).toBe(true);
        expect((await engine.listProgress()).length).toBe(1);
      });

      it('bulkPutProgress stores many rows', async () => {
        await engine.bulkPutProgress([
          makeContractProgressEntry({ catalogEntryId: 'a' }),
          makeContractProgressEntry({ catalogEntryId: 'b' }),
        ]);

        expect((await engine.listProgress()).length).toBe(2);
      });
    });

    describe('settings', () => {
      it('putSettings stores the singleton row and getSettings retrieves it', async () => {
        await engine.putSettings(makeContractSettings({ pokedexType: 'mega' }));

        const stored = await engine.getSettings();
        expect(stored?.pokedexType).toBe('mega');
      });

      it('putSettings replaces the existing row rather than adding a second one', async () => {
        await engine.putSettings(makeContractSettings({ shinyFilter: 'shiny' }));
        await engine.putSettings(makeContractSettings({ shinyFilter: 'non-shiny' }));

        const stored = await engine.getSettings();
        expect(stored?.shinyFilter).toBe('non-shiny');
      });
    });

    describe('image cache', () => {
      it('supports put, get, delete and clear', async () => {
        await engine.putImage(makeContractImageCacheRecord({ key: 'a' }));
        await engine.putImage(makeContractImageCacheRecord({ key: 'b' }));

        expect((await engine.getImage('a'))?.key).toBe('a');

        await engine.deleteImage('a');
        expect(await engine.getImage('a')).toBeUndefined();

        await engine.clearImageCache();
        expect(await engine.getImage('b')).toBeUndefined();
      });
    });

    describe('syncMeta', () => {
      it('supports put and get, replacing an existing key', async () => {
        await engine.putSyncMeta(makeContractSyncMetaEntry({ key: 'catalogVersion', value: '1' }));
        expect((await engine.getSyncMeta('catalogVersion'))?.value).toBe('1');

        await engine.putSyncMeta(makeContractSyncMetaEntry({ key: 'catalogVersion', value: '2' }));
        expect((await engine.getSyncMeta('catalogVersion'))?.value).toBe('2');
      });
    });

    describe('transactions', () => {
      it('commits writes across scopes', async () => {
        await engine.runInTransaction(['catalog', 'syncMeta'], async () => {
          await engine.putCatalogEntry(makeContractCatalogEntry());
          await engine.putSyncMeta(makeContractSyncMetaEntry());
        });

        expect((await engine.listCatalog()).length).toBe(1);
        expect(await engine.getSyncMeta('catalogVersion')).toBeDefined();
      });

      it('rolls back all writes when the action throws', async () => {
        await engine.putCatalogEntry(makeContractCatalogEntry({ id: 'keep' }));

        await expect(
          engine.runInTransaction(['catalog', 'syncMeta'], async () => {
            await engine.putCatalogEntry(makeContractCatalogEntry({ id: 'rolled-back' }));
            await engine.putSyncMeta(makeContractSyncMetaEntry());
            throw new Error('boom');
          })
        ).rejects.toThrow('boom');

        const entries = await engine.listCatalog();
        expect(entries.map((entry) => entry.id)).toEqual(['keep']);
        expect(await engine.getSyncMeta('catalogVersion')).toBeUndefined();
      });

      it('supports reads of own writes within a transaction', async () => {
        await engine.runInTransaction(['syncMeta'], async () => {
          await engine.putSyncMeta(makeContractSyncMetaEntry({ value: '7' }));
          const stored = await engine.getSyncMeta('catalogVersion');
          expect(stored?.value).toBe('7');
          await engine.putSyncMeta(makeContractSyncMetaEntry({ value: '8' }));
        });

        expect((await engine.getSyncMeta('catalogVersion'))?.value).toBe('8');
      });

      it('nested runInTransaction calls join the outer transaction', async () => {
        await engine.runInTransaction(['catalog', 'syncMeta'], async () => {
          await engine.putCatalogEntry(makeContractCatalogEntry({ id: 'outer' }));

          await engine.runInTransaction(['syncMeta'], async () => {
            await engine.putSyncMeta(makeContractSyncMetaEntry({ key: 'nested', value: 'x' }));
          });
        });

        expect((await engine.listCatalog()).map((entry) => entry.id)).toEqual(['outer']);
        expect((await engine.getSyncMeta('nested'))?.value).toBe('x');
      });

      it('rolls back nested writes when the inner action throws', async () => {
        await engine.putCatalogEntry(makeContractCatalogEntry({ id: 'keep' }));

        await expect(
          engine.runInTransaction(['catalog', 'syncMeta'], async () => {
            await engine.putCatalogEntry(makeContractCatalogEntry({ id: 'outer' }));

            await engine.runInTransaction(['syncMeta'], async () => {
              await engine.putSyncMeta(makeContractSyncMetaEntry({ key: 'nested', value: 'x' }));
              throw new Error('inner boom');
            });
          })
        ).rejects.toThrow('inner boom');

        expect((await engine.listCatalog()).map((entry) => entry.id)).toEqual(['keep']);
        expect(await engine.getSyncMeta('nested')).toBeUndefined();
      });

      it('serializes concurrent independent transactions', async () => {
        const events: string[] = [];

        const firstTransaction = engine.runInTransaction(['catalog'], async () => {
          events.push('tx1-start');
          await engine.putCatalogEntry(makeContractCatalogEntry({ id: 'tx1' }));

          const holdUntil = Date.now() + 75;
          while (Date.now() < holdUntil) {
            await engine.getCatalogEntry('tx1');
          }

          events.push('tx1-end');
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        const secondTransaction = engine.runInTransaction(['catalog'], async () => {
          events.push('tx2-start');
          await engine.putCatalogEntry(makeContractCatalogEntry({ id: 'tx2' }));
          events.push('tx2-end');
        });

        await Promise.all([firstTransaction, secondTransaction]);

        expect(events.indexOf('tx1-end')).toBeLessThan(events.indexOf('tx2-start'));
        expect((await engine.listCatalog()).map((entry) => entry.id).sort()).toEqual([
          'tx1',
          'tx2',
        ]);
      });
    });
  });
}
