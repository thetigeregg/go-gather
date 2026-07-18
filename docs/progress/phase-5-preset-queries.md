# Phase 5 — Group 5: Preset Queries (final group)

Status: complete. This was the final group in the 5-group "Rebuild components/pages" breakdown — all groups are now done. `npm run lint`, `npm run test` (28 files, 219 tests), and `npm run build` all pass. Manually verified end-to-end in a real browser: create a preset (Category → Kind → Value selection, live preview updating correctly), Save persists it and returns to the list showing the compiled string via the reused `app-search-string` component, Edit hydrates every field correctly from the saved preset, Cancel discards without writing, Delete shows a native-feeling confirm alert and actually removes it, and the deletion survives a full page reload. Also verified numeric-range rules, multiple OR'd groups, and all three cases of the negated-tag-before-OR warning banner.

## A real bug found during continued verification, fixed (user-approved)

Toggling a numeric rule's "Range" checkbox before entering a min/max value made `compilePresetQuery()` throw (`Error: Numeric range must specify at least one of min/max`, from the already-ported, unchanged serializer) — a genuine transient edit state the original PrimeNG version has identically, since `updatePreview()` calls `compilePresetQuery()` unguarded on every keystroke/toggle. Confirmed via direct IndexedDB injection that a preset saved in that exact state would permanently break the **list page** too (`compilePresetQuery(preset) ?? '(no rules yet)'` throwing during `refreshRows()`'s row-building map, not just the editor).

Fixed with the user's explicit approval, scoped narrowly to defensive error handling (no business-logic change):

- `preset-query-edit.page.ts`'s `updatePreview()`: wraps the `compilePresetQuery()` call in try/catch, falling back to `previewString = null` (renders as the existing "(no rules yet)" placeholder) — and the negated-tag-before-OR warning computation now runs unconditionally afterward, so a failed compile doesn't also suppress that separate check.
- `preset-queries.page.ts`: extracted `compileForDisplay()`, wrapping the list's per-row `compilePresetQuery()` call, falling back to a distinct `(invalid preset — edit to fix)` message (not the same text as a genuinely empty preset, so a user can tell the two states apart) instead of crashing the whole list.

Verified via the same browser reproduction that found the bug (console errors: `[]` afterward) and via direct IndexedDB injection of a broken preset — the list now renders it with the fallback text and working Edit/Delete buttons instead of crashing.

## What changed

- `preset-queries.page.ts`/`.html`/`.scss`: rewrote the stub into the list/CRUD page — rows via the already-built `app-search-string` (Group 4) showing each preset's `compilePresetQuery()` output, "New Preset" / Edit navigate to the new editor route, Delete goes through `AlertController` (replacing the original's native `confirm()`).
- **New**: `src/app/preset-queries/edit/preset-query-edit.page.{ts,html,scss}` — the ~26-term-kind rule builder, now a routed page at `preset-queries/:id/edit` instead of an embedded dialog-in-dialog. All business logic (`EditableRule`/`EditableGroup`, `toEditableRule`, `applyTermValue`, `toSearchTermData`, `defaultValueForCatalogEntry`, `buildPresetQuery`, the `hasUnsafeNegatedTagBeforeOr` warning, the dropdown re-emit guards) ported unchanged — confirmed by diffing against the go-gather-next original. Only the template widgets and the save/cancel mechanism changed.
- **`app.routes.ts`**: added `preset-queries/:id/edit`, with `id === 'new'` as the create-mode sentinel (matching the original's `preset: null` meaning "new").

## Widget mapping (PrimeNG → Ionic), by `inputKind`

| `inputKind`            | → Ionic                                                                             | Kinds                                       |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| `none`                 | (nothing)                                                                           | `hasTag`, `weather`, `special`              |
| `freeText`             | `ion-input`                                                                         | `name`, `family`, `raw`, etc.               |
| `tagPicker`            | `ion-select` (options = `userTags`)                                                 | `tag`                                       |
| `enum` / `keywordEnum` | `ion-select`                                                                        | `region`, `type`, `keyword`, etc.           |
| `numericRange`         | `ion-select` (field) + `ion-checkbox` (range toggle) + `ion-input type="number"`(s) | `numeric`                                   |
| `statRating`           | `ion-select` (field) + `ion-input type="number"`                                    | `statRating`                                |
| `smallEnumNumber`      | `ion-input type="number"` (clamped)                                                 | `appraisalStars`, `buddyLevel`, `megaLevel` |

Plus per-rule: category `ion-select`, kind `ion-select`, negate `ion-toggle`, remove via a trash-icon `ion-button`. Save stays disabled while `!name` (only hard validation gate, unchanged).

## A real routing bug, found and fixed during manual verification

`app.routes.ts` initially listed `preset-queries` (the plain list route) **before** `preset-queries/:id/edit`. Angular's router tries routes in array order: the plain `preset-queries` entry (no `pathMatch: 'full'`, no children) attempted to match the 3-segment URL `preset-queries/new/edit` as a prefix, failed to consume the trailing `new/edit` segments, and — because that failure happened while already committed to that branch — the router threw `NG04002: Cannot match any routes` instead of backtracking to try the next sibling. Confirmed via direct browser navigation (`page.goto` to the URL directly reproduced the same failure independent of any click handler). Fixed by reordering: **more specific routes must come before less specific ones** in a flat `Routes` array — standard Angular routing practice that this migration's route list had violated. `preset-queries/:id/edit` now precedes the plain `preset-queries` route.

## Dialog → routing, and other scope calls

- **Save/Cancel become navigation**: `saveClicked()` keeps its exact `buildPresetQuery()`/`updateUserSettings()` logic, then `router.navigate(['/preset-queries'])`; Cancel navigates back the same way without writing.
- **`ionViewWillEnter()` reads the route's `id` param** (via `ActivatedRoute.snapshot.paramMap`) instead of an `@Input() preset` setter — same "always fresh when opened" hydration semantics as Groups 3/4's `ionViewWillEnter` convention, with a fallback to create-mode if the id doesn't match any saved preset (defensive; shouldn't happen via normal navigation).
- **Single page file for the editor**, not split into `features/` sub-components — the rule-row UI is used in exactly one place, matching "don't introduce abstractions beyond what's needed."
- Confirmed via source read: `presetQueries` is the last of the 12 `UserSettings` fields to get UI, and this group touches nothing else — `search-engine/`, `preset-query.compiler.ts`, and `search-term-catalog.ts` are all untouched, exactly as scoped.

## Tests

`preset-queries.page.spec.ts`: row-building with compiled preview strings (including the `(no rules yet)` empty-preset case), New/Edit navigation targets, and the delete-confirm-then-actually-delete flow (mocking `AlertController.create`'s returned buttons/handlers).

`preset-query-edit.page.spec.ts`: create-mode vs. edit-mode vs. unknown-id hydration; add/remove rule and group; one representative round-trip per `inputKind` (8, not all 26 kinds) through `toEditableRule` → field edit → `toSearchTermData` via `saveClicked()`; the negated-tag-before-OR warning (true/false cases); Save appending vs. replacing-by-id; Cancel writing nothing. Button-`disabled` state (the `!name` gate) wasn't independently unit-tested — Angular templates can't be rendered in this project's Vitest harness (an established limitation from Group 1) — but was confirmed visually in manual browser verification (Save greyed out with an empty name, enabled once filled).

## Phase 5 complete

All 5 groups of "Rebuild components/pages" are done. The two remaining Phase 5 checklist items are: rebuilding export/import via Capacitor filesystem/file-picker/share plugins, and a full feature-parity pass running as a web app before touching native (Phase 6).
