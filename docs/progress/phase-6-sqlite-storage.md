# Phase 6 — SqliteStorageEngine + ImageFileStore

Status: complete. `npm run lint` (0 errors, 1 pre-existing unrelated warning about `server/src/db.ts`), `npm run test` (33 files, 291 tests — up from 263: the shared `StorageEngine` contract suite now runs a second time against `SqliteStorageEngine`, all 20 tests passing genuinely against a real SQLite engine via `sql.js`, plus 8 new `ImageFileStore` unit tests), and `npm run build` all pass. `npx cap sync ios` completed successfully and reports `@capacitor-community/sqlite@8.1.0` installed alongside the existing plugins. No on-device verification in this pass — that's this phase's later checklist item ("Build and run on a personal device, verify native feature parity").

This closes the "Done when" checklist line: _"`StorageEngine` contract tests pass against both Dexie and SQLite engines."_

## What changed

- **New**: `src/app/core/data/sqlite-connection.ts` — `SqliteConnection` interface (`run`/`query`/`executeSet`/`begin|commit|rollbackTransaction`/`close`), schema/upgrade statements, `CapacitorSqliteConnection` (wraps `@capacitor-community/sqlite`), `openCapacitorSqliteConnection()`.
- **New**: `src/app/core/data/sqlite-storage-engine.ts` — `SqliteStorageEngine implements StorageEngine`, covering all 6 scopes (catalog/progress/settings/imageCache/syncMeta/outbox).
- **New**: `src/app/core/data/image-file-store.ts` — native filesystem-backed image byte storage.
- **New**: `src/app/core/data/sqlite-storage-engine.spec.ts` / `image-file-store.spec.ts`.
- **`src/app/core/data/storage-engine.factory.ts`**: added the native branch — `isNativePlatform()` → dynamically `import()`s `sqlite-connection`/`sqlite-storage-engine` (confirmed via `npm run build`'s output that these land in their own lazy chunks, not the initial web bundle) → opens the connection → falls back to Dexie on any failure (module load, connection open), closing any half-opened connection best-effort.
- **`capacitor.config.ts`**: added `CapacitorSQLite: { iosDatabaseLocation: 'Library/CapacitorDatabase', iosIsEncryption: false }`.
- **`package.json`**: added `@capacitor-community/sqlite ^8.1.0` (runtime) and `sql.js ^1.14.1` / `@types/sql.js ^1.4.11` (dev, for the in-process contract-test harness — no device/simulator needed to run the suite).

## Blueprint and deliberate simplifications versus game-shelf

game-shelf's `SqliteStorageEngine`/`sqlite-connection.ts`/`image-file-store.ts` were the direct port source, but go-gather's `StorageEngine` interface is considerably simpler than game-shelf's, and the port reflects that rather than carrying over complexity that has nothing to attach to here:

1. **No autoincrement-id / `lastId` machinery.** game-shelf's `games`/`tags`/`views` use SQLite `AUTOINCREMENT` ids with a `requireLastId()` helper and separate `addX`/`putX` paths. Every one of go-gather's tables has a natural, caller-provided string primary key (`id`, `catalogEntryId`, `key`, `opId`) — every write is a single `INSERT ... ON CONFLICT(pk) DO UPDATE SET ...` upsert, full stop.
2. **No constraint-error-mapping (`toConstraintError`/`isStorageConstraintError` wiring).** game-shelf needs this because `games`/`tags` have real uniqueness scenarios the contract suite exercises (igdb identity, case-insensitive tag names). Nothing in go-gather's schema can produce a legitimate unique-constraint conflict — skipped rather than building defensive machinery for a case that structurally cannot occur.
3. **No `StorageMigrationService`.** `STORAGE-MIGRATION.md` itself says to skip the actual IndexedDB→SQLite migration logic (no prior web-only install exists to migrate) but keep the factory/fallback shape — which is exactly what's built. An always-no-op migration-service class on top of that would be a premature abstraction with zero present use.
4. **No `DebugLogService`.** go-gather has no equivalent of game-shelf's structured debug-logging service; `SqliteStorageEngine`'s constructor takes just `connection`, matching `DexieStorageEngine`'s existing no-logging pattern in this codebase. Engine-selection failures still log via plain `console.error` in the factory's fallback path.
5. **`ImageFileStore` is much smaller.** go-gather's `ImageCacheRecord` is just `{key, blob?, filePath?}` — no `gameKey`/`variant` scoping, no size-limit/LRU eviction concept (those don't exist anywhere in go-gather's `StorageEngine` interface). `writeImage(key, blob)`/`getDisplayUrl(filePath)`/`deleteImage(filePath)`/`clear()`, same SHA-256-hashed-filename-under-`Directory.Cache` approach as game-shelf, nothing more.
6. **No new `PrivacyInfo.xcprivacy` entries.** Confirmed by reading game-shelf's actual manifest (also using `@capacitor-community/sqlite`): only the same two declarations go-gather already has (`FileTimestamp` for Filesystem, `UserDefaults` for Preferences). SQLite isn't one of Apple's tracked Required-Reason categories.

Everything else ported closely: the JSON-payload-column hybrid schema (indexed lookup/ordering columns + full entity as a `payload` TEXT column, matching `STORAGE-MIGRATION.md`'s prescription and mirroring the Dexie schema's indexes even though nothing queries by them yet), the transaction-queue-plus-zone-joining `runInTransaction` shape (byte-identical to both `DexieStorageEngine` and game-shelf's engine), and reuse of the **existing, unmodified** `storage-transaction-context.ts`/`.node.ts` (already shared with the Dexie engine since Phase 2 — no changes needed there at all).

## Scope: infrastructure only

Per an explicit scope decision at planning time: this task does **not** wire a real image-caching consumer into the UI. The `imageCache` scope now works correctly end-to-end on both engines (`getImage`/`putImage`/`deleteImage`/`clearImageCache`, contract-tested against both), but nothing in `gather-entry.component.ts` calls it yet — sprites still load via a direct `<img [src]>` network URL, same as before this task. Wiring a real consumer (fetch-once-and-cache, native-vs-web branching via `ImageFileStore`) is left for a future, explicitly separate task.

## Tests

`sqlite-storage-engine.spec.ts` ports game-shelf's `InProcessSqliteConnection` (backed by `sql.js`, a WASM SQLite build) implementing the same `SqliteConnection` contract the real Capacitor-backed connection does, then calls the existing `describeStorageEngineContract('SqliteStorageEngine', ...)` — the exact same 20-test shared suite `dexie-storage-engine.spec.ts` already ran, now run a second time against a real (if in-process) SQLite engine: catalog/progress/settings/image-cache/syncMeta/outbox CRUD, and the full transactions block (cross-scope commit, rollback-on-throw, atomic domain-write + outbox-enqueue and its rollback, read-your-writes, nested-transaction joining and rollback, and independent-transaction serialization).

`image-file-store.spec.ts`: write hashes the key into a stable `image-cache/<sha256>` path (same key → same path, confirmed across two calls); `getDisplayUrl` returns `null` when the file is missing and a real `Capacitor.convertFileSrc()`-resolved URL when it exists; delete and clear both tolerate already-missing files/directories without throwing.

## Deferred

Remaining Phase 6 checklist items: dual dev/prod Xcode targets + signing scaffolding, then an actual on-device build/run to verify native feature parity (including, for the first time, `SqliteStorageEngine` running for real rather than via the `sql.js` test harness).
