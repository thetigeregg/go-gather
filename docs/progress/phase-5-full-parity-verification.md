# Phase 5 — Full Feature Parity Verification (final checklist item)

Status: complete. `npm run lint` (0 errors, 1 pre-existing unrelated warning about `server/src/db.ts`), `npm run test` (31 files, 263 tests), and `npm run build` all pass. This closes both the last Phase 5 checklist box and the "Done when" section's `current/FUNCTIONALITY.md` parity line — every feature it lists has now been either directly exercised in this pass or was already thoroughly covered by an earlier rebuild group (cited below rather than re-tested), and two real bugs surfaced here have been fixed and verified.

Unlike every prior group's own verification (which each tested its own slice in isolation, often with default/simple settings), this pass was a deliberate cross-cutting walkthrough: all 7 pokedex types, filter combinations, exclusion lists' actual effect on the grid, search strings across pokedex types, cross-feature integration (Settings → Preset Queries → Search Strings), and a combined multi-feature reload — plus a static diff of every preset-query `inputKind` against go-gather-next to close the gap left by Group 5 unit-testing only 8 of ~26 kinds.

## Two real bugs found and fixed

### 1. `SearchConfigService.loadConfig()` missing from app-wide bootstrap

`main.ts`'s `provideAppInitializer` explicitly awaits settings/progress/catalog before the app renders anything, but never awaited `SearchConfigService.loadConfig()` — that call only ever happened as a side effect of `gather.page.ts`'s own `ngOnInit`. Confirmed via an isolated repro: with `pokedexType` persisted as `costume` (whose live server config has `costumeGenderEnabled: false`), a **hard reload landing directly on `/search-strings`** (simulating a deep link, a refresh while sitting on that route, or a native relaunch that restores the last route instead of cold-starting at Gather) showed the Gender Search Strings section anyway — because `SearchConfigService`'s `_costumeGenderEnabled`/`_implicitlyExcludedSearchTerms` fields sat at their optimistic constructor defaults (`true`/`[]`) in that fresh JS context, since nothing had called `loadConfig()` yet.

Fixed by adding `firstValueFrom(searchConfigService.loadConfig())` to `main.ts`'s existing `Promise.all([...])`, alongside settings/progress/catalog — the same bootstrap-ordering guarantee those three already have. Re-verified via the same isolated repro: the hard-reload-direct-to-`/search-strings` case now correctly shows the section absent, matching the live server config.

### 2. Preset editor: 4 term kinds silently discarded their picked value

A significantly more serious, silent data-corruption bug in the preset-query editor, affecting **Pokemon Type, Move Type, Weak Against Type, and Super Effective Against Type** (all four share the `POKEMON_TYPES` enum list and `inputKind: 'enum'`). Root cause confirmed via a sequence of isolated repros (native `ion-select.value`/`ionChange` DOM inspection, then comparing against a working enum kind like Region):

- `applyTermValue()` and `toSearchTermData()` both routed these 4 kinds through the **free-text** branch (`editable.freeTextValue`) instead of the **enum** branch (`editable.enumValue`) — but the template's `@case ('enum')` widget for these kinds is bound to `enumValue`, not `freeTextValue`. Ionic's `ion-select` itself worked perfectly (native `.value` updated, `ionChange` fired with the correct picked value) — the picked value just landed in a component field nothing ever reads.
- Confirmed via `diff` against go-gather-next's original `preset-query-editor.component.ts`/`.html`: **this exact bug is pre-existing in the original PrimeNG app**, carried over verbatim during the port — not a migration regression. `search-term-catalog.ts` (shared, byte-identical apart from formatting) already declared these 4 kinds `inputKind: 'enum'` there too, and the original template bound the same dropdown to `enumValue`.
- A secondary, smaller issue in the same area: `defaultValueForCatalogEntry()` defaulted these 4 kinds' initial value to `''` instead of `catalogEntry.enumOptions?.[0] ?? ''` like every other enum kind (region/gender/size/raidOrigin) — inconsistent, though not itself the cause of the silent-discard (fixed alongside for consistency).

