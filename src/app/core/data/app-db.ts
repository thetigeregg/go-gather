import Dexie, { Table } from 'dexie';
import { Injectable } from '@angular/core';
import type { CatalogEntry, ProgressEntry, UserSettings } from '@go-gather/shared';
import type { ImageCacheRecord, SyncMetaEntry } from './storage-engine';

/** The single `settings` row is always keyed `id: 1`. */
export type SettingsRow = { id: 1 } & UserSettings;

@Injectable({ providedIn: 'root' })
export class AppDb extends Dexie {
  catalog!: Table<CatalogEntry, string>;
  progress!: Table<ProgressEntry, string>;
  settings!: Table<SettingsRow, number>;
  imageCache!: Table<ImageCacheRecord, string>;
  syncMeta!: Table<SyncMetaEntry, string>;

  constructor() {
    super('go-gather');

    this.version(1).stores({
      catalog: 'id, dexNr, pokedexType, speciesId',
      progress: 'catalogEntryId',
      settings: 'id',
      imageCache: 'key',
      syncMeta: 'key',
    });
  }
}
