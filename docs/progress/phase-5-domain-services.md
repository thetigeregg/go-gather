# Phase 5 — Domain Services: progress notes

Status: complete for the single checklist item "Port domain services, re-pointed at `StorageEngine`" (this item is filed under Phase 5 in `MIGRATION-CHECKLIST.md`, though it was requested as "phase 4" — planned and executed as named regardless of numbering). The rest of Phase 5 (component/page rebuild, export/import via Capacitor) is not in scope here. `npm run lint`, `npm run test` (19 files, 149 tests), and `npm run build` all pass.

## Scope

Five services ported from `go-gather-next/src/app/core/services/`: `poke-data.service.ts`, `user-data.service.ts`, `filter.service.ts`, `search-config.service.ts`, `search-string.service.ts`. Only two needed I/O re-pointing — the other three are pure view-model/string-building logic with no HTTP calls of their own.

- **`poke-data.service.ts`**: `loadCatalog()` now reads `StorageEngine.listCatalog()` instead of `HttpClient.get('/api/catalog')` — no network call in this service anymore, since the catalog is kept in sync on-device by Phase 4's `SyncService`. `resolveImgUrl()` keeps prefixing relative `/images/...` paths with `environment.apiUrl`, unchanged.
- **`user-data.service.ts`**: injects `LocalUserDataRepository` instead of `HttpClient`. `loadProgress()`/`loadSettings()` hydrate from `repository.listProgress()`/`repository.getSettings()` (falling back to `DEFAULT_SETTINGS`). `setEntryState()`/`updateUserSettings()` keep the same optimistic-update-then-fire-and-forget-persist shape, just against the repository instead of `HttpClient.put`. `importBundle()` now calls `repository.updateSettings()` + the new `bulkSetCaught()` (below), then re-runs `loadProgress()` to refresh in-memory state.
- **`filter.service.ts`** / **`search-string.service.ts`**: ported unchanged — diffed against the go-gather-next originals; the only differences are go-gather's stricter `strictTypeChecked` lint config forcing `inject()` over constructor-parameter injection, `String(generation)` instead of a bare numeric template-literal interpolation, and `entry.region?.toString() === userSettings.regionFilter` instead of a direct enum-vs-string-literal comparison (`Region` is a real TS enum; `RegionFilter` is a string-literal union — go-gather-next's own config doesn't flag comparing them, go-gather's does).
- **`search-config.service.ts`**: kept as a direct `HttpClient` call — see scope call below. Only change: `environment.apiBaseUrl` → `environment.apiUrl`, and constructor injection → `inject()`.

## Scope calls

1. **`search-config.service.ts` keeps its direct `HttpClient` call**, rather than moving behind `StorageEngine`. Unlike catalog/progress/settings, `sync-overrides.json` is explicitly designed to be re-read fresh on every request, never cached or synced — it doesn't fit any of the `StorageEngine` scopes built so far.
2. **`LocalUserDataRepository.bulkSetCaught()` doesn't destructively clear existing progress first**, unlike the old server's `PUT /api/progress` (full delete + reinsert). Local-first means an import bundle shouldn't wipe local state that might be newer than the bundle — `bulkSetCaught()` upserts only the entries the bundle contains, inside one `runInTransaction(['progress', 'outbox'], ...)` so a bundle import produces N outbox rows committed atomically, which `SyncService.pushOutbox()` then batches into a single push.

## Bootstrap hydration

`main.ts`'s existing `provideAppInitializer` chain (`StorageEngineFactory.initialize()` → `SyncService.initialize()`) was extended to also resolve `userDataService.loadSettings()`, `userDataService.loadProgress()`, and `pokeDataService.loadCatalog()` in between — all `firstValueFrom`'d in parallel via `Promise.all`, after the storage engine is ready but before `syncService.initialize()` is called. This preserves go-gather-next's guarantee that settings/progress/catalog are hydrated before bootstrap completes (some components read `getUserSettings()`/`catalog` synchronously in their constructors), just sourced from the local `StorageEngine` instead of an independent `HttpClient` call.

## Tests

One spec file per service (19 files total across the whole suite, 149 tests). `poke-data.service.spec.ts`/`user-data.service.spec.ts` use a real `DexieStorageEngine` over `fake-indexeddb`, matching `local-user-data-repository.spec.ts`'s existing pattern, rather than hand-rolled mocks. `search-config.service.spec.ts` uses `HttpTestingController`, matching `sync.service.spec.ts`'s pattern. `filter.service.spec.ts`/`search-string.service.spec.ts` need no I/O mocking — fixture `CatalogEntry[]`/`UserSettings` objects with `useValue` getter-backed fakes for their service dependencies; there were no existing tests in go-gather-next to port forward, so this is net-new coverage (same situation as Phase 3's search-engine port).

One test bug caught during verification: an initial `filter.service.spec.ts` test for `regionFilter` gave its "alolan-form" fixture `generation: 1` — the same generation as the "kanto-origin" fixture — which meant it matched `regionFilter: 'kanto'` too, via the intentional "origin generation OR alternate-form region" OR-semantics documented in `filter.service.ts`. That's correct behavior, not a bug; the test's assumption was wrong. Fixed by moving the alolan-form fixture to `generation: 3` so the origin-region and form-region checks are actually independent in the test.

## Deferred

No component/page work is in scope for this item — the consuming UI (side-menu, poke-group, settings-dialog, etc.) is the rest of Phase 5, still pending.
