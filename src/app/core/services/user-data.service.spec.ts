import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DEFAULT_SETTINGS, ExportBundle } from '@go-gather/shared';
import { AppDb } from '../data/app-db';
import { DexieStorageEngine } from '../data/dexie-storage-engine';
import { LocalUserDataRepository } from '../data/local-user-data-repository';
import { STORAGE_ENGINE } from '../data/storage-engine';
import { UserDataService } from './user-data.service';

vi.mock(
  '../data/storage-transaction-context',
  () => import('../data/storage-transaction-context.node')
);

describe('UserDataService', () => {
  let db: AppDb;
  let service: UserDataService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AppDb,
        DexieStorageEngine,
        { provide: STORAGE_ENGINE, useExisting: DexieStorageEngine },
        LocalUserDataRepository,
      ],
    });

    db = TestBed.inject(AppDb);
    service = TestBed.inject(UserDataService);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('getUserSettings returns DEFAULT_SETTINGS before loadSettings is called', () => {
    expect(service.getUserSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('loadSettings hydrates from local storage, falling back to DEFAULT_SETTINGS', async () => {
    const settings = await new Promise((resolve) => {
      service.loadSettings().subscribe(resolve);
    });

    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(service.getUserSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('setEntryState updates in-memory state immediately and persists via the repository', async () => {
    service.setEntryState('bulbasaur-regular', true);

    expect(service.getItemState('bulbasaur-regular')).toBe(true);

    // Persistence is fire-and-forget; wait a tick for it to land.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const repository = TestBed.inject(LocalUserDataRepository);
    expect((await repository.getProgress('bulbasaur-regular'))?.caught).toBe(true);
  });

  it('toggleEntryState flips the current state, defaulting to false when unset', () => {
    expect(service.getItemState('bulbasaur-regular')).toBe(false);

    service.toggleEntryState('bulbasaur-regular');
    expect(service.getItemState('bulbasaur-regular')).toBe(true);

    service.toggleEntryState('bulbasaur-regular');
    expect(service.getItemState('bulbasaur-regular')).toBe(false);
  });

  it('updateUserSettings merges partial changes and emits a change notification', () => {
    const emitted: unknown[] = [];
    service.listenForUserSettingsChanges().subscribe((settings) => emitted.push(settings));

    service.updateUserSettings({ pokedexType: 'mega' });

    expect(service.getUserSettings().pokedexType).toBe('mega');
    expect(emitted).toHaveLength(1);
  });

  it('exportBundle reflects current progress and settings', () => {
    service.setEntryState('a', true);
    service.updateUserSettings({ userTags: ['tag1'] });

    const bundle = service.exportBundle();

    expect(bundle.version).toBe(1);
    expect(bundle.progress).toEqual([
      { catalogEntryId: 'a', caught: true, updatedAt: expect.any(String) as string },
    ]);
    expect(bundle.userTags).toEqual(['tag1']);
  });

  it('importBundle applies settings and progress, then refreshes local state', async () => {
    const bundle: ExportBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      progress: [
        { catalogEntryId: 'x', caught: true, updatedAt: new Date().toISOString() },
        { catalogEntryId: 'y', caught: false, updatedAt: new Date().toISOString() },
      ],
      excludedNamePatterns: ['imported-pattern'],
      excludedDexNumbers: [7],
      excludedShinyDexNumbers: [],
      excludedShinyNamePatterns: [],
      userTags: ['imported-tag'],
      presetQueries: [],
    };

    const progress = await new Promise((resolve) => {
      service.importBundle(bundle).subscribe(resolve);
    });

    expect(progress).toHaveLength(2);
    expect(service.getItemState('x')).toBe(true);
    expect(service.getItemState('y')).toBe(false);
    expect(service.getUserSettings().excludedNamePatterns).toEqual(['imported-pattern']);
    expect(service.getUserSettings().userTags).toEqual(['imported-tag']);
  });

  it("importBundle doesn't clear progress entries absent from the bundle", async () => {
    service.setEntryState('pre-existing', true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const bundle: ExportBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      progress: [
        { catalogEntryId: 'new-entry', caught: true, updatedAt: new Date().toISOString() },
      ],
      excludedNamePatterns: [],
      excludedDexNumbers: [],
      excludedShinyDexNumbers: [],
      excludedShinyNamePatterns: [],
      userTags: [],
      presetQueries: [],
    };

    await new Promise((resolve) => {
      service.importBundle(bundle).subscribe(resolve);
    });

    expect(service.getItemState('pre-existing')).toBe(true);
    expect(service.getItemState('new-entry')).toBe(true);
  });
});
