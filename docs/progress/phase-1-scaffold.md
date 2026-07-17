# Phase 1 — Scaffold & Structure: progress notes

Status: complete. `npm run lint`, `npm run test` (6/6 passing), and `npm run build -- --configuration production` all pass. Manually verified via `ng serve`: `/`, `/tabs/gather`, `/settings`, `/search-strings`, `/preset-queries` all return HTTP 200 and build as separate lazy chunks (`tabs-routes`, `gather-page`, `settings-page`, `search-strings-page`, `preset-queries-page`).

## What changed

- Removed the stock `ionic start` tabs template's placeholder content entirely: `tab1/`, `tab2/`, `tab3/`, `explore-container/`.
- `tabs/` restructured to a single `gather` child (was `tab1`/`tab2`/`tab3`); tab icon changed from the demo `triangle` to `apps`.
- New stub pages: `gather/`, `settings/`, `search-strings/`, `preset-queries/` — each a minimal `IonHeader`/`IonToolbar`/`IonTitle`/`IonContent` shell with a one-line placeholder and a back/forward nav button. No real logic — that's Phase 5 ("Services & UI Rebuild") per [`SCREEN-AND-FEATURE-MAP.md`](../../../go-gather-next/docs/migration/SCREEN-AND-FEATURE-MAP.md).
- `app.routes.ts`: `tabs` (loadChildren, unchanged indirection to `tabs.routes.ts`) plus sibling top-level routes for `settings`, `search-strings`, `preset-queries`. No redundant top-level `''` redirect was added — `tabs.routes.ts` already redirects empty path to `/tabs/gather` at both its nested and top levels, so app.routes.ts's own `path: ''` (loadChildren) entry already covers it; an extra `{ path: '', redirectTo: ... }` after it would have been unreachable dead code.
- `main.ts`: `provideIonicAngular({ mode: 'ios' })` (was called with no options) and `provideHttpClient(withInterceptorsFromDi())` added, both per `ARCHITECTURE-TARGET.md`'s bootstrap example. `RouteReuseStrategy`/`IonicRouteStrategy` provider left unchanged.

## Scope decisions

- **`core/` subfolders not created**: `core/{data,services,search-engine,models,storage,utils}` from the target folder structure stay unscaffolded. They get created in Phase 2 (domain model/storage) and Phase 3 (search-engine) when their first real files actually land — creating empty directories now would just be inert noise (git doesn't track empty dirs anyway).
- **`HttpClient` added ahead of the literal checklist wording**: `go-gather-next`'s Phase 0 checklist item only says "configure `provideIonicAngular`/`provideRouter`," but `ARCHITECTURE-TARGET.md`'s full bootstrap example includes `provideHttpClient(withInterceptorsFromDi())` in the same block, and since the catalog is fetched (not bundled) with a live backend kept, this is needed soon regardless — added now to avoid a near-term revisit.
- **`preset-queries/:id/edit` sub-route not scaffolded**: the nested editor route from `ARCHITECTURE-TARGET.md` is deferred to Phase 5 when `PresetQueryEditorComponent` (flagged high-complexity in `SCREEN-AND-FEATURE-MAP.md`) is actually built.
- **Temporary nav on the `gather` stub page**: three buttons linking to `/settings`, `/search-strings`, `/preset-queries`, used only to manually verify routing works. These get removed in Phase 5 when the real `IonMenu`-based side nav (replacing `SideMenuComponent`) is built.

## Doc fixes made alongside this phase

`ARCHITECTURE-TARGET.md`'s folder-structure block had a dangling reference — it said the tabs-shell-vs-flat-route question was "see OPEN-DECISIONS.md," but no such row existed there. Asked you directly (resolved: keep the `IonTabs` shell even with one tab, matching game-shelf's convention); added the row to `OPEN-DECISIONS.md`'s Architecture table and updated the `ARCHITECTURE-TARGET.md` pointer so it no longer dangles.
