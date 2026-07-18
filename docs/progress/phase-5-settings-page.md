# Phase 5 — Group 3: Settings Page

Status: complete. `npm run lint`, `npm run test` (24 files, 180 tests), and `npm run build` all pass. Manually verified end-to-end in a real browser: all 5 chip fields render with their ported hint text, adding/removing chips works, non-numeric entries in the two dex-number fields are silently dropped, and edits persist across a full page reload (see the sync-timing caveat below).

## What changed

- New `src/app/features/chip-list-input/chip-list-input.component.{ts,html,scss}` — a small reusable add/remove chip-list editor (`ion-input` + Enter/blur-to-add, `ion-chip` + close-icon-to-remove). No validation inside it — validation stays at the point of use, matching go-gather-next's per-field placement, so the component works for any `string[]`.
- `settings.page.ts`/`.html`/`.scss` replace the placeholder stub with the ported `SettingsDialogComponent` logic: 5 local `string[]` mirrors (`patterns`, `dexNumbers`, `shinyDexNumbers`, `shinyPatterns`, `userTags`), 5 change handlers calling `UserDataService.updateUserSettings()` immediately per edit (no Save/Cancel, matching the original and the side menu's immediate-apply convention), and the exact original hint-paragraph copy (it documents real regex/behavior, e.g. `\(Copy \d{4}\)`).
- Confirmed (again, by direct read of the source): `presetQueries` — the 12th and final `UserSettings` field — is untouched here, exactly as expected; it belongs to Group 5.

## Dialog → page: `ionViewWillEnter` instead of an `@Input` setter

The original reloaded its 5 local mirrors from `UserDataService.getUserSettings()` whenever a `visible` input was set to `true` (i.e., every time the dialog opened). Since `IonicRouteStrategy` can reuse a cached route's component instance on back-navigation, a plain `ngOnInit` isn't guaranteed to re-fire on every visit to `/settings`. Used Ionic's `ionViewWillEnter()` lifecycle hook instead (`SettingsPage implements ViewWillEnter`) — fires on every page-activation regardless of route-instance reuse, faithfully matching "always fresh when opened."

## A real (pre-existing) sync-timing race found during verification, not fixed here

Manual testing surfaced a genuine race: `UserDataService.updateUserSettings()` triggers `SyncService`'s push+pull cycle after every call (per Phase 4's design). Making **several edits within ~1 second of each other** (e.g. add a pattern, add a dex number, remove a pattern chip, all in quick succession) can lose one of the earlier edits — a later-arriving pull response, built from a slightly-stale server state, can overwrite a local optimistic update whose own push hadn't been reflected server-side yet. Confirmed via direct IndexedDB inspection and repeated tests:

- A **single** edit always persists correctly.
- **Rapid-fire edits** (< ~1s apart) can drop an earlier one.
- The **same edits paced ~2.5s apart** (letting each sync cycle settle) always persist correctly.

This is a limitation of Phase 4's sync architecture (explicitly documented there as "no request batching," a deliberate simplification vs. game-shelf), not something introduced by or specific to this page — the side menu's toggles/radios could trigger the identical race if clicked rapidly enough. Not fixed in this pass (out of scope for a UI-rebuild group; would need debouncing/coalescing `updateUserSettings` calls or batching sync triggers, a Phase-4-level architectural decision). Flagging here for future attention rather than a quick patch.

## Tests

`chip-list-input.component.spec.ts`: add-with-trim, blank/whitespace-only input doesn't emit, remove-by-index.

`settings.page.spec.ts`: replaced the trivial "should create" stub — covers `ionViewWillEnter` hydration from `UserDataService`, all 5 change handlers calling `updateUserSettings` with the correct partial, and the numeric-filter behavior (non-numeric entries dropped, valid ones mapped to `number[]`) for both dex-number fields. Both specs needed the by-now-established `TestBed.overrideComponent(X, { set: { template: '<div></div>', styleUrl: undefined } })` treatment for any real-templateUrl component reachable through an ancestor's `imports` array (`ChipListInputComponent` inside `SettingsPage`'s test).

## Deferred

Groups 4-5 (search strings, preset queries pages) remain, unaffected by anything here.
