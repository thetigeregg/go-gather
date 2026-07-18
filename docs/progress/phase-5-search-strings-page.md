# Phase 5 — Group 4: Search Strings Page

Status: complete. `npm run lint`, `npm run test` (27 files, 192 tests), and `npm run build` all pass. Manually verified end-to-end in a real browser: all 4 sections (Default, Shiny, Alternate Region, Gender) render in the correct order for the Regular pokedex (14 total rows: 2 + 8 alt-region + 4 gender), Show/Hide toggles the raw string, and Copy actually writes to the OS clipboard (confirmed via `navigator.clipboard.readText()` matching the row's value exactly) with a "Copied!" toast.

## What changed

- New `src/app/core/utils/general.util.ts` — verbatim port of `GeneralUtil.capitalizeFirstLetter`, used only for alt-region row labels (`"alola"` → `"Alola"`).
- New `src/app/features/search-string/search-string.component.{ts,html,scss}` — single row: label, Copy button, Show/Hide toggle revealing a readonly `ion-textarea` of the raw string.
- New `src/app/features/multi-search-string/multi-search-string.component.{ts,html,scss}` — group wrapper: bold header + `@for` over rows with a plain `<hr>` divider between them (not after the last), matching Group 1's established divider pattern.
- `search-strings.page.ts`/`.html` replace the stub with `createConfigs()` ported from `SearchStringsDialogComponent` — same 4 fields (`defaultConfig`, `shinyConfig`, `genderConfigs`, `altRegionConfigs`), same `DEFAULT_LABELS`/`SHINY_LABELS` records keyed by `PokedexType`, same gating rules (gender rows only for `regular` or `costume && costumeGenderEnabled`; alt-region rows only for `regular`), same render order (Default, Shiny, Alternate Region, Gender). Ported the original's documented quirk as-is: once a section's gate passes, its field is assigned an array (possibly empty) rather than `null`, so in principle a section header could render with nothing under it — not "fixed," since that's the original's actual behavior.
- **New dependency**: `@capacitor/clipboard` (`^8.0.1`, matching the other installed Capacitor plugins' major version) — no equivalent existed in game-shelf or go-gather to reuse; confirmed via research that neither app had any prior clipboard-copy pattern.

## Clipboard: `@capacitor/clipboard`, not CDK

The original used `@angular/cdk/clipboard`'s `[cdkCopyToClipboard]` directive. Per `SCREEN-AND-FEATURE-MAP.md`'s own suggested mapping and the project's established pattern (Capacitor plugins with automatic web fallback, same as `PreferenceStorageService`/`@capacitor/preferences`), used `Clipboard.write({ string })` instead. Toast feedback moved from PrimeNG's `MessageService` to Ionic's `ToastController` (`message: 'Copied!', duration: 1000, position: 'middle'` — same 1-second auto-dismiss and center positioning as the original).

## Simplification: per-row show/hide is a plain boolean, not `ion-accordion`

The original wrapped the raw-string reveal in a collapsed-by-default `p-accordion` per row. Since each row needs fully independent expand state (not "one open at a time" coordination), this was simplified to a local `expanded` boolean toggled by an `ion-button`, with an `@if` block revealing the `ion-textarea` — same visible behavior (button label flips "Show search string" / "Hide search string"), without nesting an `ion-accordion-group` per row for no coordination benefit.

## Tests

`search-string.component.spec.ts`: expand/collapse toggle, and `copy()` calling `Clipboard.write` with the row's value + presenting a toast (both `@capacitor/clipboard` and `ToastController` mocked).

`multi-search-string.component.spec.ts`: minimal — this component has zero class-level logic (pure `@Input` pass-through to its own template), so the spec only confirms it accepts inputs and constructs without throwing; the actual per-row/divider rendering was confirmed visually in manual browser verification instead, since Angular's Vitest harness can't resolve real `templateUrl`s (established limitation from Group 1).

`search-strings.page.spec.ts`: replaced the trivial stub — covers the full `createConfigs()` gating matrix (regular vs. mega vs. costume pokedexType, `costumeGenderEnabled` on/off), label selection from the two `PokedexType`-keyed records, and the alt-region default+shiny merge producing two distinctly-labeled rows per region rather than one overwriting the other.

## Deferred

Group 5 (preset queries — the highest-complexity item, ~26 term-kind rule builder) remains, the last group in the plan.
