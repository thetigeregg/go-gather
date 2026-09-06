import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { listChangedFiles, writeGithubOutput } from './release-diff.mjs';

const EDGE_IMAGE_PATH_PREFIXES = ['edge/', 'src/', 'shared/', 'config/', 'scripts/'];

const EDGE_IMAGE_ROOT_FILES = new Set([
  'package.json',
  'package-lock.json',
  'angular.json',
  'ionic.config.json',
  'capacitor.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.spec.json',
]);

export function matchesEdgeImagePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    return false;
  }

  const normalized = filePath.replace(/\\/g, '/');

  return (
    EDGE_IMAGE_ROOT_FILES.has(normalized) ||
    EDGE_IMAGE_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

export function evaluateEdgeImageDeploy({
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
    .filter(matchesEdgeImagePath)
    .map((filePath) => filePath.replace(/\\/g, '/'));

  return matchedPaths.length > 0
    ? { shouldPublish: true, matchedPaths, changedFiles }
    : { shouldPublish: false, matchedPaths: [], changedFiles };
}

export function parseEdgeImageShouldDeployArgs(argv) {
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

export function resolveEdgeImageDeployDecision({
  base,
  head,
  execFileSyncFn = execFileSync,
  cwd = process.cwd(),
  changedFiles = null,
  force = false,
} = {}) {
  if (force) {
    return evaluateEdgeImageDeploy({ changedFiles: changedFiles ?? [], force: true });
  }

  const hasPreviousTag = typeof base === 'string' && base.trim().length > 0;
  const resolvedChangedFiles =
    changedFiles ??
    listChangedFiles({ base: hasPreviousTag ? base : null, head, execFileSyncFn, cwd });

  return evaluateEdgeImageDeploy({ changedFiles: resolvedChangedFiles, hasPreviousTag });
}

function main() {
  const args = parseEdgeImageShouldDeployArgs(process.argv.slice(2));

  try {
    const decision = resolveEdgeImageDeployDecision({
      base: args.base,
      head: args.head,
      force: args.force,
    });

    console.log(`[edge-image-should-deploy] should_publish=${decision.shouldPublish}`);
    console.log(`[edge-image-should-deploy] changed_files=${decision.changedFiles.length}`);

    if (decision.matchedPaths.length > 0) {
      console.log(`[edge-image-should-deploy] matched_paths=${decision.matchedPaths.join(',')}`);
    }

    if (args.githubOutput) {
      writeGithubOutput(args.githubOutput, {
        should_publish: String(decision.shouldPublish),
        matched_paths: decision.matchedPaths.join(','),
      });
    }
  } catch (error) {
    console.error(`[edge-image-should-deploy] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  main();
}
