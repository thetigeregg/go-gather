#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import {
  createWorktreeContext,
  ensureDependenciesInstalled,
  loadDevxConfig,
} from '@thetigeregg/dev-cli';

const cwd = process.cwd();
const config = await loadDevxConfig({ cwd });
const context = await createWorktreeContext({ cwd, config });

export async function bootstrapWorktree() {
  ensureDependenciesInstalled(context);
}

export async function runWorktreeDev([command] = []) {
  if (command === 'bootstrap') {
    await bootstrapWorktree();
    return;
  }

  console.error(`Unknown worktree command: ${command}`);
  process.exitCode = 1;
}

function isEntrypoint() {
  return pathToFileURL(process.argv[1] ?? '').href === import.meta.url;
}

if (isEntrypoint()) {
  await runWorktreeDev(process.argv.slice(2));
}
