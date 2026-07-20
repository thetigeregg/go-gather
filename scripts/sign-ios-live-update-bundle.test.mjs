import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { parseArgs, resolvePrivateKeyPem } from './sign-ios-live-update-bundle.mjs';

test('parseArgs extracts bundle path and --private-key-path', () => {
  assert.deepEqual(parseArgs(['bundle.zip', '--private-key-path', 'key.pem']), {
    bundlePath: 'bundle.zip',
    privateKeyPath: 'key.pem',
  });
});

test('parseArgs defaults privateKeyPath to null when omitted', () => {
  assert.deepEqual(parseArgs(['bundle.zip']), {
    bundlePath: 'bundle.zip',
    privateKeyPath: null,
  });
});

test('resolvePrivateKeyPem prefers inline privateKeyPem option', () => {
  assert.equal(
    resolvePrivateKeyPem({ privateKeyPem: '  inline-pem  ', privateKeyPath: '/should/not/read' }),
    'inline-pem'
  );
});

test('resolvePrivateKeyPem prefers IOS_LIVE_UPDATE_PRIVATE_KEY env over path', () => {
  const original = process.env.IOS_LIVE_UPDATE_PRIVATE_KEY;
  process.env.IOS_LIVE_UPDATE_PRIVATE_KEY = 'env-inline-pem';
  try {
    assert.equal(resolvePrivateKeyPem({}), 'env-inline-pem');
  } finally {
    if (original === undefined) {
      delete process.env.IOS_LIVE_UPDATE_PRIVATE_KEY;
    } else {
      process.env.IOS_LIVE_UPDATE_PRIVATE_KEY = original;
    }
  }
});

test('resolvePrivateKeyPem falls back to reading privateKeyPath file', () => {
  // resolvePrivateKeyPem uses the real readFileSync internally (not injectable),
  // so exercise the path-resolution branch via a real temp file instead.
  const tmpFile = join(tmpdir(), `sign-ios-live-update-bundle-test-${process.pid}.pem`);
  writeFileSync(tmpFile, '  file-pem-contents  ', 'utf8');
  try {
    assert.equal(resolvePrivateKeyPem({ privateKeyPath: tmpFile }), 'file-pem-contents');
  } finally {
    unlinkSync(tmpFile);
  }
});

test('resolvePrivateKeyPem throws when neither key source is provided', () => {
  const originalInline = process.env.IOS_LIVE_UPDATE_PRIVATE_KEY;
  const originalPath = process.env.IOS_LIVE_UPDATE_PRIVATE_KEY_PATH;
  delete process.env.IOS_LIVE_UPDATE_PRIVATE_KEY;
  delete process.env.IOS_LIVE_UPDATE_PRIVATE_KEY_PATH;
  try {
    assert.throws(() => resolvePrivateKeyPem({}), /Missing signing key/);
  } finally {
    if (originalInline !== undefined) process.env.IOS_LIVE_UPDATE_PRIVATE_KEY = originalInline;
    if (originalPath !== undefined) process.env.IOS_LIVE_UPDATE_PRIVATE_KEY_PATH = originalPath;
  }
});
