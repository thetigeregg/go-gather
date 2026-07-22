# Phase 3 — Calendar (Month Grid) View

Built the Calendar tab's month-grid view — the highest-complexity phase of the migration — per [`CALENDAR-MIGRATION-CHECKLIST.md` Phase 3](../CALENDAR-MIGRATION-CHECKLIST.md#phase-3--calendar-month-grid-view) and [`pogo-cal`'s Phase 3](../../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md#phase-3--calendar-month-grid-view).

## What landed

All under `src/app/calendar/calendar-view/`:

**Pure-logic utils** (each independently unit-tested, at or near 100% coverage):

- `calendar-event-major.util.ts` — `MAJOR_CALENDAR_EVENT_TYPES`/`isMajorCalendarEventType()`/`getMajorCalendarEventVariant()`, ported from `eventMajor.ts` including its crude `.includes('global')` substring heuristic (kept as-is, not silently fixed).
- `calendar-event-subtype.util.ts` — `getRaidSubType()`/`getRaidSubTypePriority()`, ported from `eventSubtype.ts`.
- `calendar-grid.util.ts` — `buildCalendarDays()`, the backward/forward whole-week-alignment walk, ported verbatim from `calendarGrid.ts`.
- `calendar-grid-slots.util.ts` — the multi-day slot-packing algorithm (`useCalendarGridSlots.ts` port): the 3-clause date-overlap visibility filter, `shouldShareSlot`/`hasConflictInSlot`/slot-finding, the priority→raid-subtype→start-date sort (the "grouped-before-individual" step is dropped, not preserved — "group similar events" is resolved deferred), `shouldRenderOnDay`.
- `calendar-day-layout.util.ts` — a `CalendarDayLayout` class (chosen over a long parameter list of standalone functions, the natural Angular equivalent of the source's closure-heavy Vue composable): per-week compaction, `getEventSlotTop`/`getMultiDayEventBarClass`/`getEventPosition` (fractional-day math, week-clamping, 1px same-lane-gap adjustment).
- `calendar-single-day-events.util.ts` — per-day single-event list + major-event daily projections (`useCalendarDaySingleEvents.ts` port, minus the raid-schedule boss-dedup step, whose only purpose was feeding sprite rendering — deferred). Synthetic ID scheme (`${eventID}-daily-${dateKey}`) with a `_sourceEventID` back-reference, resolved via `getSourceEventID()`.
- `season-daily-chip.util.ts` — `formatSeasonChipLabel()` (weekday-stripping + abbreviation table) plus a simplified daily-bonus lookup: since `CalendarEventsService.season` is a single current-season object (not `pogo-cal`'s array requiring a date-range search) and the chip only ever renders for the current week, no `Season.start`/`end` range check is needed at all.

**Components:**

- `multi-day-event-bar.component.*` — dumb/presentational bar: absolute positioning from `{left, width}` inputs, color + text label only (no sprites), `(eventClick)` output stub.
- `single-day-event.component.*` — dumb/presentational block: color dot + time + name, major-daily-projection styling (wider/taller card + global-vs-location-specific accent), `(eventClick)` output stub. No badge (grouping dropped) or sprite icons (deferred).
- `calendar-day.component.*` — one grid cell: date number, today/other-month styling, Season chip, multi-day bars (via a per-cell `CalendarDayLayout` instance), single-day events (via `calendar-single-day-events.util.ts`).
- `calendar-view.component.*` — orchestrator: month/year as plain component fields (no router/URL sync), prev/next/today nav (Jan-2016 floor, December-of-next-year ceiling, ported from `CalendarHeader.vue`), day-of-week header row (hardcoded Sunday-first), CSS Grid month layout. Loads its own event/season data in `ngOnInit()` — no `calendar.page.ts` exists yet (Phase 6's job) for it to share a loader with.

## Design calls made during this phase

- **Two-stage major-event exclusion, preserved exactly**: `pokemon-go-fest`/`pokemon-go-tour`/`wild-area` events still consume a slot index during packing (affecting which slot other multi-day events land in) even though `CalendarDayLayout.getMultiDayEvents()` excludes them from actually rendering as bars — they render only via the single-day daily-projection system instead. Covered by a dedicated test.
- **`CalendarFilterService` injected directly into `CalendarDayComponent`, not passed down as an `isEventVisible` input.** The global filter menu (`app-calendar-filter-menu`, mounted at app root) can toggle state while the Calendar page is open; `CalendarDayComponent` uses `OnPush`, and a stable function-reference input wouldn't trigger a re-render when only the _result_ of calling it changes. Instead, `CalendarDayComponent` subscribes to `listenForFilterChanges()` in `ngOnInit()` and calls `changeDetectorRef.markForCheck()`, mirroring the existing `generation-header-row.component.ts` subscribe+markForCheck precedent, rather than inventing a new reactivity pattern. `calendar-view.component.ts` separately subscribes to the same stream to rebuild `eventSlots` (multi-day packing also depends on visibility, and that computation lives at the month level, not per-day).
- **`CalendarDayLayout` instance rebuilt in `ngOnChanges`, not memoized via a getter.** Since `eventSlots` is rebuilt with a fresh array reference on every relevant change (nav, data load, filter toggle) at the `calendar-view` level, `ngOnChanges` reliably fires on the child, so the layout instance is safely rebuilt once per real change rather than once per change-detection pass.
- **CSS Grid, not `ion-grid`**, for the 7-column month layout — matches `pogo-cal`'s own approach; Ionic's `ion-grid` is a 12-column flexbox model that doesn't map cleanly onto a 7-day week.
- **No loading skeleton, no `BirthdayBadge`** — the skeleton was explicitly low-stakes/unresolved in `OPEN-DECISIONS.md`; `BirthdayBadge` is unrelated Pokémon GO anniversary decoration, not carried over.

## Verification

- `npm run build`, `npm run lint` — both clean (fixed two pre-existing `no-confusing-void-expression` lint errors in a new spec file, and two pre-existing `restrict-template-expressions` errors in `calendar-day-layout.util.ts` from earlier in this phase — this repo's `strictTypeChecked` config sets `allowNumber: false`, so numeric template-literal interpolations need an explicit `String(...)`).
- `npm run test -- --run` — 57 test files / 531 tests, all passing. New files this phase are at 100% coverage except `calendar-day-layout.util.ts` (99%, one intentionally-uncovered dead branch matching the source's own acknowledged dead code) and `calendar-grid-slots.util.ts` (100% lines, a few branch permutations not separately exercised).
- No page exists yet to visually exercise this (Phase 6's job) — verified via the unit/component test suite and confirming the new components compile cleanly as standalone Angular components with no template/DI errors.
