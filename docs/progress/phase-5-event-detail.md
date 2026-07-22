# Phase 5 — Event Detail

Built the Calendar tab's unified event-detail view and wired tap-to-open from the calendar grid, per [`CALENDAR-MIGRATION-CHECKLIST.md` Phase 5](../CALENDAR-MIGRATION-CHECKLIST.md#phase-5--event-detail) and [`pogo-cal`'s Phase 5](../../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md#phase-5--event-detail).

## What landed

**Housekeeping first**: relocated `timeline-event-time-display.util.ts` and `timeline-event-extras.util.ts` (+ their specs) from `calendar/timeline-view/` to `core/services/`, since both are now genuinely cross-cutting — `event-detail.component` needs the same time-display formatting and text-only extras that `timeline-event.component.ts` already uses. Updated `timeline-event.component.ts`'s two import paths; no behavior change.

**New**: `src/app/calendar/event-detail/event-detail.component.*` — dumb/presentational, takes `event`/`metadata`/`now` inputs and a `closed` output. Renders a color banner (name + event-type label) with a close button, the time display + relative-status line (reusing the relocated time-display utils), the text-only extras block (reusing the relocated `getTimelineEventExtras()` — same markup as `timeline-event.component.html`'s extras block), and a "View on LeekDuck" link. No action buttons at all — no add-to-calendar, no edit-color, no hide.

**Modified:**

- `calendar-view/calendar-view.component.ts` — added `selectedEvent`/`selectedEventMetadata` fields, `onEventClick(event)` (resolves metadata via the existing `getSourceEventID()`, so a tap on a major-event daily projection still finds its real metadata; no-ops if metadata isn't found), and `closeDetail()`.
- `calendar-view/calendar-view.component.html` — bound `(eventClick)` on `<app-calendar-day>` (previously unbound — the missing wire left over from Phase 3) and added a declarative `<ion-modal [isOpen]="selectedEvent !== null">` (sheet-style, `initialBreakpoint`/`breakpoints`) hosting `<app-event-detail>`. This is the first `ion-modal` in the app.
- `calendar-view/calendar-day.component.ts/.html` — the season-chip `<div>` gained `(click)="onSeasonChipClick(chip.sourceEventID)"`, which looks up the real event from the component's own `events` input and re-emits it through the existing `eventClick` output (no new `@Output` needed) — no-ops if not found.

No changes were needed to `multi-day-event-bar.component.*`/`single-day-event.component.*` — their `(eventClick)` outputs already bubbled through `calendar-day.component.ts` from Phase 3; only the final consumer (`calendar-view.component`) was missing.

## Design decisions made during this phase

- **Timeline cards are not wired to the modal** (confirmed via question) — full-file source research confirmed `TimelineEvent.vue` has zero code path, direct or indirect, that opens the source's equivalent (`EventTooltip.vue`). Only `MultiDayEventBar.vue`, `SingleDayEvent.vue`, and `SeasonDailyChip.vue` open it. Phase 4's inline tap-to-expand already shows the same time/status/extras/link content a modal would, so adding one on top would be a redundant second view of the same information.
- **No action buttons in the detail header** (confirmed via question) — source's shared `EventTooltipHeader.vue` reintroduces add-to-calendar, edit-color, and hide buttons, all three already resolved out of scope/deferred elsewhere in this port. The port's header is just the banner + close.
- **Season chip tap wired this phase** (confirmed via question) — Phase 3's `season-daily-chip.util.ts` already carried a `sourceEventID` field earmarked for exactly this.
- **A real architecture point, not assumed**: the season chip's `sourceEventID` comes from `CalendarEventsService.season` — a fully separate fetch/table from the general calendar-events feed (Phase 1). There's no structural guarantee a matching event exists in the general feed for that ID. Source itself only handles this defensively (`v-if="seasonChip.event"`); the port mirrors that — `onSeasonChipClick()` looks up the real event and no-ops if it isn't found, rather than assuming the ID always resolves.
- **No major-event background-mask decoration** — source's `EventTooltip.vue` style block has cosmetic global/location-specific season icon masking tied to the deferred art system; not ported, the color banner alone carries enough visual identity.

## Verification

- `npm run build`, `npm run lint` — both clean. Fixed two lint errors surfaced by this phase's new code: an `@typescript-eslint/no-unnecessary-condition` false positive on an `EventMetadata` record lookup (fixed with the established `Partial<Record<string, T>>` re-typing pattern) and an `@angular-eslint/no-output-native` violation (`@Output() close` collided with the native DOM `close` event name — renamed to `closed`).
- `npm run test -- --run` — 64 test files / 617 tests, all passing (11 net-new this phase). `event-detail.component.ts`, the updated `calendar-view.component.ts`, and `calendar-day.component.ts` are all at 100% coverage.
- No page exists yet to visually exercise this end-to-end (Phase 6's job — no tab is registered yet) — verified via the unit/component test suite, plus confirming the relocated time-display/extras utils didn't break Phase 4's existing `timeline-event.component` tests.
