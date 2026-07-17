# Phase 4 — Catalog Data Pipeline: progress notes

Status: complete. `npm run lint`, `npm run test` (14 files, 112 tests), and `npm run build -- --configuration production` all pass. The real sync pipeline was run against live APIs (confirmed with you first, given it's a genuine multi-minute network operation): 8984 catalog entries synced from 1023 species, 3646 sprites downloaded. The server was started and every route exercised with real `curl` requests, including a simulated second "device" reconstructing full history from `cursor: 0`.

## The architecture correction (read this first)

This phase went through **two wrong drafts before landing on the right design** — worth recording so future phases don't repeat the mistake:

1. **First draft** (before this session): assumed a fully local-first design where the backend only serves the catalog and has no role in progress/settings at all. This contradicted nothing yet, but was never actually validated against what "keep a live backend" should mean.
2. **Second draft** (start of this phase): planning Phase 4, I proposed dropping `/api/progress` and `/api/settings` from the server entirely, reasoning that Phase 2's local StorageEngine made them redundant. **You corrected this**: the backend should be the source of truth for progress/settings too, matching game-shelf's actual architecture — not the design I'd inferred.
3. **Actual design** (this phase, verified against game-shelf's real code — `local-game-repository.ts`, `sync-outbox-writer.ts`, `game-sync.service.ts`, and its Postgres `server/src/sync.ts`): the local `StorageEngine` is what the UI reads/writes (instant, offline-capable). Every write is wrapped in one transaction that both updates the entity table _and_ enqueues an `outbox` entry. A sync service drains the outbox to the server (push) and pulls the server's append-only change log by cursor (pull). The server is the durable, idempotent source of truth.

This also meant retroactively fixing **Phase 2**, which had explicitly (and, it turned out, wrongly) decided not to build an `outbox` scope. See the "Phase 2 addendum" section below.

## Phase 2 addendum: the `outbox` scope

- `storage-engine.ts`: `StorageScope` gained `'outbox'`; new `OutboxEntry` type (`opId`, `entityType: 'progress' | 'settings'`, `operation: 'upsert'` — only upsert, unlike game-shelf's games/tags/views which also delete); five new interface methods.
- `app-db.ts`/`dexie-storage-engine.ts`: `outbox` table (`opId` PK, indexed by `createdAt`) and its CRUD, following the existing per-scope pattern exactly.
- `storage-engine.contract.ts`: an `outbox` describe block, plus two new transaction tests specifically exercising the "atomic write + outbox enqueue" pattern (commit together, roll back together) — this is the actual mechanism the whole design depends on, so it gets its own explicit contract coverage, not just incidental coverage via the progress/catalog transaction tests.

## What changed in Phase 4 proper

- **`server/` workspace package created** (deferred from Phase 2). Root `package.json`'s `"workspaces"` now `["shared", "server"]`.
- **Catalog pipeline ported near-verbatim**: `sync.ts`, `transform.ts`, `pokeapi.ts`, `sync-overrides.json` copied from `go-gather-next/server/src/`. Diffed against the originals afterward — `transform.ts` and `pokeapi.ts` are identical except for one added `eslint-disable` comment block each (go-gather's stricter `strictTypeChecked` config flags style issues go-gather-next's own config doesn't enforce — same tradeoff as Phase 3's search-engine port). `sync.ts` additionally gained one small, clearly-marked addition: a `markCatalogSynced()` function + one call site, writing a `sync_meta.catalogSyncedAt` timestamp — the minimum needed for the checklist's explicit "syncMeta version tracking" requirement, since the original pipeline has no versioning concept at all.
- **`db.ts`**: kept all three original tables (`pokemon_catalog`, `user_progress`, `user_settings`) — reversing my second-draft plan to drop the latter two. Added `idempotency_keys`, `sync_events`, and `sync_meta` (server-side, distinct from the client's `syncMeta` scope).
- **`api.ts`**: kept `GET /api/catalog` (now enveloped as `{ syncedAt, entries }` instead of a bare array) and `GET /api/search-config` (unchanged). Dropped the direct `/api/progress`/`/api/settings` CRUD routes entirely — replaced with `POST /api/sync/push` and `POST /api/sync/pull`, adapted from game-shelf's Postgres sync routes to SQLite (idempotency-key dedup, append-only event log, cursor-based pull).
- **Angular sync layer**: `SyncOutboxWriter` interface + token, `LocalUserDataRepository` (atomic write + outbox enqueue, mirroring game-shelf's `withOutboxTransaction`), `SyncService` (implements `SyncOutboxWriter`; one `syncNow()` cycle handling outbox push, change-log pull, and catalog pull; triggered by a 30s interval, a `navigator.onLine`/`window online` listener, and immediately after each local write).
- **`environment.ts`/`environment.prod.ts`** gained a real `apiUrl` (`http://localhost:3000`) — first real use of these previously-orphaned stock files. Production doesn't have a real hosted backend yet, so it points at the same localhost value with a `TODO(Phase 10)` comment.

## Simplifications vs. game-shelf (deliberate, documented)

- **No jsonb-style partial-field merge**: game-shelf needs this because concurrent editors can each send a subset of a game's fields; go-gather's `progress`/`settings` payloads are always sent whole, so a plain upsert-replace is correct and sufficient.
- **No push-body batching/chunking**: game-shelf caps push bodies at 8MB across many games; go-gather's payloads (a handful of small progress rows or one settings object) will never approach that.
- **No 24h self-healing replay pass**: game-shelf re-pulls the last 5000 events every 24h as insurance against silently-missed applies. Not built here — can be added later if it proves necessary in practice.
- **Plain `navigator.onLine` + `window` `online` event**, instead of porting game-shelf's dedicated `NetworkConnectivityService`/`RuntimeAvailabilityService`. Those services do more (API-reachability probing, not just browser connectivity), which isn't needed yet for a single lightweight sync loop.

## A real bootstrap-ordering bug caught during implementation

`SyncService` was originally written with `private readonly engine: StorageEngine = inject(STORAGE_ENGINE);` as a field initializer. Since `SyncService` is constructed inside the same `provideAppInitializer` callback that calls `StorageEngineFactory.initialize()`, and Angular's `inject()` calls in field initializers run synchronously at construction time — `inject(SyncService)` would construct it (and thus resolve `STORAGE_ENGINE`, which throws until the factory has initialized) _before_ `storageEngineFactory.initialize()` had actually resolved, regardless of `.then()` chaining in the initializer body. Fixed by having `SyncService` hold onto `StorageEngineFactory` instead and resolve the engine lazily via a private getter (`get engine() { return this.storageEngineFactory.getEngine(); }`), so the actual `getEngine()` call only happens when a sync method runs — by which point initialization has genuinely completed.

## Deferred to later phases

- **Sprite image caching**: `imgUrl` values point at the server's `/images/*` static route. Actual Blob-caching into the `imageCache` `StorageEngine` scope is deferred to Phase 5, when UI components exist that actually render sprites and would trigger image loads — wiring a cache nobody reads from yet would be untestable.
- **Native/SQLite storage engine**: still Phase 6, unaffected by this phase's changes (the `outbox` scope was added to the interface and the Dexie engine only; the SQLite engine will need the same additions when it's built).
- **Real production backend URL**: `environment.prod.ts`'s `apiUrl` is a placeholder until Phase 10 (Backend Deploy) stands up a real hosted instance.
