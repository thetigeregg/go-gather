# Phase 7 — Build Configs & Environments

Status: complete. `npm run lint`, `npm run test` (33 files, 291 tests), `npm run test:scripts` (39 tests, up from 23 — 16 new tests across the two new script modules), and `npm run build` all pass.

This replaces the manual workaround from Phase 6's device-verification task — hand-editing `environment.ts`'s `apiUrl` to a hardcoded LAN IP, building with `ng build --configuration development`, and remembering to revert it (which broke once when a default `npm run build` silently re-applied `environment.prod.ts` instead) — with a permanent, automated mechanism.

## What changed

- **New**: `scripts/lan-host.mjs` (+ test) — `resolveLanHost()` (checks `IOS_LAN_HOST` env override, else auto-detects via `os.networkInterfaces()`, preferring common Wi-Fi interface names, falling back to any private IPv4), `composeLocalBackendOrigin(host, port)`.
- **New**: `scripts/write-environment-ios.mjs` (+ test) — `node scripts/write-environment-ios.mjs <local|prod>`. Writes `src/environments/environment.ios.local.ts` / `environment.ios.prod.ts` (both gitignored). `local` auto-composes the origin from the detected LAN IP + fixed port `3000` (go-gather's actual server port), or takes `IOS_BACKEND_ORIGIN_LOCAL` verbatim if set. `prod` requires `IOS_BACKEND_ORIGIN_PROD` (or generic `BACKEND_ORIGIN`) and **errors clearly** if neither is set — there's no real hosted backend yet (Phase 10 pending), so refusing to guess is more honest than baking in a placeholder that would look plausible but be wrong.
- **`angular.json`**: added `ios-local` (unoptimized/sourcemapped, matching `development`'s shape) and `ios-prod` (optimized/hashed, matching `production`'s shape) build configurations, each with one `fileReplacements` entry swapping `environment.ts` for the corresponding generated file.
- **`package.json`**: `prebuild:ios` (now shared — runs `sync-ios-version.mjs --marketing-only` + `generate-ios-info-plists.mjs`, both from Phase 6), `prebuild:ios:local`/`prebuild:ios:prod` (run `write-environment-ios.mjs <variant>` first, then `prebuild:ios`), `build:ios:local`/`build:ios:prod` (`ng build --configuration ios-local`/`ios-prod`), `sync:ios:local`/`sync:ios:prod` (build + `npx cap sync ios`).
- **`.gitignore`**: added `/src/environments/environment.ios.local.ts`, `/src/environments/environment.ios.prod.ts`, `/.env`.
- **New**: `.env.example` — documents `IOS_LAN_HOST`/`IOS_BACKEND_ORIGIN_LOCAL` (optional local overrides) and `IOS_BACKEND_ORIGIN_PROD`/`BACKEND_ORIGIN` (required for the prod variant).

## Blueprint and deliberate simplifications versus game-shelf

game-shelf's `write-environment-ios.mjs`/`lan-host.mjs` were the port source, but a large fraction of their content doesn't apply to go-gather at all and was dropped rather than carried over:

1. **No dynamic edge-port/worktree system.** game-shelf resolves its backend port through `@thetigeregg/dev-cli`'s per-worktree Docker edge-proxy (`resolveWorktreeEdgePort()`) — go-gather has no such thing; its Fastify server always runs on a fixed port `3000`, so `lan-host.mjs` only needed `resolveLanHost`/`composeLocalBackendOrigin`, not the edge-port resolution or the asset-base-URL helpers (`resolveManualsPublicBaseUrl`/`resolveRomsPublicBaseUrl` — game-shelf-specific concepts with no go-gather equivalent).
2. **No bespoke `.env` parser.** game-shelf's `scripts/dotenv.mjs` is a hand-rolled parser, written before Node's native `.env` support existed. go-gather is on Node 24 (`.nvmrc`), so `write-environment-ios.mjs` uses `process.loadEnvFile()` directly — zero new dependencies, tolerates a missing `.env` via a caught `ENOENT`.
3. **No Firebase/EmulatorJS entanglement.** game-shelf's generated environment file also swaps a `firebase-messaging.client.ts` → `.native.ts` file replacement and inlines EmulatorJS CDN-asset-pinning constants via a sandboxed VM eval. None of that exists in go-gather; the generated file is just `{ production, apiUrl }`.
4. **No live-reload (`ios-live`) workflow or `run-ios.mjs` orchestration script.** Both are real, working DX conveniences in game-shelf (scheme selection, `ng serve --configuration ios-live` + `cap run --live-reload --host <lan-ip>`), but neither is required by either Phase 7 checklist line (`angular.json` configs; environment-file layering) — they're additional scope beyond what was asked. The one remaining manual step (`npx cap run ios --scheme "App DEV"` after `npm run sync:ios:local`) is a single documented command, not wrapped in a script.

## Verified end-to-end

- `npm run build:ios:local` (run directly, not via the `prebuild` script) correctly auto-triggered `prebuild:ios:local` first — confirming npm's colon-namespaced pre-hook convention works for arbitrary custom script names, not just `pre`+exact-match on built-ins. `environment.ios.local.ts` was generated fresh with the auto-detected LAN IP (`http://192.168.0.21:3000`, matching the Mac's actual current LAN IP).
- The LAN IP was confirmed baked into both `www/` (from `build:ios:local`) and `ios/App/App/public/` (from a full `npm run sync:ios:local` run) via the same grep check used manually last phase.
- `node scripts/write-environment-ios.mjs prod` with no `IOS_BACKEND_ORIGIN_PROD`/`BACKEND_ORIGIN` set failed with the intended clear error message; setting `IOS_BACKEND_ORIGIN_PROD` and re-running succeeded, writing the correct `production: true` variant.
- `git status` confirms all three new gitignore entries actually take effect (`git check-ignore -v` matched each against its exact `.gitignore` line) — the generated files and a local `.env` never show up as untracked.

## Tests

`scripts/lan-host.test.mjs` (6 tests): `IOS_LAN_HOST` override precedence, preferred-interface-name matching (`en0` before others), fallback to any private IPv4, `null` when nothing suitable exists, ignoring internal/non-IPv4 interface entries, `composeLocalBackendOrigin`'s origin-building and its rejection of empty/zero/non-numeric inputs.

`scripts/write-environment-ios.test.mjs` (10 tests): local-origin resolution (explicit override, auto-composed, clear error when no LAN host resolves), prod-origin resolution (both env var names, clear error when neither set), the generated-file template, and `generateEnvironmentIos` writing the correct variant-specific content to the correct path for both `local`/`prod`, plus rejecting an unknown variant name.

## Deferred

Nothing remains open in Phase 7. Next: Phase 8 (CI Completion — resolve the Apple Developer team ID / match-certs-repo / App Store Connect API key decisions from `OPEN-DECISIONS.md`, then Fastlane `Fastfile`/`Matchfile`/`Appfile` + `ios-testflight.yml`). Once Phase 10 (Backend Deploy) provides a real hosted backend URL, `IOS_BACKEND_ORIGIN_PROD` becomes the one thing that needs setting for `build:ios:prod`/`sync:ios:prod` to produce a real, usable App PROD build.
