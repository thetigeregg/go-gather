# Phase 6 — Dual dev/prod Xcode targets, signing scaffolding

Status: complete. `npm run lint` (0 errors, 1 pre-existing unrelated warning), `npm run test` (33 files, 291 tests), `npm run test:scripts` (23 new tests), and `npm run build` all pass. `npx cap sync ios` still runs cleanly with both targets in place.

**Real verification beyond lint/test**: Xcode itself (26.6, installed on this machine) parsed the hand-edited `project.pbxproj` and reports exactly two targets/schemes:

```
Targets: App DEV, App PROD
Schemes: App DEV, App PROD, <one per Capacitor SPM package>
```

Both schemes were then actually **built** — `xcodebuild build -scheme "App DEV" -destination "generic/platform=iOS" CODE_SIGNING_ALLOWED=NO` and the same for `"App PROD"` — both `** BUILD SUCCEEDED **`, unsigned (sidesteps the still-open team-ID decision) but a real compile targeting a physical-device architecture, not just a simulator smoke test. `xcodebuild -showBuildSettings` confirms each target resolves the right bundle id and generated Info.plist:

| Scheme   | `PRODUCT_BUNDLE_IDENTIFIER`          | `INFOPLIST_FILE`      |
| -------- | ------------------------------------ | --------------------- |
| App DEV  | `io.github.thetigeregg.gogather.dev` | `App/Info.dev.plist`  |
| App PROD | `io.github.thetigeregg.gogather`     | `App/Info.prod.plist` |

`DEVELOPMENT_TEAM` is confirmed absent from both (not guessed — see below).

## What changed

- **`ios/App/App.xcodeproj/project.pbxproj`**: the single existing target (`504EC3031FED79650016851F`) was renamed in place to **App DEV** (bundle id gained a `.dev` suffix, `INFOPLIST_FILE` repointed to `Info.dev.plist`); a new **App PROD** target was added (bundle id unchanged at `io.github.thetigeregg.gogather`, `INFOPLIST_FILE` → `Info.prod.plist`). Both targets share one codebase — `AppDelegate.swift`, `Assets.xcassets`, both storyboards, `config.xml`, `capacitor.config.json`, `public/`, `PrivacyInfo.xcprivacy` are all referenced by both targets' own `PBXSourcesBuildPhase`/`PBXResourcesBuildPhase` (a build phase can't be shared across targets, so these were duplicated with fresh `PBXBuildFile` wrapper IDs — the underlying `PBXFileReference`s were not). The `CapApp-SPM` Swift package dependency is **reused as one object** referenced by both targets, rather than duplicated into two separate package-reference objects the way game-shelf's project has it — simpler, and confirmed working via the real builds above.
- **New**: `ios/App/App.xcodeproj/xcshareddata/xcschemes/App DEV.xcscheme`, `App PROD.xcscheme` — this directory didn't exist before (the single target relied on Xcode's implicit auto-generated scheme). Explicit committed schemes keep scheme names consistent across checkouts/CI.
- **New**: `ios/App/App/Info.shared.plist` (everything the old single `Info.plist` had, minus `CFBundleDisplayName`), `Info.dev.overlay.plist` (`CFBundleDisplayName = "GO Gather Dev"` + an ATS local-networking exception for talking to a LAN dev server over plain HTTP), `Info.prod.overlay.plist` (`CFBundleDisplayName = "GO Gather"`).
- **New (generated, committed)**: `ios/App/App/Info.dev.plist`, `Info.prod.plist` — produced by `scripts/generate-ios-info-plists.mjs`. **Removed**: the old single `ios/App/App/Info.plist`.
- **New**: `scripts/generate-ios-info-plists.mjs` (+ test) — deep-merges shared+overlay, `--check` mode fails with a clear message if committed output is stale. **New**: `scripts/sync-ios-version.mjs` (+ test) — keeps `MARKETING_VERSION` (both targets) and App PROD's `CURRENT_PROJECT_VERSION` build number in sync with `package.json`, via the same targeted-regex-substitution technique as the rest of this pbxproj (not a full pbxproj-parsing library).
- **`scripts/` is a new top-level directory** — didn't exist in go-gather before. Its tests run under Node's built-in test runner (`node --test`), not Vitest: confirmed `vitest.config.ts` scopes `include` to `src/**/*.spec.ts` only. New `package.json` script `"test:scripts"` mirrors game-shelf's exact convention for this split.
- **`package.json`**: added `plist ^5.0.0` (dev dependency, used only by `generate-ios-info-plists.mjs`), plus the three new scripts (`generate:ios-info-plists`, `sync:ios:version`, `test:scripts`).

