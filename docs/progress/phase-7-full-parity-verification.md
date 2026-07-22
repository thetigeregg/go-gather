# Phase 7 — Full Parity Verification

An audit, not a build phase, per [`CALENDAR-MIGRATION-CHECKLIST.md` Phase 7](../CALENDAR-MIGRATION-CHECKLIST.md#phase-7--full-parity-verification) and [`pogo-cal`'s Phase 7](../../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md#phase-7--full-parity-verification). Cross-checked every item in `pogo-cal/docs/current/FUNCTIONALITY.md` and `OPEN-DECISIONS.md`'s Product/Scope table against the shipped `go-gather` code directly (not against prior phases' own progress notes, which could have drifted), verified the two explicit cross-phase parity contracts by reading the current source, and re-ran the full build/lint/test gate.

## Traceability matrix

| `FUNCTIONALITY.md` item                                                                                  | Status                    | `go-gather` equivalent                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single main view (calendar tab)                                                                          | Done                      | `tabs.routes.ts`/`tabs.page.*` (Phase 6) — real tab, real route, replacing `pogo-cal`'s single-route SPA shell                                           |
| Month calendar grid, nav, multi-day slot packing, single-day events, Season chip                         | Done                      | `calendar-view/*` (Phase 3)                                                                                                                              |
| 60-day timeline, 4 categories, day-grouping, hidden-count indicator                                      | Done                      | `timeline-view/*` (Phase 4)                                                                                                                              |
| Event-type filter (denylist), All/None, per-event hide _(restore side)_                                  | Done                      | `calendar-filter.service.ts` + `calendar-filter-menu.component.*` (Phase 2)                                                                              |
| Per-event hide _(the hide action itself)_                                                                | **Gap — see below**       | `hideEventById()` exists, no UI calls it                                                                                                                 |
| Calendar-unconditional / timeline-conditional filtering                                                  | Done, verified this phase | see contract check below                                                                                                                                 |
| Event detail (name/type/color, time range, outbound link)                                                | Done                      | `event-detail.component.*` (Phase 5), plus text-only extras (bonuses) beyond the minimum bar                                                             |
| Responsive side-by-side/stacked "always both" layout                                                     | N/A by design             | Replaced by the `IonSelect` toggle (Phase 6) — a deliberate new-UX decision, not a gap; both views are never meant to render simultaneously in this port |
| URL/query-param deep-linking (`?month=`, `?event=`, `?settings=`)                                        | Confirmed deferred        | No query-param state anywhere in `calendar.page.*`/`calendar-view.component.ts` — grepped, none found                                                    |
| "Group similar events"                                                                                   | Confirmed deferred        | No `_isGrouped`/`_groupedEvents` concept anywhere in the shared types or components — grepped, none found                                                |
| Display preferences (theme, first-day-of-week, font size, sprite style, custom colors, clock offset)     | Confirmed dropped         | None of these fields exist on `CalendarFilterState` or anywhere else; `firstDayIndex` is a hardcoded constant, not a setting                             |
| Raid-boss/spotlight-bonus art (sprites, tier groups, CP)                                                 | Confirmed text-only       | No Pokémon-image resolution code anywhere under `calendar/`; `EventMetadata.spotlightBonus`/`raidBossTierGroups` are typed but never populated (Phase 1) |
| Hover cross-highlight                                                                                    | Confirmed dropped         | No hover-state/highlight code anywhere under `calendar/`                                                                                                 |
| Not-present-today items (no date-range filter, no week/day view, no pagination, no accounts, no presets) | Still true                | Nothing added in any phase introduced any of these — confirmed by absence, not by a specific file                                                        |

## The one real gap: per-event "quick-hide" has no UI trigger

`CalendarFilterService.hideEventById()` (Phase 2) is fully built, persisted, and restorable — `calendar-filter-menu.component.ts`'s hidden-events list calls `showEventById()` to un-hide, but nothing anywhere in the app calls `hideEventById()` to hide an event in the first place. Grepped the whole `src/app` tree; the only reference to `hideEventById` is its own definition.

This isn't an oversight discovered now — it was a deliberate Phase 5 planning decision ("defer quick-hide, matching Phase 3's calendar-day cells not having one either"). But since per-event hide is one of only two filter axes `FUNCTIONALITY.md` calls out as core, non-deferred functionality, it's worth being explicit that this axis currently has **no reachable entry point** for a user — the denylist (event-type) axis is fully reachable; the per-event axis is only reachable in the "undo" direction.

**Resolution, confirmed via question this phase**: report only, don't build it in Phase 7. Formalized as a tracked decision in `pogo-cal/docs/migration/OPEN-DECISIONS.md`'s Product/Scope table (a new "Per-event quick-hide UI trigger" row, **Deferred**) rather than left as an implicit, undocumented gap. Building the actual quick-hide affordance (most likely a button on `event-detail.component`, since that's the one detail surface both views eventually route through) is left as explicit follow-up work, not bundled into this audit phase.

## Parity contracts verified directly in shipped code

1. **Calendar-unconditional vs. timeline-conditional filtering.** Confirmed by reading the current source, not prior notes:
   - `calendar-grid-slots.util.ts:126` — `filterMultiDayEventsForCalendar()` calls `isEventVisible(event.eventType, event.eventID)` directly, no gate.
   - `calendar-single-day-events.util.ts:62` — `getDailySingleDayEvents()` calls `isEventVisible(...)` directly, no gate.
   - `timeline-categories.util.ts:136` — `buildTimelineData()` uses `!filtersApplyToTimeline || isEventVisible(...)`, the gated (and Phase-4-confirmed-intentional-quirk) form.
   - Both call sites (`calendar-view.component.ts:172`, `calendar-day.component.ts:106`) pass `calendarFilterService.isEventVisible` through with no additional gating at the component level either.
2. **Two sort functions, never merged.** `sortEventsByPriority()` is defined once (`calendar-grid-slots.util.ts`) and used only within the calendar view (its own definition plus one import in `calendar-single-day-events.util.ts`). `sortEventsByTimingAndPriority()` is defined once (`timeline-categories.util.ts`) and used only there. No third call site anywhere merges or cross-calls between them — grepped across the whole `src/app` tree.

## Verification

- `npm run lint` — clean, 0 errors (11 pre-existing warnings, all `dayjs` CommonJS-interop cautions predating this phase, unrelated to Calendar).
- `npm run test -- --run` — 65 test files / 625 tests, all passing. No changes made this phase, so no coverage delta.
- `npm run build` — clean, `calendar-page` builds as its own lazy chunk (confirmed in Phase 6, unchanged).

## What's explicitly left for the user, not claimed as done

- **Real-device verification.** No device/simulator access this session — the `MIGRATION-CHECKLIST.md` "Done when" item for real-iOS-device testing stays unchecked until the user does it.
- **Interactive click-through.** No browser/screenshot tool available this session. Everything above was verified by reading source and running the automated suite, not by driving the running app. The user should still click through: tab bar → view toggle → filter menu → tapping a grid event opens the detail modal → season-chip tap → selected-view persistence across a reload — the same list from Phase 6's verification notes, now with the confidence that the underlying code has been re-audited end to end.
