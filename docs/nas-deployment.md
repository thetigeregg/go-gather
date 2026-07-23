# NAS Deployment (Synology + Docker + Tailscale)

A self-hosted deployment on your own NAS via Docker + Tailscale. Architecture is intentionally minimal: one deployable service (`server`, the Fastify API), SQLite for storage, no separate worker/scraper/backup containers.

## 1. Persistent directory

Create two persistent directories on your NAS host:

- `nas-data/server-data` — the SQLite database (`gogather.db`, `-wal`, `-shm`) and the cached PokeAPI sprite images (`images/`).
- `nas-data/server-backups` — JSON user-data backups (see section 4).

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
- `SYNC_CATALOG_INTERVAL_HOURS` (default `24`), `SYNC_CALENDAR_EVENTS_INTERVAL_HOURS` (default `6`), `SYNC_SEASON_INTERVAL_HOURS` (default `6`), `SYNC_POKEMON_STATS_INTERVAL_HOURS` (default `24`) — see section 4
- `BACKUP_AFTER_N_MODIFICATIONS` (default `0`, disabled) — see "Automatic backups" below

## 4. First-time data bootstrap

The database and image cache start empty. The server syncs all four data feeds (Pokémon catalog, calendar events, season, Pokémon stats) automatically once at startup and then again on its own recurring interval per feed (`scheduled-sync.ts`) — so a fresh container populates itself within moments of first starting, no manual step required.

**Option A — copy existing data** (recommended, avoids re-hitting PokeAPI for the catalog's sprite backfill): copy your Mac's already-populated `server/data/` directory (contains the full catalog DB + ~3,600 cached sprites) into `${NAS_DATA_ROOT}/server-data` before first starting the container.

**Option B — force an immediate sync** (e.g. right after a fresh deploy, without waiting for the next interval), once the container is running:

```bash
docker compose exec server npm run sync                    # catalog
docker compose exec server npm run sync:calendar-events
docker compose exec server npm run sync:season
docker compose exec server npm run sync:pokemon-stats
```

These are the same standalone scripts `scheduled-sync.ts` calls in-process — running them manually just forces an immediate refresh instead of waiting for the next scheduled tick.

### Automatic backups

The server also writes its own user-data backup (`user_progress`/`user_settings` — catch status, excluded-pattern filters, tags, preset queries) to `${NAS_DATA_ROOT}/server-backups` on every startup, in the exact same JSON format and `go-gather-backup-<timestamp>.json` filename scheme as the app's own Settings → Export Data button (`server/src/backup.ts`). No retention/pruning is applied — files accumulate indefinitely, so periodically clean out old ones if disk space matters.

Set `BACKUP_AFTER_N_MODIFICATIONS` to also trigger a backup after that many catch add/remove operations, independent of the startup backup — e.g. `BACKUP_AFTER_N_MODIFICATIONS=25` backs up again every 25 catches/uncatches. Left at the default `0`, only the startup backup runs.

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
