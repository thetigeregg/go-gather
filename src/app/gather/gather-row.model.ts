import { CatalogEntry } from '@go-gather/shared';
import { Generation, SpeciesGroup } from '../core/services/filter.service';

export type GatherRow =
  | { kind: 'generation-header'; key: string; generation: Generation }
  | {
      kind: 'entry';
      key: string;
      entry: CatalogEntry;
      speciesGroup: SpeciesGroup;
      isFirstInSpecies: boolean;
      isLastInSpecies: boolean;
    };

export interface FlattenedGatherRows {
  rows: GatherRow[];
  /** Parallel to `rows`: index of the generation-header row each row belongs under. */
  generationHeaderIndexByRow: number[];
}

/**
 * Flattens Generation -> SpeciesGroup -> CatalogEntry into a single row array
 * so the gather page can render it with one `cdk-virtual-scroll-viewport`
 * instead of nesting three levels of Angular components.
 */
export function flattenGenerations(generations: readonly Generation[]): FlattenedGatherRows {
  const rows: GatherRow[] = [];
  const generationHeaderIndexByRow: number[] = [];

  for (const generation of generations) {
    const headerIndex = rows.length;
    rows.push({
      kind: 'generation-header',
      key: `generation-header:${generation.generationName}`,
      generation,
    });
    generationHeaderIndexByRow.push(headerIndex);

    for (const speciesGroup of generation.speciesList) {
      const lastEntryIndex = speciesGroup.entries.length - 1;

      speciesGroup.entries.forEach((entry, entryIndex) => {
        rows.push({
          kind: 'entry',
          key: entry.id,
          entry,
          speciesGroup,
          isFirstInSpecies: entryIndex === 0,
          isLastInSpecies: entryIndex === lastEntryIndex,
        });
        generationHeaderIndexByRow.push(headerIndex);
      });
    }
  }

  return { rows, generationHeaderIndexByRow };
}

export function trackGatherRow(_index: number, row: GatherRow): string {
  return row.key;
}
