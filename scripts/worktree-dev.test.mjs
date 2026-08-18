import assert from 'node:assert/strict';
import test from 'node:test';

import { bootstrapWorktree, runWorktreeDev } from './worktree-dev.mjs';

test('bootstrapWorktree resolves the config/context from the explicit cwd, not process.cwd()', async () => {
  const wrongCwd = '/nonexistent/not-a-repo';
  const originalCwd = process.cwd();

  await assert.rejects(() => bootstrapWorktree({ cwd: wrongCwd }));

  assert.equal(process.cwd(), originalCwd, 'must not mutate the process cwd');
});

test('bootstrapWorktree succeeds when pointed at the real repo root', async () => {
  await assert.doesNotReject(() => bootstrapWorktree({ cwd: process.cwd() }));
});

test('runWorktreeDev reports an error and sets exitCode for an unknown command', async () => {
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  await runWorktreeDev(['not-a-real-command']);

  assert.equal(process.exitCode, 1);
  process.exitCode = originalExitCode;
});
