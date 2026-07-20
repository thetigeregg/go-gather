import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ImageCacheService } from './image-cache.service';
import { StorageEngineFactory } from '../data/storage-engine.factory';
import { ImageFileStore } from '../data/image-file-store';
import type { ImageCacheRecord } from '../data/storage-engine';

const isNativePlatformMock = vi.fn<() => boolean>();

vi.mock('../utils/native-platform.util', () => ({
  isNativePlatform: () => isNativePlatformMock(),
}));

describe('ImageCacheService', () => {
  let service: ImageCacheService;
  let getImageMock: ReturnType<typeof vi.fn>;
  let putImageMock: ReturnType<typeof vi.fn>;
  let writeImageMock: ReturnType<typeof vi.fn>;
  let getDisplayUrlMock: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    isNativePlatformMock.mockReturnValue(false);
    getImageMock = vi.fn<() => Promise<ImageCacheRecord | undefined>>();
    putImageMock = vi.fn().mockResolvedValue(undefined);
    writeImageMock = vi.fn();
    getDisplayUrlMock = vi.fn();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => `blob:${String(blob.size)}`),
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: StorageEngineFactory,
          useValue: {
            getEngine: () => ({
              getImage: getImageMock,
              putImage: putImageMock,
            }),
          },
        },
        {
          provide: ImageFileStore,
          useValue: {
            writeImage: writeImageMock,
            getDisplayUrl: getDisplayUrlMock,
          },
        },
      ],
    });

    service = TestBed.inject(ImageCacheService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('web platform', () => {
    it('returns an object URL for a cached blob without fetching', async () => {
      const blob = new Blob(['cached']);
      getImageMock.mockResolvedValue({ key: 'k', blob });

      const url = await service.resolveImageUrl('k', 'https://example.com/sprite.png');

      expect(url).toBe(`blob:${String(blob.size)}`);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fetches, caches, and returns an object URL on a cache miss', async () => {
      getImageMock.mockResolvedValue(undefined);
      const blob = new Blob(['fetched']);
      fetchMock.mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });

      const url = await service.resolveImageUrl('k', 'https://example.com/sprite.png');

      expect(fetchMock).toHaveBeenCalledWith('https://example.com/sprite.png');
      expect(putImageMock).toHaveBeenCalledWith({ key: 'k', blob });
      expect(url).toBe(`blob:${String(blob.size)}`);
    });

    it('throws when the fetch response is not ok', async () => {
      getImageMock.mockResolvedValue(undefined);
      fetchMock.mockResolvedValue({ ok: false, status: 404 });

      await expect(
        service.resolveImageUrl('k', 'https://example.com/missing.png')
      ).rejects.toThrow();
      expect(putImageMock).not.toHaveBeenCalled();
    });
  });

  describe('native platform', () => {
    beforeEach(() => {
      isNativePlatformMock.mockReturnValue(true);
    });

    it('returns the display URL for a cached file path without fetching', async () => {
      getImageMock.mockResolvedValue({ key: 'k', filePath: 'image-cache/abc' });
      getDisplayUrlMock.mockResolvedValue('capacitor://localhost/abc.png');

      const url = await service.resolveImageUrl('k', 'https://example.com/sprite.png');

      expect(url).toBe('capacitor://localhost/abc.png');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refetches when the cached file was evicted from disk', async () => {
      getImageMock.mockResolvedValue({ key: 'k', filePath: 'image-cache/abc' });
      getDisplayUrlMock
        .mockResolvedValueOnce(null) // cached path stat fails (evicted)
        .mockResolvedValueOnce('capacitor://localhost/new.png'); // after refetch+write
      const blob = new Blob(['fetched']);
      fetchMock.mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
      writeImageMock.mockResolvedValue({ filePath: 'image-cache/new' });

      const url = await service.resolveImageUrl('k', 'https://example.com/sprite.png');

      expect(fetchMock).toHaveBeenCalledWith('https://example.com/sprite.png');
      expect(writeImageMock).toHaveBeenCalledWith('k', blob);
      expect(putImageMock).toHaveBeenCalledWith({ key: 'k', filePath: 'image-cache/new' });
      expect(url).toBe('capacitor://localhost/new.png');
    });

    it('fetches, writes to the filesystem, and returns the display URL on a cache miss', async () => {
      getImageMock.mockResolvedValue(undefined);
      const blob = new Blob(['fetched']);
      fetchMock.mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
      writeImageMock.mockResolvedValue({ filePath: 'image-cache/new' });
      getDisplayUrlMock.mockResolvedValue('capacitor://localhost/new.png');

      const url = await service.resolveImageUrl('k', 'https://example.com/sprite.png');

      expect(writeImageMock).toHaveBeenCalledWith('k', blob);
      expect(putImageMock).toHaveBeenCalledWith({ key: 'k', filePath: 'image-cache/new' });
      expect(url).toBe('capacitor://localhost/new.png');
    });
  });
});
