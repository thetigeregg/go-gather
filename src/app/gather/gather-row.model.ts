import { Generation, SpeciesGroup } from '../core/services/filter.service';
import { GATHER_ROW_GENERATION_HEADER_PX, speciesCardHeightPx } from './gather-row-sizing';

export type GatherRow =
  | { kind: 'generation-header'; key: string; generation: Generation }
  | { kind: 'species-card'; key: string; speciesGroup: SpeciesGroup };

export interface FlattenedGatherRows {
  rows: GatherRow[];
  /** Parallel to `rows`: precomputed pixel height for the virtual scroll strategy. */
  rowSizes: number[];
  /** Parallel to `rows`: index of the generation-header row each row belongs under. */
  generationHeaderIndexByRow: number[];
}

/**
 * Flattens Generation -> SpeciesGroup into a single row array so the gather
 * page can render it with one `cdk-virtual-scroll-viewport` instead of
 * nesting accordion + card components inside each other. Each row is a
 * whole species card (real `<ion-card>`, unchanged from the original
 * design) rather than a single entry, since that's the natural unit whose
 * real `<ion-card>` markup can't otherwise span multiple virtual rows.
 */
export function flattenGenerations(generations: readonly Generation[]): FlattenedGatherRows {
  const rows: GatherRow[] = [];
  const rowSizes: number[] = [];
  const generationHeaderIndexByRow: number[] = [];

  for (const generation of generations) {
    const headerIndex = rows.length;
    rows.push({
      kind: 'generation-header',
      key: `generation-header:${generation.generationName}`,
      generation,
    });
    rowSizes.push(GATHER_ROW_GENERATION_HEADER_PX);
    generationHeaderIndexByRow.push(headerIndex);

    for (const speciesGroup of generation.speciesList) {
      rows.push({ kind: 'species-card', key: speciesGroup.speciesId, speciesGroup });
      rowSizes.push(speciesCardHeightPx(speciesGroup.entries.length));
      generationHeaderIndexByRow.push(headerIndex);
    }
  }

  return { rows, rowSizes, generationHeaderIndexByRow };
}

export function trackGatherRow(_index: number, row: GatherRow): string {
  return row.key;
}
