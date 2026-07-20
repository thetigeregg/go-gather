import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import test from 'node:test';

import {
  buildIosLiveUpdateBundleId,
  buildIosLiveUpdateManifest,
  computeBundleChecksum,
  normalizeBackendOrigin,
  parseIosLiveUpdateManifest,
  shouldStageLiveUpdateManifest,
  signBundleBuffer,
  signBundleFile,
} from './ios-live-update-common.mjs';

test('computeBundleChecksum returns stable sha256 hex', () => {
  const buffer = Buffer.from('go-gather-ota-test');
  const checksum = computeBundleChecksum(buffer);
  assert.match(checksum, /^[a-f0-9]{64}$/);
  assert.equal(checksum, computeBundleChecksum(buffer));
});

test('signBundleBuffer verifies with RSA-SHA256 public key', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const buffer = Buffer.from('signed-bundle-contents');
  const signature = signBundleBuffer(buffer, privateKey.export({ type: 'pkcs1', format: 'pem' }));

  const verifier = createVerify('RSA-SHA256');
  verifier.update(buffer);
  verifier.end();

  assert.equal(
    verifier.verify(publicKey.export({ type: 'pkcs1', format: 'pem' }), signature, 'base64'),
    true
  );
});

test('signBundleBuffer accepts PKCS#8 PEM private key', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const buffer = Buffer.from('signed-bundle-contents');
  const signature = signBundleBuffer(buffer, privateKey.export({ type: 'pkcs8', format: 'pem' }));

  const verifier = createVerify('RSA-SHA256');
  verifier.update(buffer);
  verifier.end();

  assert.equal(
    verifier.verify(publicKey.export({ type: 'pkcs1', format: 'pem' }), signature, 'base64'),
    true
  );
});

test('signBundleFile returns checksum, signature, and size for zip bytes', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const readFileSyncFn = () => Buffer.from('zip-bytes');

  const result = signBundleFile(
    '/tmp/fake.zip',
    privateKey.export({ type: 'pkcs1', format: 'pem' }),
    readFileSyncFn
  );

  assert.match(result.checksum, /^[a-f0-9]{64}$/);
  assert.ok(result.signature.length > 0);
  assert.equal(result.sizeBytes, 9);
});

test('buildIosLiveUpdateBundleId encodes semver and native build number', () => {
  assert.equal(buildIosLiveUpdateBundleId('1.0.0', 42), 'v1.0.0-b42');
});

test('buildIosLiveUpdateBundleId defaults semver when missing', () => {
  assert.equal(buildIosLiveUpdateBundleId(undefined, 42), 'v0.0.0-b42');
});

test('buildIosLiveUpdateBundleId throws when native build number is missing', () => {
  assert.throws(() => buildIosLiveUpdateBundleId('1.0.0', undefined), /nativeBuildNumber/);
  assert.throws(() => buildIosLiveUpdateBundleId('1.0.0', ''), /nativeBuildNumber/);
});

test('buildIosLiveUpdateManifest builds https bundle URL', () => {
  const manifest = buildIosLiveUpdateManifest({
    bundleId: 'v1.0.0-b42',
    semver: '1.0.0',
    nativeBuildNumber: '42',
    backendOrigin: 'https://gogather.example.com/',
    checksum: 'abc',
    signature: 'sig',
  });

  assert.equal(manifest.url, 'https://gogather.example.com/ota/ios/42/v1.0.0-b42.zip');
  assert.equal(manifest.nativeBuildNumber, '42');
  assert.equal(manifest.semver, '1.0.0');
});

test('normalizeBackendOrigin rejects non-https origins', () => {
  assert.throws(() => normalizeBackendOrigin('http://localhost:8080'), /https/);
});

test('normalizeBackendOrigin strips trailing slashes and path', () => {
  assert.equal(
    normalizeBackendOrigin('https://gogather.example.com/'),
    'https://gogather.example.com'
  );
});

