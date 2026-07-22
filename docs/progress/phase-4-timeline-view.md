# Phase 4 — Timeline View

Built the Calendar tab's 60-day rolling Timeline list, per [`CALENDAR-MIGRATION-CHECKLIST.md` Phase 4](../CALENDAR-MIGRATION-CHECKLIST.md#phase-4--timeline-view) and [`pogo-cal`'s Phase 4](../../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md#phase-4--timeline-view).

## What landed

**Housekeeping first**: relocated `calendar-event-major.util.ts` (+ its spec) from `calendar/calendar-view/` to `core/services/`, since it's now genuinely cross-cutting (both `calendar-view` and `timeline-view` need `isMajorCalendarEventType()`/`getMajorCalendarEventVariant()` for major-event card styling) — matching where `calendar-event-type-info.util.ts`/`calendar-event-name.util.ts`/`calendar-event-date.util.ts` already live. Updated its 3 importers. Also tightened `shared/src/calendar.ts`'s `CommunityDayData.bonuses` from `unknown[]` to `BonusItem[]` — Phase 0 left it loose because the shape wasn't confidently known at the time; this phase's research confirmed via `CommunityDayBonuses.vue` that it's identical to the already-typed `BonusItem`.

All new files under `src/app/calendar/timeline-view/`:

**Pure-logic utils** (100% coverage except one intentionally-documented dead branch):

- `timeline-categories.util.ts` — `buildTimelineData()`, the categorization/windowing/grouping core ported from `useTimelineCategories.ts`: the `[now-1day, now+60days]` overlap filter, the `TODAY→ONGOING→UPCOMING→FUTURE` if/else-if assignment (first match wins, past events silently skipped), `sortEventsByTimingAndPriority()` (kept deliberately distinct from the calendar view's `sortEventsByPriority()` in `calendar-grid-slots.util.ts`), and date-grouping restricted to `UPCOMING`/`FUTURE` only. The `!filtersApplyToTimeline || isEventVisible(...)` gate is ported **verbatim**, preserving a real source quirk: when the toggle is off, all events become visible — including individually-hidden ones, not just type-disabled ones. This was confirmed as a deliberate port decision (match the code, not the docs' looser prose) rather than assumed.
- `timeline-event-time-display.util.ts` — `buildTimeDisplayParts()`/`buildEventStatusInfo()`/`formatSingleDayTimes()`, ported from `eventTimeDisplay.ts`: single-day ("Tue Oct 7 • 6-7pm") vs. multi-day ("Sep 7, 12am → Nov 30, 11:59pm") time formatting, and the "starts in 3d"/"ends in 45m"/"Event ended" relative-status line. Uses `EventMetadata.isSingleDayEvent` directly rather than a separate lookup.
- `timeline-event-extras.util.ts` — `getTimelineEventExtras()`, ported from `EventExtras.vue` + `hasEventExtras()`: resolves Community Day bonuses (now `BonusItem[]`), raid-hour bonuses, spotlight bonus, generic event bonus groups, and season data (for `eventType === 'season'` events) from `PogoEvent.extraData` — text only, no icons. Returns `null` when none of the 5 sources apply, matching `hasEventExtras`'s exact OR condition.

**Components:**

- `timeline-event.component.*` — one card, folding `TimelineEvent.vue` + `TimelineEventHeader.vue` into a single component (no action buttons survived — add-to-calendar is ICS/out of scope, edit-color is a dropped display preference, quick-hide is deferred). Collapsed: color dot, name, time display, expand chevron. Expanded (`isActive`, owned by the parent): status line, the text-only extras block (if any), a "View on LeekDuck" link. Major-event styling reuses the relocated `calendar-event-major.util.ts`.
- `timeline-category-section.component.*` — one section per category: title + total-count badge, a local (not persisted) expand/collapse toggle, flat list for Today/Ongoing vs. date-grouped list for Upcoming/Future, the "N event(s) hidden by filters" indicator, Today's "No single-day events scheduled today" zero-state gated on total count (not visible count).
- `timeline-view.component.*` — orchestrator, self-sufficient like `calendar-view.component.*` (own `ngOnInit` data load — `loadCalendarEvents()` only, no `loadSeason()`, since the timeline never reads season data). Owns `activeEventId`/`setActiveEvent()` (ported from `useTimelineActiveEvent.ts`: re-clicking an active card collapses it; expanding a different card scrolls it into view after a 200ms delay), the top-level "No upcoming events found" empty state, and subscribes to `CalendarFilterService.listenForFilterChanges()` to rebuild `timelineData` live.

## Design decisions made during this phase

- **`filtersApplyToTimeline`-off quirk preserved verbatim** (confirmed via question, not assumed) — see above.
- **Text-only "event extras" included** (confirmed via question) — Community Day/raid-hour/spotlight/season bonus text is genuinely informational, not boss/sprite art, and reuses `extraData` fields already in the Phase 0 domain model.
- **No per-card "hide this event" quick-action** (confirmed via question) — matches Phase 3's calendar-day cells, which also don't have one; hiding stays menu-only until a later, deliberate pass.
- **"Now" is a snapshot, not a live-ticking clock** — recomputed on `refresh()` (init, data load, filter change), same non-ticking pattern as `calendar-view.component.ts`. An event won't visibly hop categories while the page sits open; it will on the next refresh trigger.
- **Per-category collapse state is local-only, not persisted** — consistent with the "low-stakes, simple version" precedent Phase 3 set for its loading skeleton.
- **Native `scrollIntoView({ behavior: 'smooth', block: 'nearest' })`** instead of porting `timelineScroll.ts`'s custom sticky-header-aware scroll math — Phase 6 hasn't built the page/header yet, so the exact sticky-offset constants don't have a home to live in yet either.

## Verification

- `npm run build`, `npm run lint` — both clean; no new errors, only pre-existing `dayjs` CommonJS/`no-named-as-default-member` warnings.
- `npm run test -- --run` — 63 test files / 606 tests, all passing (75 net-new this phase). New `timeline-view/` files are at 100% coverage except `timeline-event-time-display.util.ts` (98.3%, one intentionally-uncovered dead branch matching the source's own unreachable "ends today" fallback under current live-event semantics — documented in-code, same pattern as `calendar-day-layout.util.ts`'s `middle-continue` branch from Phase 3).
- No page exists yet to visually exercise this (Phase 6's job) — verified via the unit/component test suite, plus confirming the relocated `calendar-event-major.util.ts` didn't break any of Phase 3's existing tests.
