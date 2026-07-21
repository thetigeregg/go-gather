# Phase 0 — Calendar Domain Model & Types

Ported `pogo-cal`'s calendar/event domain types into `@go-gather/shared` per [`CALENDAR-MIGRATION-CHECKLIST.md` Phase 0](../CALENDAR-MIGRATION-CHECKLIST.md#phase-0--domain-model--types) and [`pogo-cal`'s Phase 0](../../../pogo-cal/docs/migration/MIGRATION-CHECKLIST.md#phase-0--domain-model--types).

## What landed

- New file `shared/src/calendar.ts`: `EventTypeInfo`, `EventTypeInfoWithoutColor`, `PokemonBoss`, `RaidBattlesData`, `SpotlightData`, `CommunityDayData`, `MaxBattlesData`, `BonusItem`, `EventBonusGroup`, the Season chain (`SeasonDailyBonusGroup`/`SeasonDailyBonus`/`SeasonBonusEntry`/`SeasonData`/`Season`), `RaidScheduleEntry`, `SpotlightScheduleEntry`, `RaidBossTierGroup`, `SpotlightBonusInfo` (inlined, not imported — see below), `PogoEvent`, `EventMetadata`, the 34-entry `EVENT_TYPES` registry, `EventTypeKey`.
- `shared/src/index.ts`: added `export * from './calendar.js';` alongside the existing `models.js` export — the package's first multi-file split (per user decision; no prior precedent either way).
- `shared/package.json`: added `dayjs@1.11.21` (matching `pogo-cal`'s pin) — the first dependency this package has ever declared.

## Deviations from a literal verbatim port

- **`any` → `unknown`**: `pogo-cal`'s source uses `any` in three places (`CommunityDayData.bonuses`/`specialresearch`, and `PogoEvent.extraData`'s catch-all index signature). `go-gather`'s ESLint config (`@typescript-eslint/no-explicit-any`) rejects bare `any` with no existing lint-disable precedent anywhere in the repo to justify introducing one. Used `unknown[]`/`unknown` instead — same escape-hatch semantics (nothing is modeled/asserted about the shape), just satisfies strict typing. Not a narrowing of the domain.
- **`eventType: EventTypeKey | string`**: intentionally redundant in the source (documents "usually a known key, but the feed can introduce new ones") — ESLint's `no-duplicate-type-constituents` flags this. Kept the union (preserves the forward-compat documentation/intent) with an inline `eslint-disable-next-line` plus a comment explaining why, rather than collapsing to plain `string` (would lose the intent) or narrowing to `EventTypeKey` (would break the explicit unrecognized-type-fallback requirement).

## Explicitly NOT ported (per plan, deferred to later phases)

- `getEventTypeInfo()` — logic, not a type; lands in the app in Phase 1 alongside `calendar-events.service.ts` (which needs `EVENT_TYPES`/`EventTypeKey` from `@go-gather/shared`, but the fallback function itself is app logic, not shared).
- `TimelineCategory`/`TimelineCategoryKey` — timeline-view-specific, not a domain-model concern; Phase 4.
- `buildEventMetadata()`, `buildTierGroupsFromBosses()`, `sortTierLabel()` — logic functions, Phase 1/3.

## Verification

- `npm run build` (Angular app) — clean.
- `server/`'s `tsc --noEmit` — clean (server also consumes `@go-gather/shared`).
- `npx eslint shared/src/calendar.ts shared/src/index.ts` — clean after the `unknown`/lint-disable adjustments above.
- `npx prettier --check` on the new/changed files — clean.
- `npm run test -- --run` — 38 test files / 338 tests, all passing (no regressions; this phase added no new tests itself, since it's types-only with no logic to test yet).