Fixed by moving `type`/`moveType`/`weakAgainst`/`superEffectiveAgainst` to the enum-reading case in both `applyTermValue()` and `toSearchTermData()`, and giving them the same `enumOptions?.[0] ?? ''` default as the other enum kinds. Added 4 regression tests (`preset-query-edit.page.spec.ts`) confirming each kind now defaults to a real, non-blank option and round-trips correctly through save. Re-verified via isolated browser repros: a Weak-Against-Fire + Move-Type-Water rule now compiles to `<fire` / `@water` (previously bare `<` / `@`), and — critically — **round-trips correctly through save and re-opening for edit** in a fresh browser context (confirming this wasn't just a preview-string fix but that saved presets themselves are now correct).

Both fixes: `npm run lint`/`test`/`build` all pass; the existing 26-test `preset-query-edit.page.spec.ts` suite (now 30 tests) and the rest of the suite are unaffected otherwise.

## What was verified, and how

**All 7 pokedex types** (`regular`/`mega`/`max`/`dmax`/`xxl`/`xxs`/`costume`): each renders a sane `(caught/total)` count; catching/uncatching in Regular dex leaves Mega dex's count at 0, and switching back to Regular reflects the same toggle state — confirming per-type progress isolation holds in the running app, not just as a data-model assumption. (Group 1 had only spot-checked `regular` and `mega`.)

**Filters in combination**: Shiny Only narrows the total, Region narrows further on top of it, Uncaught Only applies on top of both, and resetting all three returns to the exact baseline count. **Exclusion lists' actual effect on the grid** (not just their own add/remove/persist UI, which Group 3 already verified): an excluded name pattern (`^Mew$`) hides Mew but not Mewtwo; an excluded dex number (132) hides Ditto; an excluded shiny dex number (25, Pikachu) leaves Pikachu visible in the all-forms view but hides it specifically under Shiny Only — confirming the shiny-specific exclusion fields do what their Settings-page hint text describes, cross-checked against the actual grid for the first time.

**Search strings across pokedex types** (Group 4 only ever checked the default type): Regular shows both Gender and Alternate Region sections; Mega and Costume show neither (Costume's absence now correctly reflects the live `costumeGenderEnabled: false` config, per the bug fix above). Clipboard copy re-confirmed via a real `navigator.clipboard.readText()` check.

**Preset queries — full `inputKind` coverage**: a static diff of `defaultValueForCatalogEntry`/`applyTermValue`/`toSearchTermData` against go-gather-next's original (covering all ~26 kinds, not just the 8 Group 5 unit-tested) found the byte-identical `search-term-catalog.ts` port plus the one bug above (also pre-existing in the original). A representative preset was built and saved covering the previously-unexercised higher-risk kinds — Weak Against Type, Raid Origin, Move Type, Stat Appraisal Rating, a Numeric range, and a User Tag — compiling correctly to `<fire&raid,@water&3hp&cp100-200&#ParityTestTag` and rendering correctly on the list page (not the invalid-preset fallback).

**Cross-feature integration**: a User Tag added in Settings appeared selectable in the Preset Query editor's tag picker and round-tripped through save — the first end-to-end check spanning Settings → Preset Queries.

**Cross-page persistence**: `regionFilter=Kanto`, all four Settings exclusion entries, and a saved preset all survived a single combined reload together (prior groups only ever reload-tested one feature at a time).

**Known-issue re-confirmation** (not re-fixed): the Settings page's rapid-edit sync race, documented in `docs/progress/phase-5-settings-page.md`, was re-triggered (two chip adds under a second apart) — still the same known, already-documented Phase-4 architecture limitation, not something that's worsened. Left as-is per that doc's original scope call.

**Domain-services layer**: has no dedicated browser-facing surface of its own — it's exercised implicitly by every check above (catalog/progress/settings load paths all run through it on every page visited in this pass).

Zero console/page errors across every run of the walkthrough.

## Deferred

Nothing remains open in Phase 5. Phase 6 (Native iOS Shell) is next; its `npx cap add ios`/`capacitor.config.ts` box was already checked off ahead of schedule during the export/import task (see `docs/progress/phase-5-export-import.md`).
