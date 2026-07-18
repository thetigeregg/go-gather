# Phase 5 — Group 2: Side Menu / Filters

Status: complete. `npm run lint`, `npm run test` (23 files, 171 tests), and `npm run build` all pass. Manually verified end-to-end in a real browser: menu opens via the toolbar's `ion-menu-button`, switching Pokedex type/shiny filter/region filter/toggles re-filters the gather grid live (confirmed switching to "Mega Pokedex" drops the header count to `0/114` and renders 54 species cards), and both the selected filters and the accordion open/closed UI state persist across a full page reload.

## What changed

- New `src/app/features/side-menu/side-menu.component.{ts,html,scss}` — ports go-gather-next's `SideMenuComponent` almost unchanged in logic (label maps, `refresh()`/`updateSettings()`/`toggleSetting()`), re-pointed at Ionic widgets.
- `AppComponent` gained `<app-side-menu>` + `<ion-router-outlet id="main-content">` (was previously a bare outlet) — the menu lives at the app root per the standard Ionic pattern, not per-page, so any future page automatically has it available.
- `gather.page.html`'s toolbar gained `<ion-buttons slot="end"><ion-menu-button></ion-menu-button></ion-buttons>` — Ionic's built-in auto-toggle, no manual `MenuController` wiring needed.
- No changes needed to `gather.page.ts`'s filtering logic at all — it already reacted to `UserDataService.listenForUserSettingsChanges()` from Group 1, so the side menu just needed to call `updateUserSettings()`.

## Widget mapping (PrimeNG → Ionic)

- `p-accordion`/`p-accordionTab` → `ion-accordion-group [multiple]="true"` / `ion-accordion`, with stable string `value`s (`'pokedexType'`, `'shinyFilter'`, `'regionFilter'`, `'options'`, `'utilities'`) replacing PrimeNG's numeric `activeIndex` array.
- The three single-select lists (Pokedex type / shiny filter / region filter), originally a manual `<button>`+check/circle-icon list — upgraded to `ion-radio-group` + `ion-item`/`ion-radio` per section. Functionally identical (exactly one active value), more idiomatic and accessible.
- The four boolean options, originally manual check/times-icon buttons — became `ion-toggle` per `ion-item`.
- "Utilities" (Search Strings, Preset Queries) and the standalone "Settings" button, originally dialog-open booleans (`showSearchStringsDialog` etc.) — collapsed into plain `ion-item routerLink` navigation, since go-gather already converted those three PrimeNG dialogs into routed pages back in Phase 1. Simpler than the original by construction, not a scope reduction.

## Scope call: `IonMenu` only, no `IonSplitPane`

`SCREEN-AND-FEATURE-MAP.md` calls for `IonMenu` specifically. game-shelf's equivalent (`game-filters-menu`) supports a dual `presentation: 'menu' | 'split'` mode with `IonSplitPane` for a persistent desktop panel — not built here, since the map doesn't ask for it and go-gather is currently a single-tab, mobile-first app. Can be added later if a desktop-web layout becomes a real target; the existing `SideMenuComponent` would need to grow a `presentation` input matching game-shelf's pattern to support it, but nothing here forecloses that.

## `sidebarAccordionState` → `PreferenceStorageService`

Go-gather-next persisted accordion open/closed state via a raw `localStorage.getItem/setItem` call, explicitly kept out of `UserSettings` as UI chrome rather than a filter. Ported to the already-existing `PreferenceStorageService` (`core/storage/preference-storage.service.ts`, a thin async wrapper over `@capacitor/preferences` built in an earlier phase but not yet used by anything) — same key name (`sidebarAccordionState`), same "not a filter, don't persist through `UserSettings`" reasoning, now async (loaded in `ngOnInit` rather than the constructor, since `PreferenceStorageService.getItem()` returns a `Promise`, unlike synchronous `localStorage`). Malformed/missing persisted state falls back to an empty (`[]`, all-collapsed) array rather than throwing.

## Tests

`side-menu.component.spec.ts`: `useValue` fakes for `UserDataService` and `PreferenceStorageService` (in-memory `Map`), matching the pattern established across earlier services/components. Covers: header/toggle labels reflect current settings, accordion state loads on init (present, absent, and malformed-JSON cases), `onAccordionChange` normalizes single/array/`undefined` inputs and persists them, each of the three radio-group change handlers updates the right `UserSettings` field, and a toggle's `command()` flips its boolean.

`app.component.spec.ts` needed two additions once `AppComponent` started importing `SideMenuComponent`: fake providers for `UserDataService`/`PreferenceStorageService` (since `SideMenuComponent`'s constructor-time dependency graph now resolves during `AppComponent`'s test setup), and an explicit `TestBed.overrideComponent(SideMenuComponent, { set: { template: '<div></div>', styleUrl: undefined } })` before `compileComponents()` — same "override every transitively-imported real-templateUrl component" lesson learned in Group 1 (a component merely being present in an ancestor's `imports` array is enough to trigger Angular's DI provider-tree walk into its real, unresolved template during tests).

## Deferred

Groups 3-5 (settings, search strings, preset queries pages) remain, unaffected by anything here — the side menu already links to their (still-stub) routes.
