import { QueryNode, SearchTerm, and, not, or, term } from './search-query.model';
import { serializeQuery } from './search-query.serializer';

/**
 * Fluent builder for the common case: a flat AND of terms (each optionally
 * negated), e.g. `!shiny&+pikachu&male&!costume`. Wraps the QueryNode engine
 * so call sites don't need to construct nodes by hand for straightforward
 * queries — for OR/grouped queries, build a QueryNode directly instead.
 */
export class SearchQueryBuilder {
  private nodes: QueryNode[] = [];

  add(searchTerm: SearchTerm): this {
    this.nodes.push(term(searchTerm));
    return this;
  }

  addNegated(searchTerm: SearchTerm): this {
    this.nodes.push(not(term(searchTerm)));
    return this;
  }

  /** Appends a fully-formed node (e.g. an `or(...)` group) as-is. */
  addNode(node: QueryNode): this {
    this.nodes.push(node);
    return this;
  }

  isEmpty(): boolean {
    return this.nodes.length === 0;
  }

  /** Returns null when no terms were added, so call sites can treat an empty
   * query the same way they already treat "no matching entries" — as
   * nothing to render — instead of emitting a blank string. */
  build(): string | null {
    if (this.isEmpty()) {
      return null;
    }

    return serializeQuery(and(...this.nodes));
  }
}

export { and, or, not, term, serializeQuery };
export type { QueryNode, SearchTerm };
