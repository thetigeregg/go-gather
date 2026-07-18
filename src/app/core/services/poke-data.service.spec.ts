import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { CatalogEntry } from '@go-gather/shared';
import { AppDb } from '../data/app-db';
import { DexieStorageEngine } from '../data/dexie-storage-engine';
import { StorageEngineFactory } from '../data/storage-engine.factory';
import { PokeDataService } from './poke-data.service';

vi.mock(
  '../data/storage-transaction-context',
  () => import('../data/storage-transaction-context.node')
);

function makeCatalogEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: 'bulbasaur-regular',
    dexNr: 1,
    generation: 1,
    speciesId: 'bulbasaur',
    formId: 'bulbasaur-normal',
    name: 'Bulbasaur',
    speciesName: 'Bulbasaur',
    imgUrl: '/images/bulbasaur.png',
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

describe('PokeDataService', () => {
  let db: AppDb;
  let engine: DexieStorageEngine;
  let service: PokeDataService;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [AppDb, DexieStorageEngine, StorageEngineFactory],
    });

    db = TestBed.inject(AppDb);
    engine = TestBed.inject(DexieStorageEngine);
    await TestBed.inject(StorageEngineFactory).initialize();
    service = TestBed.inject(PokeDataService);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('catalog is empty before loadCatalog is called', () => {
    expect(service.catalog).toEqual([]);
  });

  it('loadCatalog reads from StorageEngine and populates the catalog getter', async () => {
    await engine.bulkPutCatalog([makeCatalogEntry(), makeCatalogEntry({ id: 'ivysaur' })]);

    const result = await new Promise<readonly CatalogEntry[]>((resolve) => {
      service.loadCatalog().subscribe(resolve);
    });

    expect(result).toHaveLength(2);
    expect(service.catalog).toHaveLength(2);
  });

  it('resolveImgUrl prefixes relative image paths with environment.apiUrl', async () => {
    await engine.putCatalogEntry(makeCatalogEntry({ imgUrl: '/images/bulbasaur.png' }));

    const [entry] = await new Promise<readonly CatalogEntry[]>((resolve) => {
      service.loadCatalog().subscribe(resolve);
    });

    expect(entry.imgUrl).toBe('http://localhost:3000/images/bulbasaur.png');
  });

  it('leaves absolute image URLs untouched', async () => {
    await engine.putCatalogEntry(makeCatalogEntry({ imgUrl: 'https://example.com/bulbasaur.png' }));

    const [entry] = await new Promise<readonly CatalogEntry[]>((resolve) => {
      service.loadCatalog().subscribe(resolve);
    });

    expect(entry.imgUrl).toBe('https://example.com/bulbasaur.png');
  });
});
