# Phase 6 — Build and run on a personal device, verify native feature parity

Status: complete. This is the final Phase 6 checklist item — Phase 6 (Native iOS Shell) is now fully done. `npm run lint`, `npm run test` (33 files, 291 tests), `npm run test:scripts` (23 tests), and `npm run build` all pass. The app was built, signed, installed, and run on a real personal iPhone (not a simulator), and every native-specific parity check passed.

This task also found and fixed one real, general bug (missing `CapacitorHttp` plugin) that wasn't specific to device testing — it would have affected _any_ native networking, including production once a real backend exists.

## Signing

`DEVELOPMENT_TEAM = 6V392K7X46` added to all 4 target build configs (App DEV/PROD × Debug/Release) in `project.pbxproj` — the one piece deliberately left blank in the previous task. Confirmed via `xcodebuild -showBuildSettings` and, more importantly, a real signed install-and-run on-device. `CODE_SIGN_STYLE` stays `Automatic`; nothing Fastlane/match-related was touched (still Phase 8 scope).

## A real bug found and fixed: `CapacitorHttp` was never enabled

The first two device-run attempts failed to load any data — the app made real network requests but got `status: 0, "Unknown Error"` regardless of what ATS exception was tried. The diagnostic trail:

1. Opening the exact same URL directly in mobile Safari worked fine, ruling out network/firewall/reachability problems.
2. Widening the dev target's ATS policy to `NSAllowsArbitraryLoads` (the broadest possible exception) _still_ didn't fix it — ruling out ATS/cleartext-HTTP policy as the cause entirely.
3. The user's observation that game-shelf's dev build always shows the iOS "Local Network" permission prompt, while go-gather's never did (confirmed: the permission never even appeared in Settings, meaning the OS never got far enough to ask) — pointed at something structurally different in how the two apps make network requests, not a policy/config difference.
4. Comparing `capacitor.config.ts` side by side: game-shelf has `CapacitorHttp: { enabled: true }`; go-gather never did.

`CapacitorHttp` makes Capacitor intercept the WebView's `fetch`/`XMLHttpRequest` calls and route them through native `URLSession` instead of the WebView's own networking stack. Two consequences explain every symptom at once: native requests reliably trigger the Local Network permission prompt (unlike the WebView's own networking path), and they aren't subject to browser CORS enforcement at all (irrelevant here, but worth noting: the server's CORS allowlist only ever covered `http://localhost:4200`, the web dev server's origin — never `capacitor://localhost`, the native WebView's actual origin — this would have been a second real blocker if `CapacitorHttp` weren't handling native requests outside the browser networking/CORS path entirely).

**Fix**: added `CapacitorHttp: { enabled: true }` to `capacitor.config.ts`, synced via `npx cap sync ios`. This resolved data loading immediately — confirmed via the device log showing a genuine `200` response from `/api/sync/pull`.

**The `NSAllowsArbitraryLoads` addition was reverted** once `CapacitorHttp` was identified as the real fix — game-shelf's own `Info.dev.overlay.plist` (proven working, per the user's confirmation it reliably prompts for Local Network permission) uses only `NSAllowsLocalNetworking`, nothing broader. Matching that exact, narrower, proven-working exception is more correct than keeping an unnecessarily wide ATS relaxation around. `Info.dev.overlay.plist` now matches game-shelf's pattern exactly again.

## A second, unrelated bug found and fixed: `ios/App/App/public/` was never excluded from ESLint

Surfaced as 189 lint errors (nonsensical "rule not found" errors against a copied build-output `.js` chunk) after switching from the default production build to `ng build --configuration development` (needed so the temporary LAN-IP `environment.ts` override actually took effect — production config applies a `fileReplacements` swap to `environment.prod.ts` regardless of what `environment.ts` says). `eslint.config.mjs`'s `globalIgnores` never listed `www/` or `ios/App/App/public/` — a latent gap that happened not to manifest against default minified production output. Fixed by adding both to `globalIgnores`.

## Supporting fix: server bind address

`server/src/index.ts` bound Fastify to `host: '127.0.0.1'` — unreachable from any other LAN device regardless of what URL the app pointed at. Changed to `host: '0.0.0.0'`; confirmed via `curl` from a separate check that the server is genuinely reachable at the Mac's LAN IP. Permanent, general fix — not scoped to this one test.

## Temporary, not committed: LAN-IP override for the test itself

`environment.ts`'s `apiUrl` was temporarily pointed at the Mac's LAN IP (built with `ng build --configuration development`, then `cap sync ios`) so the device build could reach the Mac's dev backend at all — this is exactly what Phase 7's real environment-layering work will handle properly and permanently; for this one-off test it was a manual, reverted-after-use edit. **Caution for future reference**: running the default `npm run build` (production config) while this override is in place silently regenerates `www/` from `environment.prod.ts` instead, discarding the LAN-IP override without any error — this happened once during this session and produced a build that pointed at the phone's own loopback instead of the Mac, wasting a test cycle. `environment.ts` is back to `http://localhost:3000` now that device testing is done.

## Device verification results — all passed

- Main Gather page renders correctly: generation list, Pokemon cards, correct caught state.
- **Catch state survives a full force-quit + relaunch** — the real end-to-end confirmation that `SqliteStorageEngine` (built in the previous task, only ever run against the `sql.js` test harness until now) is genuinely active and persisting on-device. Device log confirms: real SQLite DB opened at `.../Library/CapacitorDatabase/go-gatherSQLite.db`, schema upgraded 0→1, and — after the `CapacitorHttp` fix — a real `200` from `/api/sync/pull`.
- Export opens the real iOS share sheet; Import opens the real native file picker (both confirmed working, not just compiling).
- Search-string "Copy" lands in the real OS clipboard (confirmed by pasting into Notes).
- Home screen label correctly reads "GO Gather Dev" (confirms the dev-target `CFBundleDisplayName` overlay from the previous task). Icon is still the default Capacitor icon — expected and already documented as a deferred nice-to-have (no custom art available), not a regression.

## Known, accepted limitation: first-launch permission race (dev-only, not fixed)

On a device's very first-ever launch, the app's bootstrap data-loading requests fire immediately, colliding with the async iOS "Local Network" permission dialog — those first requests fail before the user answers the prompt, and nothing automatically retries once permission is granted, requiring one manual relaunch. Investigated whether game-shelf has a purpose-built fix: it doesn't. What it has is a much larger, general-purpose `RuntimeAvailabilityService` (periodic health-check probing + `visibilitychange`/`focus`-triggered auto-resync) that incidentally papers over this exact race as a side effect of general connectivity resilience — not something designed or documented against this specific scenario, per a direct search of game-shelf's code, docs, and git history.

Decision (user-confirmed): document as a known, accepted quirk rather than build equivalent infrastructure. This is scoped **entirely** to local dev-against-LAN-backend testing — production (App PROD hitting a real HTTPS-hosted backend) has no local-network permission involved at all, so real end users can never hit this. Revisit only if Phase 8+ real-world usage surfaces it as an actual problem worth a general connectivity-resilience feature.

## Deferred

Phase 6 is now fully complete. Next: Phase 7 (Build Configs & Environments — `angular.json` configurations, real environment-file layering so App DEV/PROD point at different backends without manual `environment.ts` edits) and Phase 8 (resolve signing decisions, Fastlane/match, `ios-testflight.yml`).