## Scope boundary (confirmed by reading go-gather-next's docs directly)

This task is **targets + local automatic signing only**. Both targets have `CODE_SIGN_STYLE = Automatic` and **no `DEVELOPMENT_TEAM`** — left empty on purpose so Xcode prompts each developer to pick their own team locally, rather than guessing the real value. The Apple Developer team ID, a match-certs storage repo, and an App Store Connect API key are all still-open decisions in `OPEN-DECISIONS.md`, explicitly gated to **Phase 8** (`MIGRATION-CHECKLIST.md`'s own Phase 8 section: "Resolve signing decisions... then set up Fastlane... then `ios-testflight.yml`"). Nothing Fastlane/match/CI-related was added this pass — no `Gemfile`, no `.ruby-version`, no `fastlane/` directory. Building an empty `Gemfile` with nothing to run against it would be dead weight until Phase 8 actually needs Ruby/Fastlane.

The Angular-side `angular.json` build configurations and environment-file layering (which backend URL gets baked into the JS bundle) are a deliberately separate, later axis — Phase 7 ("Build Configs & Environments"). Both Xcode targets currently bundle whatever `www/` already contains, same as the single target did before this task.

## Deliberate simplifications versus game-shelf

1. **No entitlements files.** game-shelf's `App.dev.entitlements`/`App.prod.entitlements` exist solely to declare `aps-environment` for push notifications. go-gather has no push/Firebase feature at all — nothing to declare, so nothing was added. If a capability requiring entitlements is ever added, the files can be created then.
2. **No per-target app icon.** Both targets share the existing single `Assets.xcassets` — new icon art wasn't available this session. `CFBundleDisplayName` differs instead ("GO Gather Dev" vs "GO Gather"), which is enough to tell the two apart on a home screen/in Spotlight even with an identical icon. Distinct icons are a easy follow-up once art exists, not a blocker.
3. **Shared `CapApp-SPM` package dependency object**, not duplicated per target like game-shelf's project has it (which duplicates the `XCLocalSwiftPackageReference`/`XCSwiftPackageProductDependency` pair once per target). A single Swift package product can be referenced by both targets' `packageProductDependencies` arrays and by two separate `PBXBuildFile` entries (one per target's Frameworks phase) — functionally identical, less pbxproj surgery, confirmed working via both real builds above.

## Tests

`scripts/generate-ios-info-plists.test.mjs` (10 tests): deep-merge scalar/nested-dict/array-replacement semantics, canonical key ordering, merging the real committed shared+overlay files, `generateIosInfoPlists` writing outputs that match the committed generated files exactly, dry-run (`write: false`), `--check` passing when current and failing with a clear stale-file message when not, CLI arg parsing.

`scripts/sync-ios-version.test.mjs` (23 tests total, script combined): bulk `MARKETING_VERSION` updates across all three build-config blocks in a sample pbxproj fragment, App-PROD-only build-number updates (matched by `PRODUCT_BUNDLE_IDENTIFIER = io.github.thetigeregg.gogather;`, explicitly not matching the `.dev` one), invalid build-number rejection (non-integer, zero), the `--check`/`assertMarketingVersionsMatchPackage` drift check (pass and fail paths), CLI arg parsing including `--pbxproj` path resolution defaults.

## Deferred

One Phase 6 checklist item remains: **"Build and run on a personal device, verify native feature parity."** This task's unsigned generic-device builds prove the target/build-phase/package-dependency wiring compiles correctly, but didn't install or run on an actual device (that needs the developer's own Apple ID/team signed in locally — a one-time, per-developer Xcode step, not something this task's scope or environment could exercise). Also deferred: Phase 7 (Angular build configs / environment-file layering, so App DEV can actually point at a different backend URL than App PROD) and Phase 8 (resolving the team ID / match-certs-repo / ASC-API-key decisions, then Fastlane + `ios-testflight.yml`).
