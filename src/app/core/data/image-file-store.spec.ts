import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const statMock = vi.fn<() => Promise<unknown>>();
const getUriMock = vi.fn<() => Promise<{ uri: string }>>();
const writeFileMock = vi.fn<() => Promise<void>>();
const deleteFileMock = vi.fn<() => Promise<void>>();
const rmdirMock = vi.fn<() => Promise<void>>();
const convertFileSrcMock = vi.fn<(path: string) => string>();

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: {
    stat: (...args: unknown[]) => statMock(...args),
    getUri: (...args: unknown[]) => getUriMock(...args),
    writeFile: (...args: unknown[]) => writeFileMock(...args),
    deleteFile: (...args: unknown[]) => deleteFileMock(...args),
    rmdir: (...args: unknown[]) => rmdirMock(...args),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    convertFileSrc: (path: string) => convertFileSrcMock(path),
    isNativePlatform: () => false,
  },
  registerPlugin: vi.fn().mockReturnValue({}),
}));

import { ImageFileStore } from './image-file-store';

describe('ImageFileStore', () => {
  let store: ImageFileStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ImageFileStore] });
    store = TestBed.inject(ImageFileStore);
    writeFileMock.mockResolvedValue(undefined);
    deleteFileMock.mockResolvedValue(undefined);
    rmdirMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
    TestBed.resetTestingModule();
  });

  describe('writeImage', () => {
    it('writes a hashed file under the image-cache directory and returns its filePath', async () => {
      const blob = new Blob(['fake-image-data'], { type: 'image/png' });

      const result = await store.writeImage('test-cache-key', blob);

      expect(writeFileMock).toHaveBeenCalledWith(expect.objectContaining({ recursive: true }));
      expect(result.filePath).toMatch(/^image-cache\/[a-f0-9]{64}$/);
    });

    it('hashes the same key to the same filePath', async () => {
      const blob = new Blob(['fake-image-data'], { type: 'image/png' });

      const first = await store.writeImage('same-key', blob);
      const second = await store.writeImage('same-key', blob);

      expect(first.filePath).toBe(second.filePath);
    });
  });

  describe('getDisplayUrl', () => {
    it('returns null when the file is missing', async () => {
      statMock.mockRejectedValue(new Error('not found'));

      const result = await store.getDisplayUrl('image-cache/abc');

      expect(result).toBeNull();
    });

    it('returns a display URL when the file exists', async () => {
      statMock.mockResolvedValue({});
      getUriMock.mockResolvedValue({ uri: 'file:///var/cache/image-cache/abc' });
      convertFileSrcMock.mockReturnValue('capacitor://localhost/image-cache/abc');

      const result = await store.getDisplayUrl('image-cache/abc');

      expect(result).toBe('capacitor://localhost/image-cache/abc');
    });
  });

  describe('deleteImage', () => {
    it('deletes the file at the given path', async () => {
      await store.deleteImage('image-cache/abc');

      expect(deleteFileMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'image-cache/abc' })
      );
    });

    it('does not throw when delete fails', async () => {
      deleteFileMock.mockRejectedValue(new Error('evicted'));

      await expect(store.deleteImage('image-cache/abc')).resolves.toBeUndefined();
    });
  });

  describe('clear', () => {
    it('removes the whole image-cache directory', async () => {
      await store.clear();

      expect(rmdirMock).toHaveBeenCalledWith(expect.objectContaining({ recursive: true }));
    });

    it('does not throw when the directory does not exist', async () => {
      rmdirMock.mockRejectedValue(new Error('dir not found'));

      await expect(store.clear()).resolves.toBeUndefined();
    });
  });
});
