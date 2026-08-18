#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import {
  createWorktreeContext,
  ensureDependenciesInstalled,
  loadDevxConfig,
} from '@thetigeregg/dev-cli';

async function buildContext(cwd) {
  const config = await loadDevxConfig({ cwd });
  return createWorktreeContext({ cwd, config });
}

export async function bootstrapWorktree({ cwd = process.cwd() } = {}) {
  const context = await buildContext(cwd);
  ensureDependenciesInstalled(context);
}

export async function runWorktreeDev([command] = []) {
  if (command === 'bootstrap') {
    await bootstrapWorktree({ cwd: process.cwd() });
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
