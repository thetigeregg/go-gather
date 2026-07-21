import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

export interface SqliteStatement {
  statement: string;
  values: unknown[];
}

export interface SqliteRunResult {
  changes: number;
  lastId: number | undefined;
}

/**
 * Thin SQL execution surface the SqliteStorageEngine talks to. Production uses
 * the @capacitor-community/sqlite plugin; tests provide an in-process SQLite
 * implementation with the same semantics.
 */
export interface SqliteConnection {
  run(statement: string, values: unknown[]): Promise<SqliteRunResult>;
  query<T = Record<string, unknown>>(statement: string, values: unknown[]): Promise<T[]>;
  executeSet(statements: SqliteStatement[]): Promise<void>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  close(): Promise<void>;
}

export const SQLITE_DB_NAME = 'go-gather';
export const SQLITE_SCHEMA_VERSION = 1;

export const SQLITE_UPGRADE_STATEMENTS: { toVersion: number; statements: string[] }[] = [
  {
    toVersion: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS catalog (
        id TEXT PRIMARY KEY,
        dex_nr INTEGER NOT NULL,
        pokedex_type TEXT NOT NULL,
        species_id TEXT NOT NULL,
        payload TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_catalog_pokedex_type ON catalog (pokedex_type);`,
      `CREATE INDEX IF NOT EXISTS idx_catalog_species_id ON catalog (species_id);`,
      `CREATE TABLE IF NOT EXISTS progress (
        catalog_entry_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS image_cache_meta (
        key TEXT PRIMARY KEY,
        file_path TEXT,
        payload TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS outbox (
        op_id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_outbox_created_at ON outbox (created_at);`,
      `CREATE TABLE IF NOT EXISTS calendar_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        start TEXT NOT NULL,
        payload TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_calendar_events_event_type ON calendar_events (event_type);`,
      `CREATE TABLE IF NOT EXISTS season (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL
      );`,
    ],
  },
];

class CapacitorSqliteConnection implements SqliteConnection {
  constructor(
    private readonly sqlite: SQLiteConnection,
    private readonly db: SQLiteDBConnection,
    private readonly dbName: string
  ) {}

  async run(statement: string, values: unknown[]): Promise<SqliteRunResult> {
    const result = await this.db.run(statement, values, false);
    return {
      changes: result.changes?.changes ?? 0,
      lastId: result.changes?.lastId,
    };
  }

  async query<T = Record<string, unknown>>(statement: string, values: unknown[]): Promise<T[]> {
    const result = await this.db.query(statement, values);
    return (result.values ?? []) as T[];
  }

  async executeSet(statements: SqliteStatement[]): Promise<void> {
    if (statements.length === 0) {
      return;
    }

    await this.db.executeSet(
      statements.map((entry) => ({ statement: entry.statement, values: entry.values })),
      false
    );
  }

  async beginTransaction(): Promise<void> {
    await this.db.beginTransaction();
  }

  async commitTransaction(): Promise<void> {
    await this.db.commitTransaction();
  }

  async rollbackTransaction(): Promise<void> {
    await this.db.rollbackTransaction();
  }

  async close(): Promise<void> {
    await this.sqlite.closeConnection(this.dbName, false);
  }
}

/**
 * Opens (and migrates) the native SQLite database via the Capacitor plugin.
 * Only call on native platforms.
 */
export async function openCapacitorSqliteConnection(): Promise<SqliteConnection> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);

  await sqlite.addUpgradeStatement(SQLITE_DB_NAME, SQLITE_UPGRADE_STATEMENTS);

  const consistency = await sqlite.checkConnectionsConsistency();
  const isConnected = (await sqlite.isConnection(SQLITE_DB_NAME, false)).result ?? false;

  let db: SQLiteDBConnection;

  if (consistency.result && isConnected) {
    db = await sqlite.retrieveConnection(SQLITE_DB_NAME, false);
  } else {
    db = await sqlite.createConnection(
      SQLITE_DB_NAME,
      false,
      'no-encryption',
      SQLITE_SCHEMA_VERSION,
      false
    );
  }

  await db.open();

  return new CapacitorSqliteConnection(sqlite, db, SQLITE_DB_NAME);
}
