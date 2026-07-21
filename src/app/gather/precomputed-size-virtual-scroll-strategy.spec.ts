import { vi } from 'vitest';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { PrecomputedSizeVirtualScrollStrategy } from './precomputed-size-virtual-scroll-strategy';

function makeViewportMock(
  overrides: {
    getViewportSize?: number;
    measureScrollOffset?: number;
  } = {}
) {
  const setTotalContentSize = vi.fn();
  const setRenderedRange = vi.fn();
  const setRenderedContentOffset = vi.fn();
  const getViewportSize = vi.fn().mockReturnValue(overrides.getViewportSize ?? 500);
  const measureScrollOffset = vi.fn().mockReturnValue(overrides.measureScrollOffset ?? 0);
  const scrollToOffset = vi.fn();

  const viewport = {
    setTotalContentSize,
    setRenderedRange,
    setRenderedContentOffset,
    getViewportSize,
    measureScrollOffset,
    scrollToOffset,
  } as unknown as CdkVirtualScrollViewport;

  return {
    viewport,
    setTotalContentSize,
    setRenderedRange,
    setRenderedContentOffset,
    getViewportSize,
    measureScrollOffset,
    scrollToOffset,
  };
}

describe('PrecomputedSizeVirtualScrollStrategy', () => {
  it('sets the total content size to the sum of item sizes on attach', () => {
    const strategy = new PrecomputedSizeVirtualScrollStrategy();
    const mock = makeViewportMock();

    strategy.setItemSizes([100, 200, 50]);
    strategy.attach(mock.viewport);

    expect(mock.setTotalContentSize).toHaveBeenCalledWith(350);
  });

  it('renders a range covering the viewport plus buffer around the scroll offset', () => {
    const strategy = new PrecomputedSizeVirtualScrollStrategy();
    // Twenty 100px rows; scrolled to offset 1000 (start of row 10) with a
    // 500px viewport — range should include rows within 400px buffer.
    const mock = makeViewportMock({ getViewportSize: 500, measureScrollOffset: 1000 });

    strategy.setItemSizes(new Array<number>(20).fill(100));
    strategy.attach(mock.viewport);

    // start offset = max(0, 1000-400) = 600 -> index 6
    // end offset = 1000+500+400 = 1900 -> index 19, +1 clamps to 20
    expect(mock.setRenderedRange).toHaveBeenCalledWith({ start: 6, end: 20 });
    expect(mock.setRenderedContentOffset).toHaveBeenCalledWith(600);
  });

  it('recomputes the rendered range when the viewport reports a scroll event', () => {
    const strategy = new PrecomputedSizeVirtualScrollStrategy();
    const mock = makeViewportMock();

    strategy.setItemSizes(new Array<number>(20).fill(100));
    strategy.attach(mock.viewport);

    mock.measureScrollOffset.mockReturnValue(1000);
    strategy.onContentScrolled();

    expect(mock.setRenderedContentOffset).toHaveBeenLastCalledWith(600);
  });

  it('emits distinct scrolled-to indices, skipping duplicates', () => {
    const strategy = new PrecomputedSizeVirtualScrollStrategy();
    const mock = makeViewportMock();
    const emitted: number[] = [];
    strategy.scrolledIndexChange.subscribe((index) => emitted.push(index));

    strategy.setItemSizes(new Array<number>(20).fill(100));
    strategy.attach(mock.viewport);

    mock.measureScrollOffset.mockReturnValue(50);
    strategy.onContentScrolled();
    mock.measureScrollOffset.mockReturnValue(1000);
    strategy.onContentScrolled();
    mock.measureScrollOffset.mockReturnValue(1050);
    strategy.onContentScrolled();

    expect(emitted).toEqual([0, 10]);
  });

  it('scrolls the viewport to the precomputed offset for a given index', () => {
    const strategy = new PrecomputedSizeVirtualScrollStrategy();
    const mock = makeViewportMock();

    strategy.setItemSizes([54, 118, 182, 66]);
    strategy.attach(mock.viewport);

    strategy.scrollToIndex(2, 'smooth');

    expect(mock.scrollToOffset).toHaveBeenCalledWith(172, 'smooth');
  });

  it('renders an empty range when there are no rows', () => {
    const strategy = new PrecomputedSizeVirtualScrollStrategy();
    const mock = makeViewportMock();

    strategy.setItemSizes([]);
    strategy.attach(mock.viewport);

    expect(mock.setRenderedRange).toHaveBeenCalledWith({ start: 0, end: 0 });
  });

  it('does nothing once detached', () => {
    const strategy = new PrecomputedSizeVirtualScrollStrategy();
    const mock = makeViewportMock();

    strategy.setItemSizes([100, 100]);
    strategy.attach(mock.viewport);
    strategy.detach();

    strategy.scrollToIndex(1, 'auto');

    expect(mock.scrollToOffset).not.toHaveBeenCalled();
  });
});
