import { Injectable, inject } from '@angular/core';
import { StorageEngine } from '../data/storage-engine';
import { StorageEngineFactory } from '../data/storage-engine.factory';
import { ImageFileStore } from '../data/image-file-store';
import { isNativePlatform } from '../utils/native-platform.util';

/**
 * Fetch-once-and-cache image resolution, backed by the `imageCache` storage
 * scope (Dexie blobs on web, `ImageFileStore` files under Directory.Cache on
 * native) — the consumer left unwired at the end of Phase 6, see
 * docs/progress/phase-6-sqlite-storage.md's "Scope: infrastructure only".
 *
 * Deliberately smaller than game-shelf's ImageCacheService: no LRU/size-cap
 * eviction, no thumb/detail variants, no blob-signature validation — go-gather
 * caches a small, fixed, first-party sprite set already validated at sync
 * time, none of that has anything to attach to here.
 */
@Injectable({ providedIn: 'root' })
export class ImageCacheService {
  private readonly storageEngineFactory = inject(StorageEngineFactory);
  private readonly imageFileStore = inject(ImageFileStore);
  private readonly objectUrlsByKey = new Map<string, string>();

  private get engine(): StorageEngine {
    return this.storageEngineFactory.getEngine();
  }

  /** Resolves a displayable URL for `sourceUrl`, serving from the local cache when possible. */
  async resolveImageUrl(key: string, sourceUrl: string): Promise<string> {
    const cached = await this.engine.getImage(key);

    if (cached?.blob) {
      return this.toObjectUrl(key, cached.blob);
    }

    if (cached?.filePath) {
      const displayUrl = await this.imageFileStore.getDisplayUrl(cached.filePath);
      if (displayUrl) {
        return displayUrl;
      }
      // File was evicted from Directory.Cache by the OS — refetch below.
    }

    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image ${sourceUrl}: ${String(response.status)}`);
    }
    const blob = await response.blob();

    if (isNativePlatform()) {
      const { filePath } = await this.imageFileStore.writeImage(key, blob);
      await this.engine.putImage({ key, filePath });
      const displayUrl = await this.imageFileStore.getDisplayUrl(filePath);
      if (!displayUrl) {
        throw new Error(`Failed to resolve display URL for freshly written image ${key}`);
      }
      return displayUrl;
    }

    await this.engine.putImage({ key, blob });
    return this.toObjectUrl(key, blob);
  }

  private toObjectUrl(key: string, blob: Blob): string {
    const existing = this.objectUrlsByKey.get(key);
    if (existing) {
      return existing;
    }

    const objectUrl = URL.createObjectURL(blob);
    this.objectUrlsByKey.set(key, objectUrl);
    return objectUrl;
  }
}
