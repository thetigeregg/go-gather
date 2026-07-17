import { PresetQuery, PresetQueryGroup } from '@go-gather/shared';
import { QueryNode, SearchTerm, and, not, or, term } from './search-query.model';
import { serializeQuery } from './search-query.serializer';

/**
 * `PresetQuery`/`SearchTermData` live in `@go-gather/shared` (so `ExportBundle`
 * can serialize them without `shared` importing from the app), but are kept
 * structurally identical to this engine's `SearchTerm` — this cast is the one
 * place that equivalence is asserted, rather than scattering casts through
 * every editor component that touches a preset's terms.
 */
function toSearchTerm(rule: PresetQueryGroup['rules'][number]): SearchTerm {
  return rule.term as SearchTerm;
}

function compileGroup(group: PresetQueryGroup): QueryNode | null {
  const ruleNodes = group.rules.map((rule) => {
    const node = term(toSearchTerm(rule));
    return rule.negate ? not(node) : node;
  });

  if (ruleNodes.length === 0) {
    return null;
  }

  return ruleNodes.length === 1 ? ruleNodes[0] : and(...ruleNodes);
}

/**
 * Compiles a preset (groups OR'd together, each group's rules ANDed
 * together) to the exact Pokemon GO search-bar string, reusing the same
 * QueryNode engine/serializer SearchStringService is built on. Returns null
 * for an empty preset (no groups, or every group empty), matching
 * SearchQueryBuilder.build()'s existing null-on-empty convention.
 */
export function compilePresetQuery(preset: PresetQuery): string | null {
  const groupNodes = preset.groups
    .map(compileGroup)
    .filter((node): node is QueryNode => node !== null);

  if (groupNodes.length === 0) {
    return null;
  }

  const rootNode = groupNodes.length === 1 ? groupNodes[0] : or(...groupNodes);

  return serializeQuery(rootNode);
}
