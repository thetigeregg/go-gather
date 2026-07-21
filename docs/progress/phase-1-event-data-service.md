# Phase 1 — Calendar Event Data Service

Stood up the full fetch → server-cache → client-cache → read pipeline for Pokemon GO calendar events and Season "Daily Discovery" data, per [`CALENDAR-MIGRATION-CHECKLIST.md` Phase 1](../CALENDAR-MIGRATION-CHECKLIST.md#phase-1--event-data-service) and [`pogo-cal`'s Phase 1](../../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md#phase-1--event-data-service).

## What landed

**Server** (`server/`):

- `sync-calendar-events.ts` (`npm run sync:calendar-events`) — fetches the scraped events feed, writes to a new `pokemon_go_events` table (id/type/start/end columns + a JSON `payload` column, since `PogoEvent`'s `extraData` is too nested for flat columns), stamps `sync_meta.calendarEventsSyncedAt`.
- `sync-season.ts` (`npm run sync:season`) — same shape, fully separate: `pokemon_go_season` (single row), `sync_meta.seasonSyncedAt`.
- `GET /api/calendar-events` / `GET /api/calendar-season` — same `{ syncedAt, ... }` envelope convention as `GET /api/catalog`.
- Verified for real: both sync scripts run successfully against the live `Drumstix42/ScrapedDuck` feed (36 events, 1 season synced), both routes return well-formed data when the server is started locally.

**Client — `StorageEngine`**: two new scopes, `calendarEvents` (catalog-shaped: list, bulk-replace) and `season` (settings-shaped: singleton), threaded through the interface, `DexieStorageEngine`, `AppDb` (extended `version(1)` in place — confirmed no shipped user data anywhere yet, so no migration needed), `SqliteStorageEngine`, `sqlite-connection.ts`'s `SQLITE_UPGRADE_STATEMENTS`, and the shared contract test suite.

**Client — services**: `SyncService` gained `pullCalendarEvents()`/`pullSeason()` (added to the `syncNow()` sequence) and `listenForCalendarEventsSync()`/`listenForSeasonSync()`. New `CalendarEventsService` (`core/services/calendar-events.service.ts`) is the `PokeDataService` analog — reads only from `StorageEngine`, expands synthetic sub-events and computes `EventMetadata` at load time, caches both. `getEventTypeInfo()` (deferred from Phase 0) lives in a new `calendar-event-type-info.util.ts`, re-exported from the service.

**Ported pure logic**, each in its own util file: `calendar-event-date.util.ts` (date parsing/formatting), `calendar-event-name.util.ts` (HTML-entity decode + name formatting), `calendar-event-metadata.util.ts` (`buildEventMetadata()`), `calendar-sub-events.util.ts` (`generateEventRaidHourSubEvents()`/`generateEventSpotlightSubEvents()` + the `parseRaidScheduleDate()` helper they need).

## Decisions resolved during this phase (not pre-decided — surfaced during planning)

Recorded in [`pogo-cal/docs/migration/OPEN-DECISIONS.md`](../../../pogo-cal/docs/migration/OPEN-DECISIONS.md):

1. **Fetch/cache split, not one service.** Research into `go-gather`'s actual catalog pipeline showed it deliberately separates network/freshness/write (`SyncService`) from read-only caching (`PokeDataService`) — `PokeDataService` never calls `HttpClient`. The original phrasing (one `calendar-events.service.ts` that "fetches and caches") would have forked this established pattern for no reason; built the split instead.
2. **Separate sync script**, not folded into the Pokemon-catalog `sync.ts`. Different domains and cadences — events change weekly/daily, the Pokemon roster barely changes.
3. **Season fully separate** from events (own route/table/sync script/`StorageScope`), matching `pogo-cal`'s own independent Season store.
4. **Synthetic sub-event generation is in scope for this phase**, run client-side at load time — matching where `pogo-cal` itself does this. Wasn't explicitly scoped in the earlier Product/Scope decisions round; surfaced and resolved during Phase 1 planning.

## Deviations from a literal verbatim port

- `parseEventDate()`/`formatEventTime()` dropped the `manualOffsetHours` parameter (the "manual clock offset" display preference is resolved dropped entirely — no consumer will ever supply a non-zero value).
- `formatEventName()` ported without `getSmartGroupDisplayName()` ("group similar events" is resolved deferred).
- `buildEventMetadata()` ported without `raidBossTierGroups`/`spotlightBonus` population (raid-boss art is resolved deferred/text-only) — the `EventMetadata` type still carries those fields as optional for shape completeness; they're just unpopulated this pass.
- Two `EVENT_TYPES`-indexing helpers (`getEventTypeInfo()`, `getEventTypeColor()`) needed a `Partial<Record<string, T>>` re-typing of the otherwise-`Record<string, T>`-typed lookup to satisfy this repo's `@typescript-eslint/no-unnecessary-condition` lint rule honestly — `EVENT_TYPES`'s declared type otherwise tells TypeScript indexing always succeeds, which is exactly untrue for the unrecognized-type fallback this function exists to handle.
- Added `dayjs` as a dependency of the main app (`package.json`) in addition to `@go-gather/shared` (added in Phase 0) — the util files import it directly.

## Verification

- `npm run build` (Angular) and `server`'s `tsc --noEmit` — both clean.
- `npm run lint` — 0 errors (5 pre-existing-style warnings, one predating this phase).
- `npm run test -- --run` — 44 test files / 396 tests, all passing (58 net-new tests this phase, up from 338 at the end of Phase 0).
  - `calendar-events.service.spec.ts` — 8 tests (StorageEngine reads, sub-event expansion, metadata computation, `getEventTypeInfo()` fallback).
  - `calendar-event-date.util.spec.ts`, `calendar-event-name.util.spec.ts`, `calendar-event-type-info.util.spec.ts` — 100% coverage.
  - `calendar-event-metadata.util.spec.ts` — 6 tests (display name/type/color/time, single/multi-day, past/future, unrecognized-type fallback).
  - `calendar-sub-events.util.spec.ts` — 18 tests, 99% statement coverage (all three date-format branches including year-rollover, `parseRaidHourTime` edge cases, boss-list naming at every length tier, unparseable-date `console.warn` paths). The one uncovered line is a defensive empty-array branch in `formatPokemonList()` that's unreachable through the public API (the caller already filters empty-boss raid hours before calling it) — preserved from the verbatim port, not force-tested.
  - `storage-engine.contract.ts` additions (`calendarEvents`/`season` describe blocks + a cross-scope transaction test) — verified passing against both `DexieStorageEngine` and `SqliteStorageEngine`.
  - `sync.service.spec.ts` — extended all three existing tests to flush the two new HTTP calls, plus two new tests for `pullCalendarEvents()`/`pullSeason()`'s freshness-check skip behavior, following the exact pattern already used for `pullCatalog()`.
- Manually ran `npm run sync:calendar-events` and `npm run sync:season` against the live feed, then started the server locally and confirmed both new routes return well-formed `{ syncedAt, ... }` envelopes with real data.
