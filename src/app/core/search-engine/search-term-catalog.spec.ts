import type { SearchTerm } from './search-query.model';
import { TERM_CATALOG, getTermCatalogEntry } from './search-term-catalog';

/** Every kind in the SearchTerm discriminated union (search-query.model.ts) —
 * kept as a literal list here (not derived from the type) so this test
 * actually fails if TERM_CATALOG falls out of sync with the union, per
 * search-term-catalog.ts's own completeness contract. */
const ALL_SEARCH_TERM_KINDS: SearchTerm['kind'][] = [
  'name',
  'family',
  'nickname',
  'tag',
  'hasTag',
  'region',
  'keyword',
  'type',
  'gender',
  'size',
  'raidOrigin',
  'move',
  'moveType',
  'fastMoveType',
  'chargedMoveType',
  'secondChargedMoveType',
  'weather',
  'special',
  'weakAgainst',
  'superEffectiveAgainst',
  'numeric',
  'statRating',
  'appraisalStars',
  'buddyLevel',
  'megaLevel',
  'raw',
];

describe('TERM_CATALOG', () => {
  it('has exactly one entry per SearchTerm kind', () => {
    const catalogKinds = TERM_CATALOG.map((entry) => entry.kind).sort();
    expect(catalogKinds).toEqual([...ALL_SEARCH_TERM_KINDS].sort());
  });

  it.each(ALL_SEARCH_TERM_KINDS)('getTermCatalogEntry resolves "%s"', (kind) => {
    expect(getTermCatalogEntry(kind).kind).toBe(kind);
  });

  it('throws for an unknown kind', () => {
    expect(() => getTermCatalogEntry('not-a-real-kind' as SearchTerm['kind'])).toThrow(
      'No TERM_CATALOG entry for kind "not-a-real-kind"'
    );
  });
});
