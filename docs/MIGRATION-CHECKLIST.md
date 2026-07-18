# Migration Checklist

High-level, checkbox-tracked plan for rewriting `go-gather-next` as this repo — an Ionic Angular + Capacitor iOS app blueprinted on `game-shelf` (`/Users/sixtopia/projects/game-shelf`). This is a thin pointer document: each phase links to the detailed doc that actually specifies what to build. Read the linked doc before working a phase's boxes — don't work from this list alone.

Source docs live in the sibling repo: [`go-gather-next/docs/README.md`](../../go-gather-next/docs/README.md) is the index for everything referenced below (`current/` = functionality parity bar the rewrite must not silently drop; `migration/` = target architecture, including the original [`MIGRATION-CHECKLIST.md`](../../go-gather-next/docs/migration/MIGRATION-CHECKLIST.md) that Phases 1–10 here summarize).

**Progress notes convention**: this file only tracks done/not-done. When a phase surfaces decisions, gotchas, or deviations worth recording, write them to `docs/progress/<phase-slug>.md` in this repo (e.g. `docs/progress/phase-0-tooling.md`) and link it from the relevant box below. Create these files as needed — none are scaffolded up front.

## Before starting: Open Decisions gate

- [x] Resolved in [`OPEN-DECISIONS.md`](../../go-gather-next/docs/migration/OPEN-DECISIONS.md): bundle ID (`io.github.thetigeregg.gogather`, `.dev` suffix variant), dialogs-vs-pages (routed pages), bundled-vs-fetched catalog (**fetched**, deviating from the doc's bundled recommendation), keep-a-backend (**yes** — auto-resolves the `SearchTermData` duplication and npm-workspaces rows to "keep as-is" too)
- [ ] Still open, not blocking Phase 1 but needed before Phase 10: hosting target, GHCR image publishing (now in scope since a backend is being kept)
- [ ] Still open, not blocking Phase 1 but needed before Phase 8: Apple Developer team ID, match certs storage repo, App Store Connect API key
- [ ] Still open, low priority: web-build-or-iOS-only (Product), native E2E/Maestro, Vitest `.ui.spec.ts` split — none block any phase

## Phase 0 — Tooling Bootstrap

Not a separate phase in the source checklist (it's folded into its Phase 7); pulled forward here since this is a fresh repo and getting dev tooling right from commit one is cheaper than retrofitting it later. Full detail: [`DEV-WORKFLOW.md`](../../go-gather-next/docs/migration/DEV-WORKFLOW.md). Confirmed approach: depend on the private `@thetigeregg/*` config packages (matching game-shelf exactly, not the docs' inline-instead recommendation), and adopt a **trimmed** `devx.config.mjs` (skip the worktree/Docker-Compose sections — game-shelf-specific, no equivalent here yet).

- [x] Bump `.nvmrc` `20.16` → `24.14.0` (game-shelf's exact pin)
- [x] Confirm no `engines`/`packageManager` fields are added to `package.json` — game-shelf has none
- [x] Bump `@thetigeregg/*` devDependencies to game-shelf's current versions (`dev-cli ^4.2.0`, `prettier-config ^1.0.0`, `lint-staged-config ^1.0.0`, `ncu-config ^2.0.0`) and add `@thetigeregg/commitlint-config ^1.0.3` (not present yet)
- [x] Add the config files that wire those packages in: `.prettierrc.cjs`, `.ncurc.cjs`, `lint-staged.config.cjs`, `commitlint.config.cjs`
- [x] Add a trimmed `devx.config.mjs` (`projectName`, `editor`, `branchPrefix: 'feat/'`, `baseBranch: 'main'`, `pr.verifyCommands` only)
- [x] Set up `.husky/` (`pre-commit` → lint-staged, `commit-msg` → commitlint); skip the `post-checkout` worktree-bootstrap hook
- [x] Migrate `.eslintrc.json` (legacy) → flat `eslint.config.mjs` per game-shelf's rule set — see [progress notes](progress/phase-0-tooling.md) for the `parserOptions.project` ordering fix needed for split `tsconfig.app.json`/`tsconfig.spec.json`
- [x] Add `.gitleaks.toml`
- [x] Bump devDependency pins to game-shelf's: `eslint ^10.6.0`, `prettier 3.9.3`, `husky ^9.1.7`, `lint-staged ^17.0.8`, `typescript ~5.9.3`, `typescript-eslint ^8.62.0`, `vitest ^4.1.9` + `@vitest/coverage-v8`, `@playwright/test ^1.61.1`, `npm-check-updates 22.2.9` (plus `@eslint/js`, `eslint-import-resolver-typescript`, and `jsdom` — undeclared transitive needs surfaced during verification, see progress notes)
- [x] Bump Angular/Ionic/Capacitor to [`ARCHITECTURE-TARGET.md`](../../go-gather-next/docs/migration/ARCHITECTURE-TARGET.md)'s pins (Angular `^21.2.15`, `@ionic/angular ^8.8.12`, `ionicons ^8.0.13`, `@capacitor/core`/`cli` `8.4.1` exact)
- [x] Replace Karma/Jasmine with Vitest (`vitest.config.ts`, jsdom); leave coverage un-gated to start, ratchet up per `DEV-WORKFLOW.md` — see [progress notes](progress/phase-0-tooling.md) for the `TestBed.overrideComponent` pattern needed for `templateUrl`-based components
- [x] Copy `tsconfig.json` strictness flags from game-shelf (`noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, Angular `strictTemplates`/`strictInjectionParameters`/`strictInputAccessModifiers`) — already present in the stock starter; only `moduleResolution` needed bumping to `bundler`
- [x] Copy `.editorconfig` / `.prettierignore` conventions — `.editorconfig` already matched; `.prettierignore` added new
- [x] Copy `.vscode/settings.json` + `extensions.json` — `extensions.json` already matched; `settings.json` aligned to game-shelf's exact exclude list
- [x] Add `.github/workflows/`: `ci-pr.yml`, `codeql.yml`, `secret-scan.yml`, `release-publish.yml`, `dependabot.yml` (scaled to a single-app footprint per [`CI-CD-AND-DEPLOY.md`](../../go-gather-next/docs/migration/CI-CD-AND-DEPLOY.md); `ios-testflight.yml` deferred to Phase 8 — no `ios/` yet) — see [progress notes](progress/phase-0-tooling.md) for what was trimmed from each

## Phase 1 — Scaffold & Structure

See [`MIGRATION-CHECKLIST.md` Phase 0](../../go-gather-next/docs/migration/MIGRATION-CHECKLIST.md#phase-0--scaffold) and [`ARCHITECTURE-TARGET.md`](../../go-gather-next/docs/migration/ARCHITECTURE-TARGET.md).

- [x] Folder structure per `ARCHITECTURE-TARGET.md#folder-structure` — routed page directories (`tabs/`, `gather/`, `settings/`, `search-strings/`, `preset-queries/`) scaffolded with stub content; `core/` subfolders intentionally deferred to Phases 2–3 when their first real files land, see [progress notes](progress/phase-1-scaffold.md)
- [x] `provideIonicAngular({ mode: 'ios' })` + `provideRouter` with the target route table — `provideHttpClient(withInterceptorsFromDi())` also added ahead of schedule, see progress notes
- [x] Routing approach resolved (routed pages vs. modals) per the Open Decisions gate above — stock `tab1`/`tab2`/`tab3`/`explore-container` starter boilerplate removed and replaced with the target page set

## Phase 2 — Domain Model & Storage

See [`MIGRATION-CHECKLIST.md` Phase 1](../../go-gather-next/docs/migration/MIGRATION-CHECKLIST.md#phase-1--domain-model--storage-do-this-before-any-ui) and [`STORAGE-MIGRATION.md`](../../go-gather-next/docs/migration/STORAGE-MIGRATION.md) (centerpiece doc). Do this before any UI work.

- [x] Port domain model types from `shared/src/models.ts` — ported into a new `@go-gather/shared` npm workspace package (not `core/models/`), per the auto-resolved "keep npm workspaces" decision, see [progress notes](progress/phase-2-domain-storage.md)
- [x] `StorageEngine` interface + Dexie (web) implementation + contract test suite — native/SQLite engine deferred to Phase 6
- [x] `PreferenceStorageService` equivalent (`@capacitor/preferences`) — simplified vs. game-shelf's version (no legacy-migration logic, no consumers yet), see progress notes
- [x] **Addendum (added in Phase 4)**: `outbox` scope — omitted here originally on the wrong assumption that progress/settings would be fully local with no server role; corrected once Phase 4 confirmed the backend is the source of truth (game-shelf's pattern). See [progress notes](progress/phase-4-catalog-pipeline.md).

## Phase 3 — Search-Engine Port

See [`MIGRATION-CHECKLIST.md` Phase 2](../../go-gather-next/docs/migration/MIGRATION-CHECKLIST.md#phase-2--port-search-engine-logic-isolated-testable-zero-ui-dependency) and [`current/SEARCH-ENGINE.md`](../../go-gather-next/docs/current/SEARCH-ENGINE.md). Port verbatim, do not reinterpret the grammar — zero current test coverage to preserve, so every test here is net-new value.

- [x] Copy `core/search-engine/*` verbatim — confirmed byte-for-byte identical via `diff` against `go-gather-next`, see [progress notes](progress/phase-3-search-engine.md)
- [x] Full unit test coverage for serializer, compiler, and the NOT-cannot-wrap-OR parser quirk — all net-new (zero prior coverage existed)

## Phase 4 — Catalog Data Pipeline

See [`MIGRATION-CHECKLIST.md` Phase 3](../../go-gather-next/docs/migration/MIGRATION-CHECKLIST.md#phase-3--catalog-data-pipeline) and [`current/SERVER-AND-SYNC.md`](../../go-gather-next/docs/current/SERVER-AND-SYNC.md). Catalog is **fetched** from the live backend (resolved — see Open Decisions gate above), not bundled at build time. Scope grew beyond the literal checklist wording: the backend is also the source of truth for progress/settings (game-shelf's pattern, corrected from an earlier wrong assumption) — see [progress notes](progress/phase-4-catalog-pipeline.md).

- [x] Port sync/transform scripts, deployed as the live catalog-serving endpoint (not a build-time script) — `sync.ts`/`transform.ts`/`pokeapi.ts`/`sync-overrides.json` ported near-verbatim (confirmed via `diff`, deviations are only lint-disable comments + one `markCatalogSynced()` addition); ran for real against live APIs (8984 catalog entries, 3646 sprites)
- [x] Wire app's catalog loading to fetch from the live endpoint, with `syncMeta` version tracking — `SyncService.pullCatalog()`, compares the server's `syncedAt` envelope against local `syncMeta`
- [x] **Beyond the checklist**: `server/` workspace package created (deferred from Phase 2); `idempotency_keys`/`sync_events` tables + `POST /api/sync/push`/`POST /api/sync/pull` routes adapted from game-shelf's Postgres sync routes to SQLite; `LocalUserDataRepository` + `SyncService` (outbox push/pull) on the Angular side, following game-shelf's `LocalGameRepository`/`GameSyncService` pattern

## Phase 5 — Services & UI Rebuild

See [`MIGRATION-CHECKLIST.md` Phase 4](../../go-gather-next/docs/migration/MIGRATION-CHECKLIST.md#phase-4--port-services--rebuild-ui-web-only-ioniccapacitor-not-required-yet) and [`SCREEN-AND-FEATURE-MAP.md`](../../go-gather-next/docs/migration/SCREEN-AND-FEATURE-MAP.md) for the full component build order (lowest-risk first, preset query editor last).

- [x] Port domain services, re-pointed at `StorageEngine` — see [progress notes](progress/phase-5-domain-services.md)
- [x] Rebuild components/pages in the order `SCREEN-AND-FEATURE-MAP.md` specifies — chunked into 5 groups (see [progress notes](progress/phase-5-gather-page.md) for the chunking), all complete: 1) gather page core ✅, 2) side menu/filters ✅ (see [progress notes](progress/phase-5-side-menu.md)), 3) settings page ✅ (see [progress notes](progress/phase-5-settings-page.md)), 4) search strings page ✅ (see [progress notes](progress/phase-5-search-strings-page.md)), 5) preset queries ✅ (see [progress notes](progress/phase-5-preset-queries.md))
- [x] Rebuild export/import via Capacitor filesystem/file-picker/share plugins — see [progress notes](progress/phase-5-export-import.md)
- [x] Full feature parity verified running as a web app, before touching native — see [progress notes](progress/phase-5-full-parity-verification.md); found and fixed 2 real bugs (a `SearchConfigService` bootstrap gap, and a preset-editor bug — pre-existing in go-gather-next — that silently discarded Pokemon Type/Move Type/Weak-Against/Super-Effective-Against rule values)

## Phase 6 — Native iOS Shell

See [`MIGRATION-CHECKLIST.md` Phase 5](../../go-gather-next/docs/migration/MIGRATION-CHECKLIST.md#phase-5--native-ios-shell) and [`IOS-CAPACITOR-SETUP.md`](../../go-gather-next/docs/migration/IOS-CAPACITOR-SETUP.md). The Ruby toolchain pin (`ios/.ruby-version` = `3.3`, `ios/Gemfile` with `fastlane '~> 2.230'`, matching game-shelf) still belongs to this phase, but `npx cap add ios` itself happened early — during Phase 5's export/import work, once native filesystem/share/file-picker plugins needed a real `ios/` project to sync into. See [progress notes](progress/phase-5-export-import.md) for the `PrivacyInfo.xcprivacy` addition this pulled forward too.

- [x] `npx cap add ios`, configure `capacitor.config.ts` — done ahead of schedule, see note above
- [x] `SqliteStorageEngine` + `ImageFileStore`, contract tests extended to run against it — see [progress notes](progress/phase-6-sqlite-storage.md)
- [ ] Dual dev/prod Xcode targets, signing scaffolding
- [ ] Build and run on a personal device, verify native feature parity

## Phase 7 — Build Configs & Environments

See [`MIGRATION-CHECKLIST.md` Phase 6](../../go-gather-next/docs/migration/MIGRATION-CHECKLIST.md#phase-6--build-configs--environments) and [`BUILD-AND-ENV.md`](../../go-gather-next/docs/migration/BUILD-AND-ENV.md).

- [ ] `angular.json` build configurations
- [ ] Environment file layering (compile-time at minimum; runtime/iOS-generated layers only if a live backend is kept)

## Phase 8 — CI Completion: TestFlight & Release

See [`MIGRATION-CHECKLIST.md` Phases 7 & 8](../../go-gather-next/docs/migration/MIGRATION-CHECKLIST.md#phase-7--dev-workflow--ci) and [`CI-CD-AND-DEPLOY.md`](../../go-gather-next/docs/migration/CI-CD-AND-DEPLOY.md). Phase 0 above already covers the PR-gate/lint/format/commit tooling — this phase is what's left: native release pipeline.

- [ ] Signing decisions resolved (team ID, match certs repo, ASC API key)
- [ ] Fastlane (`Fastfile`, `Matchfile`, `Appfile`) + `ios-testflight.yml` with native-shell-change gating
- [ ] Validate lanes pass, then a real `deploy_testflight` run confirmed installable on a device

## Phase 9 — OTA Live-Update

See [`MIGRATION-CHECKLIST.md` Phase 9](../../go-gather-next/docs/migration/MIGRATION-CHECKLIST.md#phase-9--ota-live-update) and [`CI-CD-AND-DEPLOY.md#ota-live-update`](../../go-gather-next/docs/migration/CI-CD-AND-DEPLOY.md#ota-live-update).

- [ ] RSA keypair + `LiveUpdate.publicKey` configured
- [ ] Signed-bundle build script + manifest endpoint + `LiveUpdateService`
- [ ] Verified: `src/**`-only change ships via OTA; native-shell change falls through to Phase 8 instead

## Phase 10 — Backend Deploy

Applies — a live backend is being kept (resolved, see Open Decisions gate above). See [`MIGRATION-CHECKLIST.md` Phase 10](../../go-gather-next/docs/migration/MIGRATION-CHECKLIST.md#phase-10--backend-deploy-only-if-a-live-backend-was-kept-per-open-decisionsmd) and [`CI-CD-AND-DEPLOY.md`](../../go-gather-next/docs/migration/CI-CD-AND-DEPLOY.md). Hosting target and GHCR publishing still need deciding before this phase starts.

- [ ] Scaled-down hosting stack per the hosting-target decision
- [ ] GHCR image publishing if containerized

## Done when

- [x] Every item in [`current/FUNCTIONALITY.md`](../../go-gather-next/docs/current/FUNCTIONALITY.md) has a working equivalent, verified by manual walkthrough — see [progress notes](progress/phase-5-full-parity-verification.md)
- [x] `StorageEngine` contract tests pass against both Dexie and SQLite engines — see [progress notes](progress/phase-6-sqlite-storage.md)
- [ ] `search-engine/` has full unit test coverage
- [ ] A TestFlight build has been successfully uploaded and installed on a real device
- [ ] OTA live-update has been exercised at least once end-to-end
