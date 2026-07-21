# GO Gather

GO Gather is an Ionic + Angular app for tracking Pokémon catalog progress, with a fetched (not bundled) catalog, sync support, and native iOS delivery via Capacitor.

## Repository Structure

- `src/`: Frontend app (Ionic/Angular, web + Capacitor iOS)
- `ios/`: Capacitor iOS native project (Xcode), dual App DEV / App PROD targets
- `server/`: Fastify API (catalog, sync, image cache, OTA manifest/bundle serving)
- `shared/`: Domain model types shared between the frontend and server (npm workspace)
- `scripts/`: Node tooling for iOS build/version/environment management, OTA live-update artifact signing, and CI native-shell-change gating
- `docs/`: Migration history, phase-by-phase progress notes, and deployment docs
- `.github/workflows/`: CI, release/publish, iOS TestFlight, and secret-scanning pipelines

## Prerequisites

- Node.js `24.15.0` (see `.nvmrc`)
- npm
- Docker (only needed for `server/Dockerfile` / production deployment — local dev doesn't use Docker)

## Local Development

1. Install dependencies (npm workspaces — installs root, `server/`, and `shared/` together):

```bash
npm ci
```

2. Run the frontend dev server:

```bash
npm start
```

3. Run the API server (separate terminal, from `server/`):

```bash
cd server
npm run dev
```

The frontend's default `environment.ts` points at `http://localhost:3000`, matching the API's default port.

## iOS App (Capacitor)

The frontend ships as a native iOS app via Capacitor (`appId: io.github.thetigeregg.gogather`, `appName: GO Gather`). Dual dev/prod Xcode targets exist side-by-side (`App DEV` / `App PROD`, separate bundle IDs).

Key commands:

```bash
npm run build:ios:local    # web build against a local backend (auto-detected LAN origin)
npm run build:ios:prod     # web build against IOS_BACKEND_ORIGIN_PROD
npm run sync:ios:local     # build + npx cap sync
npm run sync:ios:prod
```

See `.env.example` for the env vars these read (`IOS_LAN_HOST`, `IOS_BACKEND_ORIGIN_LOCAL`, `IOS_BACKEND_ORIGIN_PROD`).

For the full history of how the native shell, signing, CI, and OTA live-update pipeline were built:

- [`docs/progress/phase-6-ios-targets.md`](docs/progress/phase-6-ios-targets.md) — dual Xcode targets, signing scaffolding
- [`docs/progress/phase-7-build-configs-environments.md`](docs/progress/phase-7-build-configs-environments.md) — `angular.json` build configs, environment file layering
- [`docs/progress/phase-8-testflight-ci.md`](docs/progress/phase-8-testflight-ci.md) — Fastlane, match, TestFlight CI
- [`docs/progress/phase-9-ota-live-update.md`](docs/progress/phase-9-ota-live-update.md) — signed-bundle OTA updates

## Testing and Quality

```bash
npm run lint
npm run test          # frontend unit tests with coverage
npm run test:scripts  # Node script tests (scripts/*.mjs)
npm run build
```

## CI/CD Workflows

- `CI PR Checks` (`.github/workflows/ci-pr.yml`) — lint, unit tests + Codecov upload, build, iOS prod build-config validation, Docker build validation. Trigger: PRs to `main`.
- `Release & Publish` (`.github/workflows/release-publish.yml`) — bumps version, tags, publishes `server/`'s Docker image to GHCR (gated on native-shell/OTA change detection). Trigger: push to `main`, or manual dispatch.
- `iOS TestFlight` (`.github/workflows/ios-testflight.yml`) — builds App PROD via Fastlane and uploads to TestFlight when native-shell files changed. Trigger: after `Release & Publish` completes, or manual dispatch.
- `Secret Scan` (`.github/workflows/secret-scan.yml`) — gitleaks, config in `.gitleaks.toml`. Trigger: PRs to `main`, pushes to `main`, manual dispatch.
- `CodeQL` (`.github/workflows/codeql.yml`) — static analysis, config in `.github/codeql/codeql-config.yml`. Trigger: push/PR to `main`, weekly schedule.

## Versioning and Releases

- Single repo-wide semver version in `package.json`.
- `Release & Publish` updates `package.json`, `package-lock.json`, `CHANGELOG.md`, and `ios/App/App.xcodeproj/project.pbxproj` (`MARKETING_VERSION`), then tags and pushes.
- Only publishes a new Docker image / OTA bundle / TestFlight build when relevant paths changed since the previous tag — see the progress notes linked above for the exact gating logic.

## Security

- Secret scanning: `.gitleaks.toml` + `.github/workflows/secret-scan.yml`.
- Coverage: `codecov.yml`, uploaded from `ci-pr.yml` using the `CODECOV_TOKEN` secret.
- Local secrets stay out of git: `.env` (see `.env.example`), `src/environments/environment.ios.*.ts` (generated, gitignored), the OTA signing private key (`~/.config/go-gather/ios/live-update-private.pem`, never committed).

## Deployment

For NAS/Portainer/Tailscale deployment, see [`docs/nas-deployment.md`](docs/nas-deployment.md).
