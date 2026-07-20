export default {
  projectName: 'go-gather',
  // packageDirs deliberately left at its default (['.'], root only) — unlike
  // game-shelf's standalone sibling projects (server/worker/scrapers, none
  // of them npm workspaces), go-gather's `server`/`shared` are real npm
  // workspace members. `devx deps ncu-all`'s per-directory `npm --prefix
  // <dir> install` step doesn't understand workspace-linked local packages:
  // running it against `server` fails trying to fetch `@go-gather/shared`
  // from the npm registry (404 — it's not a published package, just a
  // workspace symlink). Use `npm run deps:update:workspaces` instead, which
  // uses npm-check-updates' own native `--workspaces` support (checks
  // root+server+shared in one correctly-linked pass) followed by a single
  // root-level `npm install`.
  editor: {
    command: 'code',
    args: ['--profile', 'Ionic'],
  },
  branchPrefix: 'feat/',
  baseBranch: 'main',
  pr: {
    baseRef: 'origin/main',
    prepOutputFile: 'prompts/pr-prep-prompt.md',
    feedbackOutputFile: 'prompts/pr-feedback-prompt.md',
    verifyCommands: ['npm run lint', 'npm run test', 'npm run build'],
  },
};
