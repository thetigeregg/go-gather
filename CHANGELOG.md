# Changelog

## v0.1.0 - 2026-07-20

- 4afaf3b refactor(preset-queries): implement copy functionality with toast notification for clipboard actions
- cac169b refactor(toasts): update toast position to 'bottom' for consistency across components
- 2815933 refactor(preset-queries): update rule item classes for better styling and organization
- 99b9228 refactor(preset-queries): enhance UI with save button and improve layout for better usability
- 298888c refactor(preset-queries): enhance UI with ion-cards and accordions for better organization
- cbffedf refactor(search-strings): update card titles and configurations for clarity
- 8989f5b refactor(search-strings): restructure into ion-cards with accordions
- d200613 fix(chip-list-input): update close icon to close-circle for better visual consistency
- 72076ee style(chip-list-input): adjust padding for ion-item and chip list
- f7fdf9d style(settings): tighten spacing, add icons to data buttons
- 6936de3 refactor(settings): restructure settings items as ion-cards
- 1f1c0b1 feat(gather): add fab to focus header search
- 902358f feat(gather): add searchbar toolbar to filter pokemon by name
- b83828e fix(side-menu): target end menu for filter panel done button
- 7a76faf feat(gather): show selected pokedex in header, add filter menu done button
- 22d93fe feat(settings): add export and import functionality for user progress and settings
- 1b185d7 style(theme): update primary color variables for improved theme consistency
- 5fd19d4 fix(nav-menu): wrap menu items in ion-menu-toggle for better functionality
- 142cd1a fix(nav-menu): update icon imports and reorder menu items
- 0ab9a28 refactor(ui): split side menu into filters and nav menus
- f8db27c style(gather): adjust margins for gather poke card and add padding to poke group list
- 4f7b0d6 style(gather): tighten card header vertical padding
- df9977d style(gather): move card divider from subtitle to list top border
- 16cabd1 style(gather): use default card subtitle for pokemon header
- 148307b style(gather): color and shrink entry catch icon by state
- da14754 fix(gather): refresh catalog after sync and lazy-render accordion content
- 517b8ac fix: update design
- e1df5b9 feat(theme): override primary color and apply to page header
- 1990c36 feat(gather): float generation counter to header end slot
- 1b9f709 fix(gather): remove padding on page content
- 3b99708 fix(gather): remove padding on accordion group content
- dec828a feat(ios): add angular.json build configs and env-file layering
- dbb34eb fix(ios): enable CapacitorHttp for native networking, add device signing
- 45fa045 fix(server): change API host to 0.0.0.0 for external access
- f603871 feat(ios): add dual dev/prod Xcode targets with signing scaffolding
- 9715af5 feat(storage): add SqliteStorageEngine and ImageFileStore for iOS
- 7b8609a fix(bootstrap): load search config before first render
- 04e0013 feat(gather): rebuild export/import via capacitor plugins
- 86d6849 feat(preset-queries): rebuild preset query builder as routed pages
- dcc16a6 feat(search-strings): rebuild search strings page with clipboard copy
- 66ae9cd feat(menu): rebuild side menu as Ionic filter drawer
- f3cbf47 feat(menu): rebuild side menu as Ionic filter drawer
- 25d7579 feat(gather): rebuild catalog grid on Ionic, fix bootstrap CD gap
- 29ec775 feat(services): port domain services onto StorageEngine
- b8a6947 feat(sync): add outbox-based local-first sync
- 7635214 feat(search-engine): port search query engine with full test coverage
- 6d8fa06 feat(storage): add StorageEngine abstraction with Dexie web engine
- 5b78729 feat(app): scaffold routed page structure for Phase 1
- 1307d4a fix(devx): restore hook perms and repo scope after template sync
- 998aa84 feat(tests): refactor component tests to use TestBed.overrideComponent for template handling
- 498dcab Initial commit

## v0.1.1 - 2026-07-20

- 2eebdc7 refactor(config): update packageDirs comment
- 196554e refactor(devx.config): add packageDirs to configuration for improved project structure
- 8aca780 chore(dependencies): update zone.js and various devDependencies for improved compatibility
- 5ad7ef1 refactor(ncu-config): enhance Angular package detection to include '@angular-devkit/'
- 42a777b refactor(ncu-config): enhance Angular package filtering and update dependencies

## v0.1.2 - 2026-07-20

- 77ee494 chore: update dependencies for fastify and related packages
- 93daa3f refactor(package.json): remove unused deps:check:workspaces script

## v0.1.3 - 2026-07-20

- b11beaf chore: add CodeQL configuration to exclude false positives for missing rate limiting
- 4cd6772 chore(devx): drop manual workspace ncu workaround, use devx v5 native support
- 8ba16ef chore: update @thetigeregg packages to latest versions
- 4a88951 chore(nvm): update Node.js version to 24.15.0
- 56271fb ci(ios): add Fastlane + TestFlight CI scaffolding for phase 8

## v0.1.4 - 2026-07-20

- 8cfadbe chore: add step to select specific Xcode version in TestFlight workflow

## v0.2.0 - 2026-07-20

- 83dd25c ci: add codecov, docker build/dependabot coverage, iOS build validation
- 964360a feat(ios): add OTA live-update mechanism and CI pipeline
- 658b5f4 ci(ios): add Fastlane + TestFlight CI pipeline for phase 8

## v0.3.0 - 2026-07-20

- 738ee08 chore: update @typescript-eslint packages to version 8.65.0
- 845660c chore(ci): bump actions/setup-node from 6 to 7
- 227e2c4 feat(images): cache sprites for offline use and add long-lived HTTP cache header

## v0.3.1 - 2026-07-20

- 45f234a chore(docker): bump node from 24.14.0-slim to 24.18.0-slim in /server

## v0.3.2 - 2026-07-21

- 77d2893 docs: refine NAS deployment instructions for clarity and consistency
- 7013d22 docs: add README, NAS deployment guide, and docker-compose for go-gather

## v0.3.3 - 2026-07-21

- 464337b fix: ensure LiveUpdateService does not block app bootstrap during OTA checks

## v0.3.4 - 2026-07-21

- 3864aec fix: add production environment to validate iOS signing key and publish server image jobs

## v0.3.5 - 2026-07-21

- f1aa387 test(settings): add temporary OTA live-update end-to-end test marker
- b891a54 fix: update migration checklist to confirm full unit test coverage for search-engine
- 87f30ce fix: confirm TestFlight build installs correctly on real device and address related bugs

## v0.3.6 - 2026-07-21

- 78abcbc test(settings): remove OTA live-update test marker

## v0.4.0 - 2026-07-21

- db986c0 feat(ios): give App DEV and App PROD distinct home-screen icons
- c5fd093 fix: update migration checklist and confirm end-to-end OTA live-update functionality on real device
