# Phase 6 — Calendar Tab & View Toggle

Registered the Calendar tab and built its page/view-toggle, per [`CALENDAR-MIGRATION-CHECKLIST.md` Phase 6](../CALENDAR-MIGRATION-CHECKLIST.md#phase-6--calendar-tab--view-toggle) and [`pogo-cal`'s Phase 6](../../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md#phase-6--calendar-tab--view-toggle). This is the integration phase — every piece built in Phases 0–5 finally has somewhere to live.

## What landed

- `src/app/calendar/calendar.page.ts/.html/.scss(+.spec.ts)` — the page, ported from `pogo-cal`'s `pages/Calendar.vue`. Header: menu button (`menu="start"`) / title / filter button (`menu="calendar-filter"`, opening the Phase 2 menu — its first page-level trigger). Second toolbar row hosts an `IonSelect` Calendar/Timeline toggle (`interface="popover"`), matching `VIEW-TOGGLE-AND-LAYOUT.md`'s own sketch. Content conditionally renders `<app-calendar-view>` or `<app-timeline-view>`. `selectedView` is read from `PreferenceStorageService` once in `ngOnInit()` (fire-and-forget promise chain, not `async ngOnInit` — Angular's `OnInit` interface is `void`-returning, so the promise is chained with `.then()`/`.catch()` instead, matching this repo's existing lifecycle-hook convention) and written on every `onViewChange()`, both following `CalendarFilterService`'s existing corrupt-value-falls-back-to-default and log-and-continue error-handling patterns.
- `src/app/tabs/tabs.routes.ts` — added a `calendar` child route, lazy-loaded exactly like the existing `gather` route.
- `src/app/tabs/tabs.page.html`/`.ts` — added a second tab button (`calendar` icon, "Calendar" label) alongside `gather`.

No changes to `calendar-view.component.*`, `timeline-view.component.*`, `event-detail.component.*`, `calendar-filter-menu.component.*`, or any core service — this phase only mounts what Phases 0–5 already built.

## Design decisions made during this phase

- **`calendar-view.component`/`timeline-view.component` stay self-sufficient** (confirmed via question) — both already load their own calendar-event data in `ngOnInit()`, flagged in Phases 3/4 as a possible follow-up to hoist to the page level once a real page existed to share a loader. Since the `IonSelect` toggle only ever mounts one view at a time (`@if`/`@else` destroys the inactive one), switching views re-triggers that view's own load — a `StorageEngine` re-read (not a network refetch; `SyncService`'s freshness check is separate) plus a metadata recompute. At this app's event volume (dozens of events) this is a minor, non-correctness-affecting cost, not worth a component-API refactor three phases after those components were built and tested independently.

## Verification

- `npm run build`, `npm run lint` — both clean. Fixed one lint error surfaced by this phase's new code: `async ngOnInit(): Promise<void>` tripped `@typescript-eslint/no-misused-promises` (a Promise-returning method where `OnInit`'s `void`-returning signature is expected) — no other component in this codebase uses an async lifecycle hook either, so `ngOnInit()` was rewritten as synchronous with an internal `.then()`/`.catch()` chain instead, matching existing convention.
- `npm run test -- --run` — 65 test files / 625 tests, all passing (8 net-new this phase). `calendar.page.ts` is at 100% coverage.
- Confirmed via `ng build` that `calendar-page` now builds as its own lazy chunk, and via a local `ng serve` boot that the app starts cleanly with the new tab registered and no runtime errors. Full interactive verification (tapping through the tab bar, the view toggle, opening the filter menu, opening the event-detail modal from the grid, and confirming the selected view persists across a reload) is a manual browser/simulator check, left to the user — this is the first phase where that's even possible, since no page existed to click through before now.
