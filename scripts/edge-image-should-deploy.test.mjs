import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateEdgeImageDeploy,
  matchesEdgeImagePath,
  parseEdgeImageShouldDeployArgs,
} from './edge-image-should-deploy.mjs';

test('matchesEdgeImagePath matches edge/web build trees and manifests only', () => {
  assert.equal(matchesEdgeImagePath('edge/Caddyfile'), true);
  assert.equal(matchesEdgeImagePath('src/app/foo.ts'), true);
  assert.equal(matchesEdgeImagePath('shared/src/models.ts'), true);
  assert.equal(matchesEdgeImagePath('config/ios-live-update-public.pem'), true);
  assert.equal(matchesEdgeImagePath('scripts/write-environment-ios.mjs'), true);
  assert.equal(matchesEdgeImagePath('angular.json'), true);
  assert.equal(matchesEdgeImagePath('package.json'), true);
  assert.equal(matchesEdgeImagePath('server/src/api.ts'), false);
  assert.equal(matchesEdgeImagePath('ios/App/AppDelegate.swift'), false);
});

test('evaluateEdgeImageDeploy publishes for edge/src/shared changes', () => {
  const decision = evaluateEdgeImageDeploy({
    changedFiles: ['edge/Caddyfile', 'server/src/api.ts'],
    hasPreviousTag: true,
  });

  assert.equal(decision.shouldPublish, true);
  assert.deepEqual(decision.matchedPaths, ['edge/Caddyfile']);
});

test('evaluateEdgeImageDeploy skips server-only changes', () => {
  const decision = evaluateEdgeImageDeploy({
    changedFiles: ['server/src/api.ts', 'ios/App/AppDelegate.swift'],
    hasPreviousTag: true,
  });

  assert.equal(decision.shouldPublish, false);
  assert.deepEqual(decision.matchedPaths, []);
});

test('evaluateEdgeImageDeploy publishes unconditionally when forced', () => {
  const decision = evaluateEdgeImageDeploy({ changedFiles: ['server/src/api.ts'], force: true });
  assert.equal(decision.shouldPublish, true);
  assert.deepEqual(decision.matchedPaths, ['force']);
});

test('evaluateEdgeImageDeploy publishes unconditionally when no previous tag exists', () => {
  const decision = evaluateEdgeImageDeploy({
    changedFiles: ['server/src/api.ts'],
    hasPreviousTag: false,
  });
  assert.equal(decision.shouldPublish, true);
  assert.deepEqual(decision.matchedPaths, ['no-previous-tag']);
});

test('parseEdgeImageShouldDeployArgs parses all flags', () => {
  assert.deepEqual(
    parseEdgeImageShouldDeployArgs([
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

test('parseEdgeImageShouldDeployArgs defaults when no flags given', () => {
  assert.deepEqual(parseEdgeImageShouldDeployArgs([]), {
    base: null,
    head: 'HEAD',
    githubOutput: null,
    force: false,
  });
});
