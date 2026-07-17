/* eslint-disable @typescript-eslint/restrict-template-expressions -- ported
 * verbatim from go-gather-next (see docs/progress/phase-3-search-engine.md);
 * every interpolated value here is a known number/numeric-literal-union
 * field, not an actual type-safety risk. */
import {
  NumericField,
  NumericValue,
  QueryNode,
  SearchTerm,
  StatRatingField,
} from './search-query.model';

/**
 * Renders a `QueryNode` tree to the exact Pokemon GO search-bar syntax.
 *
 * The real search bar has no parentheses/grouping syntax, but `&`-joined
 * terms surrounding a `,`-joined OR group DO correctly apply to every
 * branch of that group — confirmed empirically against the live search
 * bar: `!shiny&pikachu,raichu&!costume&!#Trade` returns exactly the
 * Pikachu/Raichu family members that are non-shiny, non-costume, and
 * untagged #Trade (verified: 14 results, matching expectations), while the
 * fully-distributed equivalent (`!shiny&pikachu&!costume&!#Trade,!shiny&
 * raichu&!costume&!#Trade`) returns ZERO — repeating shared filters inside
 * each OR branch is not just redundant, it actively breaks the query. So
 * an `and` node may freely contain an `or` child: write each shared filter
 * ONCE around the whole OR group, never repeated per branch.
 */
export function serializeQuery(node: QueryNode): string {
  switch (node.kind) {
    case 'term':
      return serializeTerm(node.term);
    case 'not':
      if (node.node.kind === 'or') {
        throw new Error(
          'Cannot serialize NOT wrapping an OR node: Pokemon GO search syntax has no grouping, so "!(a,b)" cannot be expressed. Negate each branch individually instead.'
        );
      }
      return `!${serializeQuery(node.node)}`;
    case 'and':
      return node.nodes.map(serializeQuery).join('&');
    case 'or':
      return node.nodes.map(serializeQuery).join(',');
  }
}

function serializeNumericValue(value: NumericValue): string {
  if (typeof value === 'number') {
    return String(value);
  }

  const { min, max } = value;

  if (min !== undefined && max !== undefined) {
    return `${min}-${max}`;
  }

  if (min !== undefined) {
    return `${min}-`;
  }

  if (max !== undefined) {
    return `-${max}`;
  }

  throw new Error('Numeric range must specify at least one of min/max.');
}

const NUMERIC_FIELD_PREFIX: Record<NumericField, string> = {
  cp: 'cp',
  hp: 'hp',
  age: 'age',
  dex: '',
  distance: 'distance',
  year: 'year',
  candykm: 'candykm',
  maxmove: 'maxmove',
  maxguard: 'maxguard',
  maxspirit: 'maxspirit',
};

function serializeTerm(term: SearchTerm): string {
  switch (term.kind) {
    case 'name':
      return term.value;
    case 'family':
      return `+${term.value}`;
    case 'nickname':
      return term.value;
    case 'tag':
      return `#${term.value}`;
    case 'hasTag':
      return '#';
    case 'region':
      return term.value;
    case 'keyword':
      return term.value;
    case 'type':
      return term.value;
    case 'gender':
      return term.value;
    case 'size':
      return term.value;
    case 'raidOrigin':
      return term.value;
    case 'move':
      return `@${term.value}`;
    case 'moveType':
      return `@${term.value}`;
    case 'fastMoveType':
      return `@1${term.value}`;
    case 'chargedMoveType':
      return `@2${term.value}`;
    case 'secondChargedMoveType':
      return `@3${term.value}`;
    case 'weather':
      return '@weather';
    case 'special':
      return '@special';
    case 'weakAgainst':
      return `<${term.value}`;
    case 'superEffectiveAgainst':
      return `>${term.value}`;
    case 'numeric':
      return `${NUMERIC_FIELD_PREFIX[term.field]}${serializeNumericValue(term.value)}`;
    case 'statRating':
      return `${term.value}${STAT_RATING_FIELD_SUFFIX[term.field]}`;
    case 'appraisalStars':
      return `${term.value}*`;
    case 'buddyLevel':
      return `buddy${term.value}`;
    case 'megaLevel':
      return `mega${term.value}`;
    case 'raw':
      return term.value;
  }
}

const STAT_RATING_FIELD_SUFFIX: Record<StatRatingField, string> = {
  hp: 'hp',
  attack: 'attack',
  defense: 'defense',
};
