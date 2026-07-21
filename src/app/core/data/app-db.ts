import Dexie, { Table } from 'dexie';
import { Injectable } from '@angular/core';
import type {
  CatalogEntry,
  PogoEvent,
  ProgressEntry,
  Season,
  UserSettings,
} from '@go-gather/shared';
import type { ImageCacheRecord, OutboxEntry, SyncMetaEntry } from './storage-engine';

/** The single `settings` row is always keyed `id: 1`. */
export type SettingsRow = { id: 1 } & UserSettings;

/** The single `season` row is always keyed `id: 1`, same singleton pattern as SettingsRow. */
export type SeasonRow = { id: 1 } & Season;

@Injectable({ providedIn: 'root' })
export class AppDb extends Dexie {
  catalog!: Table<CatalogEntry, string>;
  progress!: Table<ProgressEntry, string>;
  settings!: Table<SettingsRow, number>;
  imageCache!: Table<ImageCacheRecord, string>;
  syncMeta!: Table<SyncMetaEntry, string>;
  outbox!: Table<OutboxEntry, string>;
  calendarEvents!: Table<PogoEvent, string>;
  season!: Table<SeasonRow, number>;

  constructor() {
    super('go-gather');

    this.version(1).stores({
      catalog: 'id, dexNr, pokedexType, speciesId',
      progress: 'catalogEntryId',
      settings: 'id',
      imageCache: 'key',
      syncMeta: 'key',
      outbox: 'opId, createdAt',
      calendarEvents: 'eventID, eventType, start',
      season: 'id',
    });
  }
}
