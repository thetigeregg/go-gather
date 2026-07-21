# NAS Deployment (Synology + Docker + Tailscale)

A self-hosted deployment on your own NAS via Docker + Tailscale. Architecture is intentionally minimal: one deployable service (`server`, the Fastify API), SQLite for storage, no separate worker/scraper/backup containers.

## 1. Persistent directory

Create one persistent directory on your NAS host:

- `nas-data/server-data`

This holds the SQLite database (`gogather.db`, `-wal`, `-shm`) and the cached PokeAPI sprite images (`images/`) — the only data go-gather persists.

## 2. Confirm the image exists

CI already publishes `ghcr.io/thetigeregg/go-gather-server` on every push to `main` (see `.github/workflows/release-publish.yml`'s `publish_server_image` job). Confirm it's reachable before deploying:

```bash
docker manifest inspect ghcr.io/thetigeregg/go-gather-server:main
```

The image is **amd64-only**. This is fine for a Synology DS920+ (Intel Celeron J4125, x86_64) — if you ever deploy to an ARM-based NAS, `publish_server_image` would need a multi-arch (`linux/amd64,linux/arm64`) build first.

## 3. Deploy

Use `docker-compose.yml` from the repo root — either upload/point Portainer at it, or run directly on the NAS:

```bash
NAS_DATA_ROOT=/volume1/docker/go-gather docker compose up -d
docker compose ps
```

Env vars (all optional, shown with their defaults):

- `SERVER_IMAGE` (default `ghcr.io/thetigeregg/go-gather-server:main`)
- `SERVER_PORT` (default `3000`) — host port the API is published on
- `NAS_DATA_ROOT` (default `./nas-data`) — absolute host path recommended for real deployments, e.g. `/volume1/docker/go-gather`
- `TZ` (default `Europe/Zurich`)

## 4. First-time data bootstrap

The database and image cache start empty. Two ways to populate them:

**Option A — copy existing data** (recommended, avoids re-hitting PokeAPI): copy your Mac's already-populated `server/data/` directory (contains the full catalog DB + ~3,600 cached sprites) into `${NAS_DATA_ROOT}/server-data` before first starting the container.

**Option B — sync fresh from PokeAPI**, once the container is running:

```bash
docker compose exec server npm run sync
```

This runs `server/`'s existing standalone catalog-sync script (`tsx src/sync.ts`) inside the container.

## 5. Publish over Tailscale

Run on the Synology host (where Tailscale is installed):

```bash
tailscale serve --https=443 http://127.0.0.1:3000
```

Verify:

```bash
tailscale status
tailscale serve status
```

Then use the tailnet URL shown by `tailscale serve status` as your backend origin.

## 6. Point the iOS app at it

Set the `IOS_BACKEND_ORIGIN_PROD` GitHub secret to the tailnet URL from step 5.

**Important**: this alone does **not** trigger a new build. `scripts/ios-testflight-should-deploy.mjs` and `scripts/ios-live-update-should-deploy.mjs` (the CI gates deciding whether to publish a native TestFlight build or an OTA update) both work purely off `git diff` — changing a GitHub secret's value touches no tracked file, so neither gate will fire automatically. To actually bake the new origin into a build, manually trigger `workflow_dispatch` on **iOS TestFlight** in GitHub Actions.

## 7. Health check

```bash
curl http://127.0.0.1:3000/api/search-config
docker compose logs -f server
```

There's no dedicated `/health` route yet — `docker-compose.yml`'s healthcheck and the command above both reuse this existing, cheap route as a stand-in.

## 8. Known limitation: CORS

`server/src/api.ts` registers a hardcoded CORS origin list (`http://localhost:4200`, `capacitor://localhost`) — no env var controls it. This doesn't block the iOS app itself (`CapacitorHttp: { enabled: true }` in `capacitor.config.ts` routes native requests around browser CORS entirely), but a future browser-based client hitting this NAS deployment directly would need a code change here first.

## 9. Backups

No automated backup service exists — back up `${NAS_DATA_ROOT}/server-data` directly (e.g. via Backrest/Restic, or your NAS's own snapshot/backup tooling) as part of your regular NAS backup routine.