test('normalizeBackendOrigin rejects non-string and empty values', () => {
  assert.throws(() => normalizeBackendOrigin(undefined), /string/);
  assert.throws(() => normalizeBackendOrigin('   '), /empty/);
  assert.throws(() => normalizeBackendOrigin('not a url'), /Invalid backendOrigin/);
});

test('parseIosLiveUpdateManifest rejects missing fields', () => {
  assert.equal(parseIosLiveUpdateManifest(null), null);
  assert.equal(parseIosLiveUpdateManifest('not-an-object'), null);
  assert.equal(
    parseIosLiveUpdateManifest({
      bundleId: 'v1.0.0-b42',
      semver: '1.0.0',
      nativeBuildNumber: '42',
      url: 'https://gogather.example.com/ota/ios/42/v1.0.0-b42.zip',
      checksum: 'abc',
      // signature missing
    }),
    null
  );
});

test('parseIosLiveUpdateManifest returns trimmed fields when valid', () => {
  const manifest = parseIosLiveUpdateManifest({
    bundleId: ' v1.0.0-b42 ',
    semver: ' 1.0.0 ',
    nativeBuildNumber: ' 42 ',
    url: ' https://gogather.example.com/ota/ios/42/v1.0.0-b42.zip ',
    checksum: ' abc ',
    signature: ' sig ',
  });

  assert.deepEqual(manifest, {
    bundleId: 'v1.0.0-b42',
    semver: '1.0.0',
    nativeBuildNumber: '42',
    url: 'https://gogather.example.com/ota/ios/42/v1.0.0-b42.zip',
    checksum: 'abc',
    signature: 'sig',
  });
});

test('shouldStageLiveUpdateManifest gates by native build and existing bundle', () => {
  const manifest = parseIosLiveUpdateManifest({
    bundleId: 'v1.0.0-b42',
    semver: '1.0.0',
    nativeBuildNumber: '42',
    url: 'https://gogather.example.com/ota/ios/42/v1.0.0-b42.zip',
    checksum: 'abc',
    signature: 'sig',
  });

  assert.deepEqual(
    shouldStageLiveUpdateManifest({
      manifest,
      nativeBuildNumber: '42',
      currentBundleId: null,
      nextBundleId: null,
    }),
    { shouldStage: true, reason: 'update_available' }
  );

  assert.deepEqual(
    shouldStageLiveUpdateManifest({
      manifest,
      nativeBuildNumber: '41',
      currentBundleId: null,
      nextBundleId: null,
    }),
    { shouldStage: false, reason: 'native_build_mismatch' }
  );

  assert.deepEqual(
    shouldStageLiveUpdateManifest({
      manifest,
      nativeBuildNumber: '42',
      currentBundleId: 'v1.0.0-b42',
      nextBundleId: null,
    }),
    { shouldStage: false, reason: 'already_staged_or_active' }
  );

  assert.deepEqual(
    shouldStageLiveUpdateManifest({
      manifest,
      nativeBuildNumber: '42',
      currentBundleId: null,
      nextBundleId: 'v1.0.0-b42',
    }),
    { shouldStage: false, reason: 'already_staged_or_active' }
  );
});

test('shouldStageLiveUpdateManifest handles invalid manifest and missing build number', () => {
  assert.deepEqual(shouldStageLiveUpdateManifest({ manifest: null, nativeBuildNumber: '42' }), {
    shouldStage: false,
    reason: 'invalid_manifest',
  });

  const manifest = parseIosLiveUpdateManifest({
    bundleId: 'v1.0.0-b42',
    semver: '1.0.0',
    nativeBuildNumber: '42',
    url: 'https://gogather.example.com/ota/ios/42/v1.0.0-b42.zip',
    checksum: 'abc',
    signature: 'sig',
  });

  assert.deepEqual(shouldStageLiveUpdateManifest({ manifest, nativeBuildNumber: '' }), {
    shouldStage: false,
    reason: 'missing_native_build_number',
  });
});
