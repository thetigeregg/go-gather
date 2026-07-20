import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateIosLiveUpdateDeploy,
  matchesOtaRelevantPath,
  nativeShellChangedFromFiles,
  parseIosLiveUpdateShouldDeployArgs,
} from './ios-live-update-should-deploy.mjs';

test('matchesOtaRelevantPath matches src tree and exact OTA-relevant files', () => {
  assert.equal(matchesOtaRelevantPath('src/app/foo.ts'), true);
  assert.equal(matchesOtaRelevantPath('scripts/build-ios-live-update-artifacts.mjs'), true);
  assert.equal(matchesOtaRelevantPath('config/ios-live-update-public.pem'), true);
  assert.equal(matchesOtaRelevantPath('server/foo.ts'), false);
  assert.equal(matchesOtaRelevantPath('ios/App/AppDelegate.swift'), false);
  assert.equal(matchesOtaRelevantPath('package.json'), false);
});

test('evaluateIosLiveUpdateDeploy publishes for src-only changes', () => {
  const decision = evaluateIosLiveUpdateDeploy({
    changedFiles: ['src/app/foo.ts', 'package.json'],
    hasPreviousTag: true,
    nativeShellChanged: false,
  });

  assert.equal(decision.shouldDeploy, true);
  assert.deepEqual(decision.matchedPaths, ['src/app/foo.ts']);
});

test('evaluateIosLiveUpdateDeploy skips when native shell changed on same tag', () => {
  const decision = evaluateIosLiveUpdateDeploy({
    changedFiles: ['src/app/foo.ts', 'ios/App/AppDelegate.swift'],
    hasPreviousTag: true,
    nativeShellChanged: true,
  });

  assert.equal(decision.shouldDeploy, false);
  assert.match(decision.skippedReason, /TestFlight/i);
});

test('evaluateIosLiveUpdateDeploy skips backend-only changes', () => {
  const decision = evaluateIosLiveUpdateDeploy({
    changedFiles: ['server/foo.ts'],
    hasPreviousTag: true,
    nativeShellChanged: false,
  });

  assert.equal(decision.shouldDeploy, false);
});

test('nativeShellChangedFromFiles detects ios tree changes', () => {
  assert.equal(nativeShellChangedFromFiles(['src/app/foo.ts']), false);
  assert.equal(nativeShellChangedFromFiles(['ios/App/AppDelegate.swift']), true);
});

test('evaluateIosLiveUpdateDeploy publishes for root web dependency bumps', () => {
  const angularDiff = `
--- a/package.json
+++ b/package.json
@@
-    "@angular/core": "21.2.15",
+    "@angular/core": "21.2.16",
`;

  const decision = evaluateIosLiveUpdateDeploy({
    changedFiles: ['package.json', 'package-lock.json'],
    manifestDiff: angularDiff,
    hasPreviousTag: true,
    nativeShellChanged: false,
  });

  assert.equal(decision.shouldDeploy, true);
  assert.ok(decision.matchedPaths.includes('package.json'));
});

test('evaluateIosLiveUpdateDeploy skips version-only manifest bumps', () => {
  const versionOnlyDiff = `
--- a/package.json
+++ b/package.json
@@
-  "version": "1.0.0",
+  "version": "1.1.0",
`;

  const decision = evaluateIosLiveUpdateDeploy({
    changedFiles: ['package.json', 'package-lock.json', 'CHANGELOG.md'],
    manifestDiff: versionOnlyDiff,
    hasPreviousTag: true,
    nativeShellChanged: false,
  });

  assert.equal(decision.shouldDeploy, false);
});

test('evaluateIosLiveUpdateDeploy skips web dep bump when native shell changed on same tag', () => {
  const angularDiff = `
--- a/package.json
+++ b/package.json
@@
-    "@angular/core": "21.2.15",
+    "@angular/core": "21.2.16",
`;

  const decision = evaluateIosLiveUpdateDeploy({
    changedFiles: ['package.json', 'package-lock.json', 'src/app/foo.ts'],
    manifestDiff: angularDiff,
    hasPreviousTag: true,
    nativeShellChanged: true,
  });

  assert.equal(decision.shouldDeploy, false);
  assert.match(decision.skippedReason, /TestFlight/i);
});

test('evaluateIosLiveUpdateDeploy skips OTA public key rotation when native shell changed', () => {
  const decision = evaluateIosLiveUpdateDeploy({
    changedFiles: ['config/ios-live-update-public.pem'],
    hasPreviousTag: true,
    nativeShellChanged: true,
  });

  assert.equal(decision.shouldDeploy, false);
  assert.match(decision.skippedReason, /TestFlight/i);
});

test('evaluateIosLiveUpdateDeploy force mode deploys unless native shell changed', () => {
  assert.deepEqual(
    evaluateIosLiveUpdateDeploy({ force: true, nativeShellChanged: false }).shouldDeploy,
    true
  );
  const forcedNative = evaluateIosLiveUpdateDeploy({ force: true, nativeShellChanged: true });
  assert.equal(forcedNative.shouldDeploy, false);
  assert.match(forcedNative.skippedReason, /TestFlight/i);
});

test('evaluateIosLiveUpdateDeploy with no previous tag deploys unless native shell changed', () => {
  assert.equal(
    evaluateIosLiveUpdateDeploy({ hasPreviousTag: false, nativeShellChanged: false }).shouldDeploy,
    true
  );
  const noTagNative = evaluateIosLiveUpdateDeploy({
    hasPreviousTag: false,
    nativeShellChanged: true,
  });
  assert.equal(noTagNative.shouldDeploy, false);
  assert.match(noTagNative.skippedReason, /TestFlight/i);
});

test('parseIosLiveUpdateShouldDeployArgs parses all flags', () => {
  assert.deepEqual(
    parseIosLiveUpdateShouldDeployArgs([
      '--base',
      'v1.0.0',
      '--head',
      'v1.1.0',
      '--github-output',
      '/tmp/out',
      '--native-shell-changed',
      '--force',
    ]),
    {
      base: 'v1.0.0',
      head: 'v1.1.0',
      githubOutput: '/tmp/out',
      nativeShellChanged: true,
      force: true,
    }
  );
});

test('parseIosLiveUpdateShouldDeployArgs defaults when no flags given', () => {
  assert.deepEqual(parseIosLiveUpdateShouldDeployArgs([]), {
    base: null,
    head: 'HEAD',
    githubOutput: null,
    nativeShellChanged: false,
    force: false,
  });
});
