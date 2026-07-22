# Calendar Migration Checklist

High-level, checkbox-tracked plan for porting `pogo-cal`'s calendar/timeline/filter functionality into this repo as a new **Calendar** tab, alongside the existing Gather tab. This is a thin pointer document: each phase links to the detailed doc that actually specifies what to build. Read the linked doc before working a phase's boxes — don't work from this list alone.

Source docs live in the sibling repo: [`pogo-cal/docs/README.md`](../../pogo-cal/docs/README.md) is the index for everything referenced below (`current/` = functionality parity bar the port must not silently drop; `migration/` = target architecture, including the original [`MIGRATION-CHECKLIST.md`](../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md) that the phases here summarize). The ICS/`.ics` feed functionality in `pogo-cal` (a fork-only addition) is explicitly **not** part of this port — see that repo's `README.md` for the exclusion list.

## Before starting: Open Decisions gate

- [x] **Resolved**: date library — Day.js
- [x] **Resolved**: event data fetch/cache strategy — `StorageEngine`-cached, mirroring `PokeDataService`'s catalog pattern
- [x] **Resolved**: where domain models live — `@go-gather/shared` (follows from the caching decision)
- [x] **Resolved**: filter-state persistence mechanism — `PreferenceStorageService`
- [x] **Resolved**: two-`side="end"`-menus disambiguation — explicit `menuId` on both menus (`gather-filter` / `calendar-filter`); touches existing `features/side-menu/` + `gather.page.html`, not just new Calendar code
- [x] **Resolved**: event feed source — proxied through a new route on this repo's own `server/`, not fetched by the client directly; mirrors the existing catalog-sync pipeline (`server/src/sync.ts`/`transform.ts` precedent). This is new backend surface, not an extension of the excluded `pogo-cal` ICS backend.
- [x] **Resolved**: event-detail presentation — a single sheet-style `ion-modal` everywhere, no desktop-popover/touch-drawer split

**All decisions — Architecture and Product/Scope — are now resolved** (see [`OPEN-DECISIONS.md`](../../pogo-cal/docs/migration/OPEN-DECISIONS.md)):

- [x] **Resolved deferred/dropped**: "group similar events", raid-boss/spotlight art rendering (text-only for event detail), display-only preferences (theme/first-day/sprite-style/custom-colors/clock-offset — dropped entirely), URL query-param deep-linking, hover cross-highlight
- [x] **Resolved in scope** (the one exception): Season "Daily Discovery" chip — build alongside the core calendar grid

## Phase 0 — Domain Model & Types

