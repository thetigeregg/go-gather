# Phase 0 — Tooling Bootstrap: progress notes

Status: complete. `npm run lint`, `npm run test`, and `npm run build -- --configuration production` all pass. Local `.husky/pre-commit` (lint-staged) and `.husky/commit-msg` (commitlint) hooks verified working.

## Scope deviations from the checklist / source docs

- **`release-publish.yml`**: ported only the version-bump/tag/push `release` job (uses `npx devx release version`, confirmed generic — only touches `package.json`/`CHANGELOG.md`/git tags). Dropped game-shelf's Docker-image-publishing and iOS-OTA-gating jobs entirely — no Docker images or `ios/` directory exist yet. Also simplified auth: used the default `GITHUB_TOKEN` instead of game-shelf's GitHub App token step, since no App is configured for this repo yet.
- **`ci-pr.yml`**: trimmed to checkout → setup-node → `npm ci` → lint → test → build. No Postgres service container, no backend/worker installs, no Postman validation, no Docker build matrix, no Playwright e2e job (no e2e tests exist yet).
- **`dependabot.yml`**: kept only the root `npm` and `github-actions` ecosystem entries; dropped game-shelf's `/server`, `/worker`, `/hltb-scraper`, and Docker ecosystem entries.
- **`codeql.yml`**: ported as-is but omitted the `config-file:` reference to `codeql-config.yml` — that file exists in game-shelf only to suppress a Fastify-specific rate-limiting false positive that doesn't apply here.

## Gaps found and fixed beyond the checklist's literal wording

These weren't called out as explicit checklist items but were necessary to make the adopted tooling actually work:

- **`eslint.config.mjs` parser project ordering**: `parserOptions.project` must list `['tsconfig.app.json', 'tsconfig.spec.json', 'tsconfig.json']` in that order — a permissive project (like the base `tsconfig.json`, which has no `include`/`files` restricting it) must go **last**, since typescript-eslint picks the first listed project that matches a file. Putting it first caused `*.spec.ts` files to resolve against the wrong project and lose `vitest/globals` types, producing cascades of `no-unsafe-call` errors. `projectService: true` was tried and rejected — it couldn't cover root-level tooling files (`vitest.config.ts`) any better than the explicit array.
- **Missing explicit devDependencies**: `@eslint/js` and `eslint-import-resolver-typescript` were required for the flat config to resolve at all (both listed explicitly in game-shelf's `package.json`, not just transitive), and `jsdom` was required for Vitest's `environment: 'jsdom'` — none of these were called out in `DEV-WORKFLOW.md`, likely because they're assumed-present transitive dependencies elsewhere in game-shelf's larger dependency tree.
- **`templateUrl`/`styleUrls` components fail under bare Vitest** (no Angular CLI builder involved): Angular's JIT compiler needs a `ResourceLoader` to fetch `templateUrl`/`styleUrls` at runtime, and plain `vitest run` has no such provider. game-shelf's own spec files sidestep this entirely with `TestBed.overrideComponent(Component, { set: { template: '<div></div>', styleUrls: [], imports: [] } })` before `createComponent()` — confirmed by reading `app.component.spec.ts`. Applied the same pattern to all 6 stock starter spec files (`app.component`, `tabs.page`, `tab1/2/3.page`, `explore-container.component`). Note: `imports: []` was also required on components that themselves declare other `templateUrl`-based components in their own `imports` array (e.g. `Tab1Page` importing `ExploreContainerComponent`) — otherwise the child component's unresolved template still gets hit during the standalone-imports graph walk. Also: don't put the component under test in `configureTestingModule`'s `imports:` array — that triggers eager resolution before `overrideComponent` can apply; call `overrideComponent` then `createComponent` directly instead (or `compileComponents()` after the override, never before).
- **`angular.json`**: removed the `test` and `lint` architect targets entirely (no builder needed now — `vitest run` and `eslint .` are invoked directly via npm scripts) and removed the stale `@angular-eslint/schematics:application`/`library` config block (that package is no longer a dependency).
- **Boilerplate lint fixes**: the stock starter's empty `constructor() {}` bodies tripped `@typescript-eslint/no-useless-constructor`; removing them then tripped `no-extraneous-class` on the now-empty decorated classes — fixed properly via the rule's `allowWithDecorator: true` option (the idiomatic fix for Angular/Ionic's empty-but-decorated component classes), not by disabling the rule. Also fixed a floating promise in `main.ts` (`bootstrapApplication(...).catch(...)`) and an `any` cast in `zone-flags.ts`.

## Deferred to later phases (unchanged from the checklist)

- Ruby (`ios/.ruby-version` = `3.3`, `ios/Gemfile` with `fastlane`) — Phase 6, no `ios/` directory yet.
- `ios-testflight.yml` — Phase 8.
- Full Docker/OTA gating logic in `release-publish.yml` — Phase 8/10, once a backend or native shell exists.
