/**
 * Every row rendered inside the gather page's `cdk-virtual-scroll-viewport`
 * must be exactly this tall — `CdkFixedSizeVirtualScroll` computes each row's
 * scroll offset as `index * itemSize` without ever measuring the DOM, so any
 * row whose real rendered height drifts from this constant will overlap or
 * leave a gap. `GATHER_ROW_ENTRY_PX` must match the explicit height forced on
 * `app-gather-entry`'s `ion-item` in gather-entry.component.scss.
 */
export const GATHER_ROW_GAP_PX = 6;
export const GATHER_ROW_HEADER_PX = 20;
export const GATHER_ROW_ENTRY_PX = 64;
export const GATHER_ROW_ITEM_SIZE_PX =
  GATHER_ROW_GAP_PX * 2 + GATHER_ROW_HEADER_PX + GATHER_ROW_ENTRY_PX;
