import { ListRange } from '@angular/cdk/collections';
import { CdkVirtualScrollViewport, VirtualScrollStrategy } from '@angular/cdk/scrolling';
import { Injectable, OnDestroy } from '@angular/core';
import { Subject, distinctUntilChanged } from 'rxjs';

const BUFFER_PX = 400;

/**
 * A CDK virtual-scroll strategy for rows whose height varies (a species
 * card's height depends on how many entries it holds) but is always known
 * up front from the data, unlike CDK's experimental autosize strategy,
 * which measures rendered rows from the DOM and can cause visible scroll
 * jumps as its size estimates correct themselves. Offsets are precomputed
 * as a prefix sum whenever `setItemSizes()` is called.
 */
@Injectable()
export class PrecomputedSizeVirtualScrollStrategy implements VirtualScrollStrategy, OnDestroy {
  private readonly scrolledIndexChangeSubject = new Subject<number>();
  readonly scrolledIndexChange = this.scrolledIndexChangeSubject.pipe(distinctUntilChanged());

  private viewport: CdkVirtualScrollViewport | null = null;
  private itemSizes: number[] = [];
  private itemOffsets: number[] = [];
  private totalContentSize = 0;

  setItemSizes(itemSizes: number[]): void {
    this.itemSizes = itemSizes;
    this.itemOffsets = new Array<number>(itemSizes.length);

    let cumulative = 0;
    for (let i = 0; i < itemSizes.length; i++) {
      this.itemOffsets[i] = cumulative;
      cumulative += itemSizes[i];
    }
    this.totalContentSize = cumulative;

    if (this.viewport) {
      this.viewport.setTotalContentSize(this.totalContentSize);
      this.updateRenderedRange();
    }
  }

  attach(viewport: CdkVirtualScrollViewport): void {
    this.viewport = viewport;
    this.viewport.setTotalContentSize(this.totalContentSize);
    this.updateRenderedRange();
  }

  detach(): void {
    this.scrolledIndexChangeSubject.complete();
    this.viewport = null;
  }

  ngOnDestroy(): void {
    this.detach();
  }

  onContentScrolled(): void {
    this.updateRenderedRange();
  }

  onDataLengthChanged(): void {
    this.updateRenderedRange();
  }

  onContentRendered(): void {
    // No-op: offsets are precomputed up front, never measured from the DOM.
  }

  onRenderedOffsetChanged(): void {
    // No-op, for the same reason as onContentRendered above.
  }

  scrollToIndex(index: number, behavior: ScrollBehavior): void {
    if (!this.viewport) {
      return;
    }

    this.viewport.scrollToOffset(this.itemOffsets[index] ?? 0, behavior);
  }

  private updateRenderedRange(): void {
    if (!this.viewport) {
      return;
    }

    if (this.itemSizes.length === 0) {
      this.viewport.setRenderedRange({ start: 0, end: 0 });
      this.viewport.setRenderedContentOffset(0);
      return;
    }

    const viewportSize = this.viewport.getViewportSize();
    const scrollOffset = this.viewport.measureScrollOffset();

    const start = this.findIndexAtOffset(Math.max(0, scrollOffset - BUFFER_PX));
    const end = Math.min(
      this.itemSizes.length,
      this.findIndexAtOffset(scrollOffset + viewportSize + BUFFER_PX) + 1
    );
    const range: ListRange = { start, end };

    this.viewport.setRenderedRange(range);
    this.viewport.setRenderedContentOffset(this.itemOffsets[start]);
    this.scrolledIndexChangeSubject.next(this.findIndexAtOffset(scrollOffset));
  }

  /** Binary search for the last index whose start offset is <= the given offset. */
  private findIndexAtOffset(offset: number): number {
    if (offset <= 0) {
      return 0;
    }

    let low = 0;
    let high = this.itemOffsets.length - 1;

    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.itemOffsets[mid] <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return low;
  }
}
