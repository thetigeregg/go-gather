import { describe, expect, it } from 'vitest';

import {
  buildLiveUpdateManifestUrl,
  parseIosLiveUpdateManifest,
  resolveBackendOriginFromApiUrl,
  shouldStageLiveUpdateManifest,
} from './live-update.logic';

describe('live-update.logic', () => {
  it('parseIosLiveUpdateManifest validates required fields', () => {
    expect(
      parseIosLiveUpdateManifest({
        bundleId: 'v1.0.0-b42',
        semver: '1.0.0',
        nativeBuildNumber: '42',
        url: 'https://gogather.example.com/ota/ios/42/v1.0.0-b42.zip',
        checksum: 'abc',
        signature: 'sig',
      })
    ).toEqual({
      bundleId: 'v1.0.0-b42',
      semver: '1.0.0',
      nativeBuildNumber: '42',
      url: 'https://gogather.example.com/ota/ios/42/v1.0.0-b42.zip',
      checksum: 'abc',
      signature: 'sig',
    });

    expect(parseIosLiveUpdateManifest({ bundleId: 'only-id' })).toBeNull();
    expect(parseIosLiveUpdateManifest(null)).toBeNull();
    expect(parseIosLiveUpdateManifest(undefined)).toBeNull();
    expect(parseIosLiveUpdateManifest('manifest')).toBeNull();
    expect(parseIosLiveUpdateManifest(42)).toBeNull();
  });

  it('buildLiveUpdateManifestUrl targets per-native-build manifest path', () => {
    expect(buildLiveUpdateManifestUrl('https://gogather.example.com', '42')).toBe(
      'https://gogather.example.com/ota/ios/42/manifest.json'
    );
  });

  it('resolveBackendOriginFromApiUrl strips path via URL host', () => {
    expect(resolveBackendOriginFromApiUrl('https://gogather.example.com/api')).toBe(
      'https://gogather.example.com'
    );
  });

  it('resolveBackendOriginFromApiUrl rejects non-https origins', () => {
    expect(resolveBackendOriginFromApiUrl('http://localhost:3000')).toBeNull();
  });

  it('resolveBackendOriginFromApiUrl rejects empty or invalid origins', () => {
    expect(resolveBackendOriginFromApiUrl('')).toBeNull();
    expect(resolveBackendOriginFromApiUrl('not-a-url')).toBeNull();
    expect(resolveBackendOriginFromApiUrl('ftp://gogather.example.com')).toBeNull();
  });

  it('shouldStageLiveUpdateManifest gates incompatible or already-staged bundles', () => {
    const manifest = parseIosLiveUpdateManifest({
      bundleId: 'v1.0.0-b42',
      semver: '1.0.0',
      nativeBuildNumber: '42',
      url: 'https://gogather.example.com/ota/ios/42/v1.0.0-b42.zip',
      checksum: 'abc',
      signature: 'sig',
    });

    expect(
      shouldStageLiveUpdateManifest({
        manifest,
        nativeBuildNumber: '42',
        currentBundleId: null,
        nextBundleId: null,
      })
    ).toEqual({ shouldStage: true, reason: 'update_available' });

    expect(
      shouldStageLiveUpdateManifest({
        manifest,
        nativeBuildNumber: '41',
        currentBundleId: null,
        nextBundleId: null,
      })
    ).toEqual({ shouldStage: false, reason: 'native_build_mismatch' });

    expect(
      shouldStageLiveUpdateManifest({
        manifest: null,
        nativeBuildNumber: '42',
        currentBundleId: null,
        nextBundleId: null,
      })
    ).toEqual({ shouldStage: false, reason: 'invalid_manifest' });

    expect(
      shouldStageLiveUpdateManifest({
        manifest,
        nativeBuildNumber: '',
        currentBundleId: null,
        nextBundleId: null,
      })
    ).toEqual({ shouldStage: false, reason: 'missing_native_build_number' });

    expect(
      shouldStageLiveUpdateManifest({
        manifest,
        nativeBuildNumber: '42',
        currentBundleId: 'v1.0.0-b42',
        nextBundleId: null,
      })
    ).toEqual({ shouldStage: false, reason: 'already_staged_or_active' });

    expect(
      shouldStageLiveUpdateManifest({
        manifest,
        nativeBuildNumber: '42',
        currentBundleId: null,
        nextBundleId: 'v1.0.0-b42',
      })
    ).toEqual({ shouldStage: false, reason: 'already_staged_or_active' });
  });
});
