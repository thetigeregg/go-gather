# Phase 5 — Component/Page Rebuild: chunking + Group 1 (Gather Page Core)

Status: Group 1 complete. `npm run lint`, `npm run test` (22 files, 162 tests), and `npm run build` all pass. Manually verified end-to-end in a real browser against the live backend (catalog loaded, 9 generation accordions rendered, 2774 regular-dex entries visible, catch-toggle click updates the header count live and persists across reload).

## Chunking

The 11 remaining UI components in `SCREEN-AND-FEATURE-MAP.md` were split into 5 groups, in the map's own recommended "lowest-risk first, preset query editor last" order:

1. **Gather page core** (this group) — `PokeGroupComponent`, `GatherPokemonComponent`, `GatherEntryComponent`, plus go-gather-next's `AppComponent` orchestration (catalog/progress/settings loading, header count, re-filter-on-change) moved into `GatherPage`.
2. **Side menu / filters** — `SideMenuComponent` → `IonMenu`, wired to `FilterService`/`UserDataService.updateUserSettings()`.
3. **Settings page** — `SettingsDialogComponent` → `settings.page.ts`.
4. **Search strings page** — `SearchStringsDialogComponent` → `search-strings.page.ts`, plus `SearchStringComponent`/`MultiSearchStringComponent`, plus `core/utils/general.util.ts` (its only consumer).
5. **Preset queries** — `PresetQueriesDialogComponent` → `preset-queries.page.ts`, `PresetQueryEditorComponent` → `preset-queries/:id/edit`. Highest complexity (~26 term-kind rule builder), done last.

## Group 1: what changed

- New `src/app/features/{poke-group,gather-pokemon,gather-entry}/` components (following game-shelf's `features/<name>/` convention for composed sub-components, rather than go-gather-next's `core/components/`).
- `PokeGroupComponent`: `p-panel` → `ion-accordion` (nested inside an `ion-accordion-group` in `gather.page.html`), same per-generation caught/total header-count logic, unchanged.
- `GatherPokemonComponent`: `p-card`/`p-divider` → `ion-card`/plain `<hr>`. Row-chunking logic (`ENTRIES_PER_ROW = 5`) ported verbatim — diffed against the go-gather-next original, identical apart from the markup swap.
- `GatherEntryComponent`: `p-image` → plain `<img>` + `(error)`, matching game-shelf's actual image-fallback pattern (game-shelf doesn't use `ion-img` anywhere). `p-selectButton` (multi-toggle-as-checkbox) → a single `ion-icon`/`ion-button`, icon registered via `addIcons()` locally in the component (game-shelf's per-component convention, no shared icon-registry file): shiny → `sparkles`, female → `female`, default → `checkmark-circle`.
- `gather.page.ts` absorbs `AppComponent`'s orchestration (`forkJoin` of catalog/progress/settings load, header count, re-filter on settings/progress change) — go-gather's `AppComponent` is already a thin `IonApp`/`IonRouterOutlet` shell from Phase 1, so this logic has nowhere else to live.
- Asset: `sprite-placeholder.png` copied to `src/assets/` (served at `/assets/sprite-placeholder.png`, not go-gather-next's root-served `/sprite-placeholder.png`).

**Scope call**: Export/Import buttons are dropped from `gather.page.ts` entirely for this pass, not stubbed — the checklist has its own separate item for rebuilding them via Capacitor filesystem/file-picker/share plugins, and wiring a temporary Blob/`<input type=file>` version now would just be redone later.

## Two real bugs found and fixed during manual browser verification

Unit tests (which call `fixture.detectChanges()` manually) never exercised the app's real bootstrap sequence end-to-end — this was the first time the compiled app was actually run in a browser. Two genuine, pre-existing bugs surfaced immediately:

1. **`tsconfig.json`'s `lib` was capped at `["es2018", "dom"]`**, missing `Array.prototype.flatMap` (ES2019+). This was latent and invisible until `gather.page.ts` became the first real app-entry-point file to import `FilterService` (whose `groupPokemonByGeneration` uses `.flatMap()`) — before that, `filter.service.ts` was only ever type-checked via the test entry point, never via `tsconfig.app.json`'s real build graph. Fixed by removing the `lib` override entirely, matching game-shelf (which doesn't set `lib` at all, letting it default from `target: "es2022"`).

2. **`PokeDataService` and `LocalUserDataRepository` both had `private readonly engine = inject(STORAGE_ENGINE)` as an eager field initializer** — the exact bootstrap-ordering bug already identified and fixed for `SyncService` in Phase 4, but never applied to these two. Since both are constructed inside `main.ts`'s `provideAppInitializer` callback (`inject(userDataService)`/`inject(pokeDataService)`) _before_ `storageEngineFactory.initialize()` resolves, this threw `StorageEngineFactory.initialize() must complete before engine use.` on every real bootstrap — the app was completely broken for any page touching catalog/progress/settings. Fixed identically to `SyncService`: both now hold `StorageEngineFactory` and resolve the engine lazily via a private getter. Updated `poke-data.service.spec.ts`, `local-user-data-repository.spec.ts`, and `user-data.service.spec.ts` to provide `StorageEngineFactory` and call `.initialize()` in `beforeEach`, matching `sync.service.spec.ts`'s existing pattern (instead of the old `{ provide: STORAGE_ENGINE, useExisting: DexieStorageEngine }` mock).

3. **`main.ts` was missing `provideZoneChangeDetection()`** — present in game-shelf's `main.ts` but never added here. Without it, no `NgZone` fork is established (confirmed via `Zone.current` in a live browser: only the root zone existed, `NgZone.isInAngularZone()` was `false` everywhere), so Angular never automatically ran change detection after any async update — the catalog would load correctly into memory (confirmed via console logging) but the DOM would never reflect it without a manual `ChangeDetectorRef.detectChanges()`. This affected the _entire app_, not just this page. Fixed by adding `provideZoneChangeDetection()` to `main.ts`'s provider list, matching game-shelf exactly.

All three were latent since earlier phases and simply never exercised until this session's first real `ng serve` + browser run — worth remembering for future phases: **run the actual app in a browser as early as possible**, not just lint/test/build, since those don't catch bootstrap-time or change-detection issues.

## Deferred

Groups 2-5 (side menu/filters, settings, search strings, preset queries) remain. Filtering already works correctly with default settings even with no filter UI yet — group 2 only needs to add UI that calls `UserDataService.updateUserSettings()`.
