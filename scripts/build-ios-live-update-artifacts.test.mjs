import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  DEFAULT_OTA_OUTPUT_PATH,
  DEFAULT_OUTPUT_ROOT,
  buildIosLiveUpdateArtifacts,
  buildOtaArtifactPaths,
  resolveBackendOriginForOta,
  resolveDefaultOtaWebDir,
  resolveNativeBuildNumber,
} from './build-ios-live-update-artifacts.mjs';

test('resolveDefaultOtaWebDir resolves under www/ios-ota/browser', () => {
  const cwd = '/tmp/go-gather';
  assert.equal(resolveDefaultOtaWebDir(cwd), '/tmp/go-gather/www/ios-ota/browser');
  assert.equal(DEFAULT_OTA_OUTPUT_PATH, 'www/ios-ota');
});

test('resolveNativeBuildNumber falls back through env var names', () => {
  assert.equal(resolveNativeBuildNumber({ IOS_OTA_NATIVE_BUILD_NUMBER: '42' }), '42');
  assert.equal(resolveNativeBuildNumber({ IOS_BUILD_NUMBER: '7' }), '7');
  assert.equal(resolveNativeBuildNumber({ IOS_LIVE_UPDATE_NATIVE_BUILD_NUMBER: 3 }), '3');
  assert.throws(() => resolveNativeBuildNumber({}), /Missing native build number/);
});

test('resolveBackendOriginForOta prefers IOS_BACKEND_ORIGIN_PROD over BACKEND_ORIGIN', () => {
  assert.equal(
    resolveBackendOriginForOta({
      IOS_BACKEND_ORIGIN_PROD: 'https://prod.example.com',
      BACKEND_ORIGIN: 'https://fallback.example.com',
    }),
    'https://prod.example.com'
  );
  assert.equal(
    resolveBackendOriginForOta({ BACKEND_ORIGIN: 'https://fallback.example.com' }),
    'https://fallback.example.com'
  );
});

test('buildOtaArtifactPaths builds the expected directory shape', () => {
  const paths = buildOtaArtifactPaths({
    outputRoot: DEFAULT_OUTPUT_ROOT,
    nativeBuildNumber: '42',
    bundleId: 'v1.0.0-b42',
  });

  assert.equal(paths.buildDir, resolve(DEFAULT_OUTPUT_ROOT, '42'));
  assert.ok(paths.zipPath.endsWith('42/v1.0.0-b42.zip'));
  assert.ok(paths.manifestPath.endsWith('42/manifest.json'));
  assert.ok(paths.headersPath.endsWith('42/v1.0.0-b42.headers.json'));
});

test('buildIosLiveUpdateArtifacts runs build:ios:prod:ota and zips from www/ios-ota/browser', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ota-build-'));
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify({ name: 'go-gather', version: '1.0.0' }),
    'utf8'
  );

  const otaWebDir = resolveDefaultOtaWebDir(cwd);
  mkdirSync(otaWebDir, { recursive: true });
  writeFileSync(join(otaWebDir, 'index.html'), '<html></html>', 'utf8');

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const commands = [];

  const result = await buildIosLiveUpdateArtifacts({
    cwd,
    buildIosProd: true,
    loadDotEnv: false,
    writeEnvironment: false,
    write: false,
    semver: '1.0.0',
    nativeBuildNumber: '42',
    backendOrigin: 'https://example.com',
    privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }),
    execFileSyncFn: (cmd, args) => {
      commands.push([cmd, ...args]);
      if (cmd === 'zip') {
        writeFileSync(args[1], 'zip-bytes', 'utf8');
      }
    },
  });

  assert.deepEqual(commands[0], ['npm', 'run', 'build:ios:prod:ota']);
  assert.ok(result.zipPath.endsWith('v1.0.0-b42.zip'));
  assert.equal(result.manifest.url, 'https://example.com/ota/ios/42/v1.0.0-b42.zip');
});

test('buildIosLiveUpdateArtifacts passes injected processEnv to build:ios:prod:ota', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ota-build-'));
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify({ name: 'go-gather', version: '1.0.0' }),
    'utf8'
  );

  const otaWebDir = resolveDefaultOtaWebDir(cwd);
  mkdirSync(otaWebDir, { recursive: true });
  writeFileSync(join(otaWebDir, 'index.html'), '<html></html>', 'utf8');

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const injectedEnv = { OTA_INJECTED_ENV: 'from-process-env' };
  let capturedEnv;

  await buildIosLiveUpdateArtifacts({
    cwd,
    buildIosProd: true,
    loadDotEnv: false,
    writeEnvironment: false,
    write: false,
    processEnv: injectedEnv,
    semver: '1.0.0',
    nativeBuildNumber: '42',
    backendOrigin: 'https://example.com',
    privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }),
    execFileSyncFn: (cmd, args, options) => {
      if (cmd === 'npm') {
        capturedEnv = options.env;
      }
      if (cmd === 'zip') {
        writeFileSync(args[1], 'zip-bytes', 'utf8');
      }
    },
  });

  assert.equal(capturedEnv.OTA_INJECTED_ENV, 'from-process-env');
});

test('buildIosLiveUpdateArtifacts writes manifest and headers files when write is not disabled', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ota-build-'));
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify({ name: 'go-gather', version: '1.0.0' }),
    'utf8'
  );

  const otaWebDir = resolveDefaultOtaWebDir(cwd);
  mkdirSync(otaWebDir, { recursive: true });
  writeFileSync(join(otaWebDir, 'index.html'), '<html></html>', 'utf8');

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const writes = {};

  await buildIosLiveUpdateArtifacts({
    cwd,
    buildIosProd: false,
    loadDotEnv: false,
    writeEnvironment: false,
    outputRoot: join(cwd, 'ota', 'ios'),
    semver: '1.0.0',
    nativeBuildNumber: '42',
    backendOrigin: 'https://example.com',
    privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }),
    execFileSyncFn: (cmd, args) => {
      if (cmd === 'zip') {
        writeFileSync(args[1], 'zip-bytes', 'utf8');
      }
    },
    writeFileSyncFn: (path, contents) => {
      writes[path] = contents;
    },
  });

  const manifestEntry = Object.entries(writes).find(([path]) => path.endsWith('manifest.json'));
  const headersEntry = Object.entries(writes).find(([path]) => path.endsWith('.headers.json'));

  assert.ok(manifestEntry);
  assert.ok(headersEntry);
  assert.match(JSON.parse(manifestEntry[1]).bundleId, /^v1\.0\.0-b42$/);
  assert.ok(JSON.parse(headersEntry[1]).signature.length > 0);
});
