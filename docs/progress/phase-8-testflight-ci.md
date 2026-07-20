# Phase 8 — CI Completion: TestFlight & Release

Blueprinted on game-shelf's `ios/Gemfile`, `ios/.ruby-version`, `ios/fastlane/{Appfile,Matchfile,Fastfile}`, `.github/workflows/ios-testflight.yml`, and `scripts/{release-diff,ios-testflight-should-deploy}.mjs`. All read in full and adapted rather than copied blindly.

## Decisions resolved this phase

- **Apple Developer team ID**: `6V392K7X46` — reused the team ID already confirmed working for on-device signing in Phase 6 (`security find-identity -v -p codesigning` showed a valid Apple Development + Distribution identity for this team already in this Mac's keychain).
- **Match certs storage repo**: created `thetigeregg/go-gather-match-certs` as a new **private** GitHub repo (`gh repo create ... --private`), confirmed via `gh repo view --json isPrivate`. `fastlane match` stores encrypted certs/profiles there, referenced from `ios/fastlane/Matchfile`.
- **Production GitHub Environment**: created via `gh api --method PUT repos/thetigeregg/go-gather/environments/production` — gates the `testflight` job in `ios-testflight.yml`.

## Live validation and deploy — completed in a follow-up session

All required secrets were set (`APP_STORE_CONNECT_API_KEY_ID`/`_ISSUER_ID`/`_KEY`, `MATCH_PASSWORD`, `MATCH_GIT_BASIC_AUTHORIZATION` scoped to the `production` environment; `IOS_BACKEND_ORIGIN_PROD` at repo level), and `ios-testflight.yml` was triggered via `workflow_dispatch` several times while working through real issues:

1. **Empty match-certs repo.** `thetigeregg/go-gather-match-certs` had zero commits/branches (a fresh `gh repo create`). Our `Matchfile`'s `clone_branch_directly(true)` (copied from game-shelf, whose repo already had certs) requires the branch to already exist — first CI run failed on `git clone` before even reaching auth. Fixed by temporarily removing `clone_branch_directly` and bootstrapping locally: `cd ios && bundle exec fastlane match appstore --api_key_path <asc-key.json>` (using the ASC API key instead of interactive Apple ID login, since the account's SMS-only 2FA was being rejected by Apple's servers at the time — an Apple-side issue, not ours). This created a real Apple Distribution certificate + provisioning profile and committed them (encrypted) to the repo's new `master` branch. `clone_branch_directly(true)` was restored in the Matchfile afterward.
2. **Malformed `MATCH_GIT_BASIC_AUTHORIZATION`.** Even after the repo had content, CI still failed on `git clone` with an HTTP 400 (not 401) — confirmed via fastlane's own `git_storage.rb` source that the secret's value is passed verbatim into an `Authorization: Basic <value>` header with no encoding performed by fastlane itself. The fix requires `base64("username:token")` done by the user before setting the secret; a plain multi-line `base64` encoding (without `tr -d '\n'`) had corrupted the HTTP header. Re-encoded and re-set — resolved the clone.
3. **Xcode SDK version mismatch.** With auth and repo content both fixed, the build itself succeeded (archive, export, sign) but `upload_to_testflight` was rejected by Apple with a 409: apps must now be built with the iOS 26 SDK (Xcode 26+), while the `macos-15` runner's default Xcode (16.4) only has the iOS 18.5 SDK. This directly contradicted this doc's earlier "no Xcode pin needed yet" deviation from game-shelf (which does pin `Xcode_26.3.app` for exactly this reason) — added a `Select Xcode` step pinning `/Applications/Xcode_26.3.app/Contents/Developer` (confirmed present on the `macos-15` image via GitHub's `runner-images` repo), matching game-shelf.

After all three fixes, a `workflow_dispatch` run passed end-to-end: `validate_asc_app` → `validate_match` → `build_app` → `upload_to_testflight`, all green (run [`29757562589`](https://github.com/thetigeregg/go-gather/actions/runs/29757562589)). A real build of `io.github.thetigeregg.gogather` is now uploaded to App Store Connect (app ID `6792799100`).

**Still open**: device install of the uploaded TestFlight build hasn't been manually confirmed yet — see the "Done when" checklist item.

## What was ported, and deliberate deviations from game-shelf

- **`ios/.ruby-version`** (`3.3`) + **`ios/Gemfile`** (`fastlane ~> 2.230`) — identical to game-shelf.
- **`ios/fastlane/Appfile`/`Matchfile`** — same shape, `app_identifier`/`team_id` swapped to go-gather's (`io.github.thetigeregg.gogather` / `6V392K7X46`), `git_url` pointed at the new match-certs repo.
- **`ios/fastlane/Fastfile`** — same four lanes (`validate_asc_app`, `validate_match`, `deploy_testflight`, `build_only`), same helper-function shape. `sync_capacitor_prod_assets` calls `npm run sync:ios:prod` and `sync_ios_prod_version` calls `scripts/sync-ios-version.mjs` — both already existed from Phases 6–7, no new scripts needed. **Deviation**: dropped the `GITHUB_OUTPUT`/`ios_native_build_number` write at the end of `deploy_testflight` — game-shelf's OTA pipeline (Phase 9 equivalent) consumes that value; go-gather has no Phase 9 infrastructure yet, so nothing would read it.
- **`scripts/release-diff.mjs`** — copied verbatim (fully generic git-diffing utility, no go-gather-specific logic).
- **`scripts/ios-testflight-should-deploy.mjs`** — ported with `NATIVE_SHELL_EXACT_PATHS` trimmed to go-gather's actual footprint: `capacitor.config.ts`, `ionic.config.json`, `angular.json`, `scripts/write-environment-ios.mjs`, `scripts/generate-ios-info-plists.mjs`, `scripts/sync-ios-version.mjs`, `.github/workflows/ios-testflight.yml`. Dropped game-shelf-specific entries that don't apply: `config/ios-live-update-public.pem` (OTA, no Phase 9 yet), `scripts/bootstrap-ios-firebase-plists.mjs` (no Firebase), `scripts/run-ios.mjs`/`scripts/ios-run-common.mjs` (never ported to go-gather). Also simplified `NATIVE_DEPENDENCY_PATTERN` by removing the `@capacitor-community\/`/`@capacitor-firebase\/` alternations — both were already redundant with the leading `@capacitor(?:-[a-z0-9-]+)?\/` pattern (which matches any `@capacitor-*` scope), and Firebase doesn't apply here anyway.
- **`.github/workflows/ios-testflight.yml`** — same `workflow_run`-after-`"Release & Publish"` trigger shape, same `detect_changes`/`skip_summary`/`testflight` job structure, `environment: production` gating kept. **Dropped**: the Firebase-plist-decode step, the GitHub-App-token + `IOS_OTA_NATIVE_BUILD_NUMBER` sync step at the end (no OTA consumer, and go-gather deliberately uses plain `GITHUB_TOKEN` rather than App-token infra, per Phase 0). the skip-summary text drops game-shelf's OTA-specific closing line. **Correction during live validation**: initially shipped without a pinned `xcode-select` version, reasoning go-gather had no CI history to justify one yet — this was wrong. Apple now requires the iOS 26 SDK for App Store Connect uploads, and the `macos-15` runner's default Xcode (16.4) doesn't meet it; added `sudo xcode-select -s /Applications/Xcode_26.3.app/Contents/Developer`, matching game-shelf's own pin, after a real `upload_to_testflight` run failed on this exact mismatch (see "Live validation and deploy" below).

## Verification performed

1. `npm run lint` — passes (1 pre-existing unrelated warning in `server/src/db.ts`).
2. `npm run test` — 287/287 pass.
3. `npm run test:scripts` — 54/54 pass, including new tests for `release-diff.mjs` (ported verbatim from game-shelf) and `ios-testflight-should-deploy.mjs` (adapted fixtures — bundle IDs/versions changed to go-gather's, dropped the OTA-public-key-rotation test since go-gather has no such file, kept the Capawesome dependency-bump test using go-gather's actual package `@capawesome/capacitor-file-picker`).
4. `npm run build` — Angular production build succeeds.
5. Locally exercised Fastlane without real credentials: `cd ios && RBENV_VERSION=3.3.11 bundle install && RBENV_VERSION=3.3.11 bundle exec fastlane lanes` — all four lanes (`validate_asc_app`, `validate_match`, `deploy_testflight`, `build_only`) registered correctly with zero Apple API calls. Used `RBENV_VERSION` rather than `rbenv local` to avoid overwriting the committed `.ruby-version` (`3.3`, a floating minor that `ruby/setup-ruby@v1` resolves to the latest patch in CI) with a locally-pinned exact version.
6. Confirmed `thetigeregg/go-gather-match-certs` exists and is private (`gh repo view --json isPrivate`).
7. Confirmed the `production` GitHub Environment now exists on `thetigeregg/go-gather` (`gh api repos/thetigeregg/go-gather/environments/production`).

## Remaining

Manually confirm the uploaded TestFlight build installs and runs correctly on a real device via the TestFlight app — that's the last unchecked box in this phase and in the migration's overall "Done when" list.
