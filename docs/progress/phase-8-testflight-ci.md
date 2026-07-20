# Phase 8 — CI Completion: TestFlight & Release

Blueprinted on game-shelf's `ios/Gemfile`, `ios/.ruby-version`, `ios/fastlane/{Appfile,Matchfile,Fastfile}`, `.github/workflows/ios-testflight.yml`, and `scripts/{release-diff,ios-testflight-should-deploy}.mjs`. All read in full and adapted rather than copied blindly.

## Decisions resolved this phase

- **Apple Developer team ID**: `6V392K7X46` — reused the team ID already confirmed working for on-device signing in Phase 6 (`security find-identity -v -p codesigning` showed a valid Apple Development + Distribution identity for this team already in this Mac's keychain).
- **Match certs storage repo**: created `thetigeregg/go-gather-match-certs` as a new **private** GitHub repo (`gh repo create ... --private`), confirmed via `gh repo view --json isPrivate`. `fastlane match` stores encrypted certs/profiles there, referenced from `ios/fastlane/Matchfile`.
- **Production GitHub Environment**: created via `gh api --method PUT repos/thetigeregg/go-gather/environments/production` — gates the `testflight` job in `ios-testflight.yml`.

## Still open (not addressed this phase)

- **App Store Connect API key** (Key ID / Issuer ID / base64 `.p8` content), `MATCH_PASSWORD`, and `MATCH_GIT_BASIC_AUTHORIZATION` all need real values from the user — none were available this session, so no GitHub secrets were set and no live `validate_asc_app`/`validate_match`/`deploy_testflight` run was attempted. This is why "Signing decisions resolved" and "Validate lanes pass, then a real deploy_testflight run" remain unchecked in the migration checklist.

## What was ported, and deliberate deviations from game-shelf

- **`ios/.ruby-version`** (`3.3`) + **`ios/Gemfile`** (`fastlane ~> 2.230`) — identical to game-shelf.
- **`ios/fastlane/Appfile`/`Matchfile`** — same shape, `app_identifier`/`team_id` swapped to go-gather's (`io.github.thetigeregg.gogather` / `6V392K7X46`), `git_url` pointed at the new match-certs repo.
- **`ios/fastlane/Fastfile`** — same four lanes (`validate_asc_app`, `validate_match`, `deploy_testflight`, `build_only`), same helper-function shape. `sync_capacitor_prod_assets` calls `npm run sync:ios:prod` and `sync_ios_prod_version` calls `scripts/sync-ios-version.mjs` — both already existed from Phases 6–7, no new scripts needed. **Deviation**: dropped the `GITHUB_OUTPUT`/`ios_native_build_number` write at the end of `deploy_testflight` — game-shelf's OTA pipeline (Phase 9 equivalent) consumes that value; go-gather has no Phase 9 infrastructure yet, so nothing would read it.
- **`scripts/release-diff.mjs`** — copied verbatim (fully generic git-diffing utility, no go-gather-specific logic).
- **`scripts/ios-testflight-should-deploy.mjs`** — ported with `NATIVE_SHELL_EXACT_PATHS` trimmed to go-gather's actual footprint: `capacitor.config.ts`, `ionic.config.json`, `angular.json`, `scripts/write-environment-ios.mjs`, `scripts/generate-ios-info-plists.mjs`, `scripts/sync-ios-version.mjs`, `.github/workflows/ios-testflight.yml`. Dropped game-shelf-specific entries that don't apply: `config/ios-live-update-public.pem` (OTA, no Phase 9 yet), `scripts/bootstrap-ios-firebase-plists.mjs` (no Firebase), `scripts/run-ios.mjs`/`scripts/ios-run-common.mjs` (never ported to go-gather). Also simplified `NATIVE_DEPENDENCY_PATTERN` by removing the `@capacitor-community\/`/`@capacitor-firebase\/` alternations — both were already redundant with the leading `@capacitor(?:-[a-z0-9-]+)?\/` pattern (which matches any `@capacitor-*` scope), and Firebase doesn't apply here anyway.
- **`.github/workflows/ios-testflight.yml`** — same `workflow_run`-after-`"Release & Publish"` trigger shape, same `detect_changes`/`skip_summary`/`testflight` job structure, `environment: production` gating kept. **Dropped**: the Firebase-plist-decode step, the GitHub-App-token + `IOS_OTA_NATIVE_BUILD_NUMBER` sync step at the end (no OTA consumer, and go-gather deliberately uses plain `GITHUB_TOKEN` rather than App-token infra, per Phase 0). **Simplified**: no pinned `xcode-select` version (game-shelf pins a specific Xcode sub-version matching its own CI history; go-gather has none yet, so this uses whatever Xcode `macos-15` defaults to) and the skip-summary text drops game-shelf's OTA-specific closing line.

## Verification performed

1. `npm run lint` — passes (1 pre-existing unrelated warning in `server/src/db.ts`).
2. `npm run test` — 287/287 pass.
3. `npm run test:scripts` — 54/54 pass, including new tests for `release-diff.mjs` (ported verbatim from game-shelf) and `ios-testflight-should-deploy.mjs` (adapted fixtures — bundle IDs/versions changed to go-gather's, dropped the OTA-public-key-rotation test since go-gather has no such file, kept the Capawesome dependency-bump test using go-gather's actual package `@capawesome/capacitor-file-picker`).
4. `npm run build` — Angular production build succeeds.
5. Locally exercised Fastlane without real credentials: `cd ios && RBENV_VERSION=3.3.11 bundle install && RBENV_VERSION=3.3.11 bundle exec fastlane lanes` — all four lanes (`validate_asc_app`, `validate_match`, `deploy_testflight`, `build_only`) registered correctly with zero Apple API calls. Used `RBENV_VERSION` rather than `rbenv local` to avoid overwriting the committed `.ruby-version` (`3.3`, a floating minor that `ruby/setup-ruby@v1` resolves to the latest patch in CI) with a locally-pinned exact version.
6. Confirmed `thetigeregg/go-gather-match-certs` exists and is private (`gh repo view --json isPrivate`).
7. Confirmed the `production` GitHub Environment now exists on `thetigeregg/go-gather` (`gh api repos/thetigeregg/go-gather/environments/production`).

## Not run this phase

`validate_asc_app`, `validate_match`, and `deploy_testflight` all require real Apple/match credentials — none were available this session. Once the user provides a real ASC API key (Key ID, Issuer ID, base64 `.p8`), `MATCH_PASSWORD`, `MATCH_GIT_BASIC_AUTHORIZATION`, and `IOS_BACKEND_ORIGIN_PROD`, the next session should: set them via `gh secret set` (repo-level or scoped to the `production` environment), run `validate_asc_app`/`validate_match` locally first (safe, read-only Apple API checks), and only attempt a real `deploy_testflight` upload after explicit confirmation.
