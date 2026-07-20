import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { listChangedFiles, writeGithubOutput } from './release-diff.mjs';

export function matchesServerImagePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    return false;
  }

  const normalized = filePath.replace(/\\/g, '/');

  return normalized.startsWith('server/') || normalized.startsWith('shared/');
}

export function evaluateServerImageDeploy({
  changedFiles = [],
  hasPreviousTag = true,
  force = false,
} = {}) {
  if (force) {
    return { shouldPublish: true, matchedPaths: ['force'], changedFiles };
  }

  if (!hasPreviousTag) {
    return { shouldPublish: true, matchedPaths: ['no-previous-tag'], changedFiles };
  }

  const matchedPaths = changedFiles
    .filter(matchesServerImagePath)
    .map((filePath) => filePath.replace(/\\/g, '/'));

  return matchedPaths.length > 0
    ? { shouldPublish: true, matchedPaths, changedFiles }
    : { shouldPublish: false, matchedPaths: [], changedFiles };
}

export function parseServerImageShouldDeployArgs(argv) {
  const args = { base: null, head: 'HEAD', githubOutput: null, force: false };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--base') {
      args.base = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (value === '--head') {
      args.head = argv[index + 1] ?? 'HEAD';
      index += 1;
      continue;
    }

    if (value === '--github-output') {
      args.githubOutput = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (value === '--force') {
      args.force = true;
    }
  }

  return args;
}

export function resolveServerImageDeployDecision({
  base,
  head,
  execFileSyncFn = execFileSync,
  cwd = process.cwd(),
  changedFiles = null,
  force = false,
} = {}) {
  if (force) {
    return evaluateServerImageDeploy({ changedFiles: changedFiles ?? [], force: true });
  }

  const hasPreviousTag = typeof base === 'string' && base.trim().length > 0;
  const resolvedChangedFiles =
    changedFiles ??
    listChangedFiles({ base: hasPreviousTag ? base : null, head, execFileSyncFn, cwd });

  return evaluateServerImageDeploy({ changedFiles: resolvedChangedFiles, hasPreviousTag });
}

function main() {
  const args = parseServerImageShouldDeployArgs(process.argv.slice(2));

  try {
    const decision = resolveServerImageDeployDecision({
      base: args.base,
      head: args.head,
      force: args.force,
    });

    console.log(`[server-image-should-deploy] should_publish=${decision.shouldPublish}`);
    console.log(`[server-image-should-deploy] changed_files=${decision.changedFiles.length}`);

    if (decision.matchedPaths.length > 0) {
      console.log(`[server-image-should-deploy] matched_paths=${decision.matchedPaths.join(',')}`);
    }

    if (args.githubOutput) {
      writeGithubOutput(args.githubOutput, {
        should_publish: String(decision.shouldPublish),
        matched_paths: decision.matchedPaths.join(','),
      });
    }
  } catch (error) {
    console.error(`[server-image-should-deploy] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  main();
}
