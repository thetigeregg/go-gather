# CI/Security-Tooling Parity Audit: game-shelf → go-gather

Not tied to a specific migration phase — a hygiene pass comparing game-shelf's full CI/security-tooling surface (`.github/workflows/*`, `.gitleaks.toml`, `codecov.yml`, `dependabot.yml`, and related repo-root config) against go-gather's current state, to find gaps that weren't oversights so much as things nobody had gotten to yet.

## What was found and fixed

1. **Codecov was entirely unwired** — a `CODECOV_TOKEN` secret already existed in the repo, but nothing in any workflow referenced it, and no `codecov.yml` existed. Added `codecov.yml` (matching game-shelf's `precision: 2`, `round: down`, `range: 0...100`, `patch.default.target: 80%`) and a `codecov/codecov-action@v7` step in `ci-pr.yml`'s `quality_checks` job, uploading `./coverage/app/lcov.info` under a single `frontend` flag. **Deviates from game-shelf on purpose**: game-shelf uses OIDC (`use_oidc: true`, no token, needs `permissions: id-token: write`); go-gather uses the existing `CODECOV_TOKEN` secret instead, since that's already provisioned and doesn't require separately configuring OIDC trust on codecov.io. go-gather also only needs one flag (`frontend`) — unlike game-shelf's three (frontend/server/worker), since `server/` currently has no test script/coverage output at all.

2. **`.github/codeql/codeql-config.yml` existed but was never wired into `codeql.yml`** — added `config-file: ./.github/codeql/codeql-config.yml` to the `Initialize CodeQL` step. **Known, accepted tradeoff, not an oversight**: this file suppresses CodeQL's `js/missing-rate-limiting` finding. Its comment (copied verbatim from game-shelf) claimed `server/` is protected by `@fastify/rate-limit` — a direct `grep` confirmed this is false; go-gather's `server/` has no rate-limiting at all. Wiring this in means CodeQL will no longer flag a real, currently-valid gap. The user was told this explicitly and chose to suppress anyway rather than add real rate-limiting or leave the finding active — the file's comment was rewritten to say so plainly, so a future reader doesn't get misled the way this investigation initially was. Adding real `@fastify/rate-limit` to `server/src/api.ts` remains open as a legitimate follow-up, just out of scope here.

3. **`dependabot.yml` had no `docker` ecosystem entry** — Phase 9 added `server/Dockerfile`, which predates this audit having any Dependabot coverage. Added one entry for `directory: "/server"` (weekly Monday 05:50, labels `dependencies`+`docker`, limit 3, prefix `chore(docker)`, ignoring major-version base-image bumps) — mirrors game-shelf's shape exactly. No new npm-ecosystem entry was needed for `/server`: unlike game-shelf (where `server`/`worker` are standalone sibling packages needing their own Dependabot entries), go-gather's `server` is a real npm workspace already covered by the existing root `npm` entry.

4. **`ci-pr.yml` gained two new jobs**, adapted from game-shelf's much larger `ci-pr.yml` (which also has a Postgres service container, Postman validation, a 6-image Docker matrix, and a backup-ops smoke test — none of which apply to go-gather's simpler single-SQLite-backend, single-Docker-image architecture, so none of that was ported):
   - **`ios_prod_build_validation`** — cheap ubuntu-only sanity check that `ng build --configuration ios-prod` still compiles, catching Angular/build-config regressions without a macOS runner. Simpler than game-shelf's version (no Firebase plist fixture needed — go-gather has no Firebase); only needs `IOS_BACKEND_ORIGIN_PROD: https://ci.example.test` as a dummy env value.
   - **`docker_build_validation`** — builds `server/Dockerfile` with `push: false` to catch Dockerfile regressions in CI. Single image, no matrix (game-shelf validates 6 images). Uses the plain (`BUILD_IOS_LIVE_UPDATE=false`) path only — no OTA secrets needed for a build-only sanity check.

## Explicitly left alone (confirmed not gaps)

- Playwright/e2e config, Vitest `.ui.spec.ts` split — already an explicitly logged, low-priority, non-blocking open decision in `MIGRATION-CHECKLIST.md`'s Open Decisions gate.
- Postgres service container, Postman collection validation, backup-ops smoke test, 6-image Docker matrix, `docker-compose*.yml`, NAS secrets — game-shelf-specific infrastructure with no go-gather equivalent.
- `.gitleaks.toml` — game-shelf's only addition over the shared default ruleset is a path allowlist scoped to one of its own test fixtures; doesn't apply here, left as the bare `useDefault = true` extend.
- `CODEOWNERS`, `SECURITY.md`, `FUNDING.yml`, `labeler.yml`, `renovate.json` — none of these exist in game-shelf either; not a gap, never brought up.

## Verification performed

1. `npm run lint`, `npm run test` (312/312 pass), `npm run build` all pass — unaffected by these config-only changes, run as a sanity check.
2. All new/edited YAML files (`ci-pr.yml`, `codeql.yml`, `codeql-config.yml`, `dependabot.yml`, `codecov.yml`) parsed successfully via `python3 -c "import yaml; yaml.safe_load(...)"`.
3. Dry-ran the exact command the new `docker_build_validation` job will run: `docker build -f server/Dockerfile -t go-gather-server:ci-check .` — succeeded (reusing the same image already verified working in Phase 9).

## Not verifiable in this session

The actual Codecov upload (step 1) can only be confirmed by a real PR run of `ci-pr.yml` — that's the genuine acceptance test for whether `CODECOV_TOKEN` is valid/correctly scoped on codecov.io's side. Not something achievable without pushing a real PR.
