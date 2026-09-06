# NAS Deployment (Synology + Docker + Tailscale)

A self-hosted deployment on your own NAS via Docker + Tailscale. Architecture is intentionally minimal: two deployable services — `server` (the Fastify API, SQLite for storage) and `edge` (a Caddy container serving the built Angular web app and reverse-proxying `/api` and `/images` to `server`) — no separate worker/scraper/backup containers.

`edge` exists only to serve the app in a browser. The native iOS app keeps talking to `server` directly, exactly as before — `edge` doesn't sit in front of it.

## 1. Persistent directory

Create these directories on your NAS host:

- `nas-data/server-data` — the SQLite database (`gogather.db`, `-wal`, `-shm`) and the cached PokeAPI sprite images (`images/`).
- `nas-data/server-backups` — JSON user-data backups (see section 4).
- `nas-secrets` — plain files bind-mounted read-only into the container at `/run/secrets`, one file per secret (e.g. `firebase_service_account_json` — see "Push notifications" below). No Docker Compose `secrets:` construct involved, just a host directory.

## 2. Confirm the images exist

CI already publishes `ghcr.io/thetigeregg/go-gather-server` and `ghcr.io/thetigeregg/go-gather-edge` on every push to `main` that touches their respective paths (see `.github/workflows/release-publish.yml`'s `publish_server_image` and `publish_edge_image` jobs). Confirm both are reachable before deploying:

```bash
docker manifest inspect ghcr.io/thetigeregg/go-gather-server:main
docker manifest inspect ghcr.io/thetigeregg/go-gather-edge:main
```

Both images are **amd64-only**. This is fine for a Synology DS920+ (Intel Celeron J4125, x86_64) — if you ever deploy to an ARM-based NAS, `publish_server_image`/`publish_edge_image` would need a multi-arch (`linux/amd64,linux/arm64`) build first.

## 3. Deploy

Use `docker-compose.yml` from the repo root — either upload/point Portainer at it, or run directly on the NAS:

```bash
NAS_DATA_ROOT=/volume1/docker/go-gather docker compose up -d
docker compose ps
```

Env vars (all optional, shown with their defaults):

- `SERVER_IMAGE` (default `ghcr.io/thetigeregg/go-gather-server:main`)
- `SERVER_PORT` (default `3000`) — host port the API is published on
- `EDGE_IMAGE` (default `ghcr.io/thetigeregg/go-gather-edge:main`)
- `EDGE_PORT` (default `8080`) — host port the web app is published on
- `NAS_DATA_ROOT` (default `./nas-data`) — absolute host path recommended for real deployments, e.g. `/volume1/docker/go-gather`
- `TZ` (default `Europe/Zurich`)
- `SYNC_CATALOG_INTERVAL_HOURS` (default `24`), `SYNC_CALENDAR_EVENTS_INTERVAL_HOURS` (default `6`), `SYNC_SEASON_INTERVAL_HOURS` (default `6`), `SYNC_POKEMON_STATS_INTERVAL_HOURS` (default `24`) — see section 4
- `BACKUP_AFTER_N_MODIFICATIONS` (default `0`, disabled) — see "Automatic backups" below
- `SECRETS_HOST_DIR` (default `./nas-secrets`) — see section 1
- `NOTIFICATION_CHECK_INTERVAL_MINUTES` (default `2`) — how often the server checks for due calendar-event push notifications

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

### Push notifications

Calendar-event push notifications (FCM) require a Firebase service-account JSON file at `${SECRETS_HOST_DIR:-./nas-secrets}/firebase_service_account_json` — without it, `server/src/fcm.ts` logs a one-time `[fcm] not_configured` warning and skips sending (the rest of the server functions normally). To enable:

1. In the Firebase Console, create/select a project, then **Project Settings → Service Accounts → Generate new private key** to download the service-account JSON.
2. Save it as `${SECRETS_HOST_DIR:-./nas-secrets}/firebase_service_account_json` on the NAS host (no extension — matches the filename the server reads via `/run/secrets`, the same bind-mount pattern as `nas-data`). Override the path with `FIREBASE_SERVICE_ACCOUNT_JSON_FILE` if you'd rather name/place it differently.
3. The iOS app also needs a matching `GoogleService-Info.plist` bootstrapped client-side — see the README's iOS section.

The server checks for due notifications every `NOTIFICATION_CHECK_INTERVAL_MINUTES` (default 2) via a separate in-process loop (`server/src/notification-scheduler-loop.ts`), independent of the four data-feed sync jobs above. Device registration happens from the app's Settings page — no server-side action is needed beyond dropping the service-account file in place.

## 5. Publish over Tailscale

Run on the Synology host (where Tailscale is installed). Keep the existing API mapping for the iOS app (`server`, port 3000) and add a second mapping on a different port for the web app (`edge`, port 8080) — Tailscale can serve multiple `https` ports from the same node:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:3000
tailscale serve --bg --https=8443 http://127.0.0.1:8080
```

Verify:

```bash
tailscale status
tailscale serve status
```

Use the `:443` tailnet URL from `tailscale serve status` as the iOS backend origin (step 6, unchanged), and the `:8443` tailnet URL to open the web app in a browser.

## 6. Point the iOS app at it

Set the `IOS_BACKEND_ORIGIN_PROD` GitHub secret to the tailnet URL from step 5.

**Important**: this alone does **not** trigger a new build. `scripts/ios-testflight-should-deploy.mjs` and `scripts/ios-live-update-should-deploy.mjs` (the CI gates deciding whether to publish a native TestFlight build or an OTA update) both work purely off `git diff` — changing a GitHub secret's value touches no tracked file, so neither gate will fire automatically. To actually bake the new origin into a build, manually trigger `workflow_dispatch` on **iOS TestFlight** in GitHub Actions.

## 7. Health check

```bash
curl http://127.0.0.1:3000/api/search-config
docker compose logs -f server

curl http://127.0.0.1:8080/
docker compose logs -f edge
```

There's no dedicated `/health` route yet — `docker-compose.yml`'s healthcheck and the command above both reuse this existing, cheap route as a stand-in. `edge` has no healthcheck defined in `docker-compose.yml`; a `curl` for `index.html` is the manual equivalent.

## 8. Known limitation: CORS

`server/src/api.ts` registers a hardcoded CORS origin list (`http://localhost:4200`, `capacitor://localhost`) — no env var controls it. This doesn't block the iOS app itself (`CapacitorHttp: { enabled: true }` in `capacitor.config.ts` routes native requests around browser CORS entirely). It also doesn't affect the web app served via `edge`: the browser only ever talks to the `edge` container's own origin, which reverse-proxies `/api` and `/images` to `server` same-origin, so no cross-origin request (and therefore no CORS check) is involved. The limitation only matters if some other browser-based client were ever pointed directly at the `server` origin instead of going through `edge` — that would need a code change here first.

## 9. Backups

No automated backup service exists — back up `${NAS_DATA_ROOT}/server-data` directly (e.g. via Backrest/Restic, or your NAS's own snapshot/backup tooling) as part of your regular NAS backup routine.