See [`MIGRATION-CHECKLIST.md` Phase 0](../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md#phase-0--domain-model--types) and [`DOMAIN-MODEL.md`](../../pogo-cal/docs/current/DOMAIN-MODEL.md). Do this before any UI work.

- [x] Port `PogoEvent`, the event-type registry, and `EventMetadata` verbatim into `@go-gather/shared` — preserve the loosely-typed `extraData` grab-bag and the unrecognized-event-type fallback (`shared/src/calendar.ts`; `extraData`'s catch-all and `CommunityDayData`'s loose fields ported as `unknown` rather than `any` to satisfy this repo's stricter lint — same escape-hatch semantics)
- [x] Port `SeasonData`/`Season` types (resolved in scope) — the "Daily Discovery" chip data (same file)

## Phase 1 — Event Data Service

See [`MIGRATION-CHECKLIST.md` Phase 1](../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md#phase-1--event-data-service) and [`SCREEN-AND-FEATURE-MAP.md`](../../pogo-cal/docs/migration/SCREEN-AND-FEATURE-MAP.md).

- [x] Built `server/src/sync-calendar-events.ts` (`npm run sync:calendar-events`) + `GET /api/calendar-events`, mirroring the catalog-sync pipeline's shape — as a **separate** script from the Pokemon-catalog sync (resolved during this phase, see `OPEN-DECISIONS.md`); the feed already matches `PogoEvent` field-for-field so no flattening transform was needed
- [x] Added the `calendarEvents` and `season` `StorageScope`s, `StorageEngine` CRUD methods, Dexie tables (`app-db.ts`), `SqliteStorageEngine` tables, and extended the shared contract test suite (`storage-engine.contract.ts`)
- [x] Built the fetch/cache/read pipeline as a **split** (resolved during this phase, not one `calendar-events.service.ts`): `SyncService.pullCalendarEvents()`/`pullSeason()` own the `HttpClient` fetch + freshness check + write (mirroring `pullCatalog()`); the new `CalendarEventsService` (`src/app/core/services/calendar-events.service.ts`) is a thin `StorageEngine`-only reader (the `PokeDataService` analog)
- [x] Ported per-event metadata derivation (`calendar-event-metadata.util.ts`), cached once per fetch/refresh, not recomputed per render
- [x] Ported synthetic sub-event generation (`generateEventRaidHourSubEvents()`/`generateEventSpotlightSubEvents()`, `calendar-sub-events.util.ts`) — resolved in scope during this phase, run client-side at load time
- [x] Built `server/src/sync-season.ts` (`npm run sync:season`) + `GET /api/calendar-season` — resolved fully separate from events (own route/table/sync script/`StorageScope`), not bundled
- [x] Full unit test coverage — 100% on the date/name/type-info utils, 99% (statements) on the sub-events util, matching this repo's own search-engine-port precedent for previously-untested logic — see [progress notes](progress/phase-1-event-data-service.md)

## Phase 2 — Filter Service & Menu

See [`MIGRATION-CHECKLIST.md` Phase 2](../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md#phase-2--filter-service--menu) and [`FILTER-MENU-MIGRATION.md`](../../pogo-cal/docs/migration/FILTER-MENU-MIGRATION.md) (centerpiece doc for this repo's own `IonMenu`/side-menu conventions applied to Calendar).

- [x] Built `calendar-filter.service.ts` — denylist model, per-event hide, `filtersApplyToTimeline` (folded in rather than a second service), combined visibility check, matching this repo's existing `UserDataService`-style service + RxJS `Subject` pattern (no NgRx, no signals); persisted via `PreferenceStorageService` — its first real consumer in this repo. 100% test coverage
- [x] Built the `calendar-filter-menu` `IonMenu` (`menuId="calendar-filter"`, mounted at app root alongside the existing `app-nav-menu`/`app-side-menu`), category-grouped event-type toggles + All/None + hidden-events list. 100% test coverage on the component class (`side-menu.component.spec.ts`'s template-override convention). Its own page-level filter button is deferred to Phase 6 (no `calendar.page.html` exists yet)
- [x] Added `menuId="gather-filter"` to the existing `app-side-menu` and updated `gather.page.html`'s filter button to `menu="gather-filter"` (resolved disambiguation — confirmed via live source neither existing menu had a `menuId` before this phase) — see [progress notes](progress/phase-2-filter-service-and-menu.md)

## Phase 3 — Calendar (Month Grid) View

See [`MIGRATION-CHECKLIST.md` Phase 3](../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md#phase-3--calendar-month-grid-view) and [`CALENDAR-AND-TIMELINE-VIEWS.md`](../../pogo-cal/docs/current/CALENDAR-AND-TIMELINE-VIEWS.md).

- [x] Port the grid-construction util, then the grid skeleton, then the multi-day slot-packing algorithm (preserve its exact sort/conflict rules), then single-day event rendering (skip the "group similar events" `_isGrouped` branch — resolved deferred)
- [x] Build the Season "Daily Discovery" chip overlay on calendar days (resolved in scope)
- [x] Wire the filter service's visibility check unconditionally on this view — `calendar-day.component.ts` injects `CalendarFilterService` directly (rather than taking it as an input), subscribing to `listenForFilterChanges()` and calling `markForCheck()`, mirroring `generation-header-row.component.ts`'s existing OnPush+subscribe pattern so a live filter-menu toggle is reflected immediately

Built as a self-contained `calendar-view.component.*` (month/year state, prev/next/today nav, own `ngOnInit` data load) with no `calendar.page.ts` wrapper yet — see [progress notes](progress/phase-3-calendar-month-grid-view.md) for the full file list and design notes (slot-packing two-stage major-event exclusion, OnPush reactivity design, etc).

## Phase 4 — Timeline View

See [`MIGRATION-CHECKLIST.md` Phase 4](../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md#phase-4--timeline-view) and [`CALENDAR-AND-TIMELINE-VIEWS.md`](../../pogo-cal/docs/current/CALENDAR-AND-TIMELINE-VIEWS.md#timeline-view).

- [x] Port the 60-day-window categorization (Today/Ongoing/Upcoming/Future) and its distinct timing-then-priority sort — keep separate from the calendar view's priority-only sort
- [x] Wire the filter service's visibility check **conditionally**, gated on a "filters apply to timeline" toggle (default off) — preserve the "N hidden by filters" passive-indicator count. The gate is ported verbatim, including a real source quirk: toggling filtering off also un-hides individually-hidden events on the timeline (confirmed as an intentional port decision, not an oversight)
- [x] Skip raid/spotlight schedule tree-building — resolved deferred alongside text-only raid-boss art. A text-only "event extras" bonuses block (Community Day/raid-hour/spotlight/season bonus text, no icons) was ported for the expanded card, since that data isn't boss/sprite art

Built as a self-contained `timeline-view.component.*` (own `ngOnInit` data load, no `loadSeason()` since the timeline never reads season data) with no `calendar.page.ts` wrapper yet, matching `calendar-view.component.*`'s precedent — see [progress notes](progress/phase-4-timeline-view.md) for the full file list and design notes.

## Phase 5 — Event Detail

See [`MIGRATION-CHECKLIST.md` Phase 5](../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md#phase-5--event-detail) and [`VIEW-TOGGLE-AND-LAYOUT.md`](../../pogo-cal/docs/migration/VIEW-TOGGLE-AND-LAYOUT.md).

- [ ] Build one event-detail presentation — a sheet-style `ion-modal`, no desktop-popover branch, no `useDeviceDetection.ts` port (resolved); name/type/color/time range only — no `_isGrouped` handling and no boss/bonus art (both resolved deferred)

## Phase 6 — Calendar Tab & View Toggle

See [`MIGRATION-CHECKLIST.md` Phase 6](../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md#phase-6--calendar-tab--view-toggle) and [`VIEW-TOGGLE-AND-LAYOUT.md`](../../pogo-cal/docs/migration/VIEW-TOGGLE-AND-LAYOUT.md).

- [ ] Register the `calendar` tab in `tabs.routes.ts`/`tabs.page.html`, following the exact `gather` tab pattern
- [ ] Build the Calendar page: header (menu button / title / filter button), `IonSelect` Calendar/Timeline toggle, conditionally rendering the selected view below it
- [ ] Persist the selected view via `PreferenceStorageService` (resolved)
- [ ] Skip URL/query-param deep-linking — resolved deferred past the initial port

## Phase 7 — Full Parity Verification

- [ ] Full feature parity verified running as a web app, before any native-specific concerns (matching this repo's own Phase 5 precedent)
- [ ] Every non-deferred item in [`FUNCTIONALITY.md`](../../pogo-cal/docs/current/FUNCTIONALITY.md) has a working equivalent

## Done when

- [ ] Every non-deferred item in [`FUNCTIONALITY.md`](../../pogo-cal/docs/current/FUNCTIONALITY.md) has a working equivalent, verified by manual walkthrough
- [ ] Calendar-grid, slot-packing, timeline-categorization, and filter-service logic have full unit test coverage
- [ ] The Calendar tab has been verified on a real iOS device (or simulator, at minimum)
- [ ] All items in [`OPEN-DECISIONS.md`](../../pogo-cal/docs/migration/OPEN-DECISIONS.md) are resolved or explicitly deferred with a recorded reason
