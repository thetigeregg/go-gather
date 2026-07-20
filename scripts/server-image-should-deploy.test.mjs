import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateServerImageDeploy,
  matchesServerImagePath,
  parseServerImageShouldDeployArgs,
} from './server-image-should-deploy.mjs';

test('matchesServerImagePath matches server and shared trees only', () => {
  assert.equal(matchesServerImagePath('server/src/api.ts'), true);
  assert.equal(matchesServerImagePath('shared/src/models.ts'), true);
  assert.equal(matchesServerImagePath('src/app/foo.ts'), false);
  assert.equal(matchesServerImagePath('ios/App/AppDelegate.swift'), false);
  assert.equal(matchesServerImagePath('package.json'), false);
});

test('evaluateServerImageDeploy publishes for server/shared changes', () => {
  const decision = evaluateServerImageDeploy({
    changedFiles: ['server/src/api.ts', 'src/app/foo.ts'],
    hasPreviousTag: true,
  });

  assert.equal(decision.shouldPublish, true);
  assert.deepEqual(decision.matchedPaths, ['server/src/api.ts']);
});

test('evaluateServerImageDeploy skips src-only changes', () => {
  const decision = evaluateServerImageDeploy({
    changedFiles: ['src/app/foo.ts', 'package.json'],
    hasPreviousTag: true,
  });

  assert.equal(decision.shouldPublish, false);
  assert.deepEqual(decision.matchedPaths, []);
});

test('evaluateServerImageDeploy publishes unconditionally when forced', () => {
  const decision = evaluateServerImageDeploy({ changedFiles: ['src/app/foo.ts'], force: true });
  assert.equal(decision.shouldPublish, true);
  assert.deepEqual(decision.matchedPaths, ['force']);
});

test('evaluateServerImageDeploy publishes unconditionally when no previous tag exists', () => {
  const decision = evaluateServerImageDeploy({
    changedFiles: ['src/app/foo.ts'],
    hasPreviousTag: false,
  });
  assert.equal(decision.shouldPublish, true);
  assert.deepEqual(decision.matchedPaths, ['no-previous-tag']);
});

test('parseServerImageShouldDeployArgs parses all flags', () => {
  assert.deepEqual(
    parseServerImageShouldDeployArgs([
      '--base',
      'v1.0.0',
      '--head',
      'v1.1.0',
      '--github-output',
      '/tmp/out',
      '--force',
    ]),
    { base: 'v1.0.0', head: 'v1.1.0', githubOutput: '/tmp/out', force: true }
  );
});

test('parseServerImageShouldDeployArgs defaults when no flags given', () => {
  assert.deepEqual(parseServerImageShouldDeployArgs([]), {
    base: null,
    head: 'HEAD',
    githubOutput: null,
    force: false,
  });
});
