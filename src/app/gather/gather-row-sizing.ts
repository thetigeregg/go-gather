/**
 * Pixel heights used by `PrecomputedSizeVirtualScrollStrategy` to position
 * rows without ever measuring the DOM. Each constant must match the real
 * rendered height of its row type — verify/adjust these against devtools if
 * the Ionic theme or card layout changes.
 */
/** Real rendered height of the app-generation-header-row's ion-item alone. */
export const GATHER_GENERATION_HEADER_ITEM_PX = 56;

/** Space reserved below the generation header row, before its first species card. */
export const GATHER_GENERATION_HEADER_GAP_PX = 16;

export const GATHER_ROW_GENERATION_HEADER_PX =
  GATHER_GENERATION_HEADER_ITEM_PX + GATHER_GENERATION_HEADER_GAP_PX;

/**
 * Height of an ion-card's header (ion-card-header + ion-card-subtitle) and
 * of one app-gather-entry row within its ion-list — measured from the live
 * app (not the same as the 64px --min-height forced on ion-item, since
 * ion-item's `lines="full"` divider and ion-list's own top border add a
 * little on top of that). Solved from two real measurements: a 2-entry
 * card at 172px and a 4-entry card at 302px.
 */
export const GATHER_CARD_HEADER_PX = 42;
export const GATHER_CARD_ENTRY_PX = 65;

/** Matches the original .poke-list flex layout's `gap: 12px` between cards. */
export const GATHER_CARD_GAP_PX = 12;

export function speciesCardHeightPx(entryCount: number): number {
  return GATHER_CARD_HEADER_PX + entryCount * GATHER_CARD_ENTRY_PX + GATHER_CARD_GAP_PX;
}
