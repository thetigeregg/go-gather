import { and, not, or, term } from './search-query.model';
import { serializeQuery } from './search-query.serializer';

describe('serializeQuery', () => {
  describe('per-term-kind serialization', () => {
    it('name serializes as a bare value', () => {
      expect(serializeQuery(term({ kind: 'name', value: 'Pikachu' }))).toBe('Pikachu');
    });

    it('family serializes with a + prefix', () => {
      expect(serializeQuery(term({ kind: 'family', value: 'Pikachu' }))).toBe('+Pikachu');
    });

    it('nickname serializes as a bare value', () => {
      expect(serializeQuery(term({ kind: 'nickname', value: 'Sparky' }))).toBe('Sparky');
    });

    it('tag serializes with a # prefix', () => {
      expect(serializeQuery(term({ kind: 'tag', value: 'Trade' }))).toBe('#Trade');
    });

    it('hasTag serializes as a bare #', () => {
      expect(serializeQuery(term({ kind: 'hasTag' }))).toBe('#');
    });

    it('region serializes as a bare value', () => {
      expect(serializeQuery(term({ kind: 'region', value: 'kanto' }))).toBe('kanto');
    });

    it('keyword serializes as a bare value', () => {
      expect(serializeQuery(term({ kind: 'keyword', value: 'shiny' }))).toBe('shiny');
    });

    it('type serializes as a bare value', () => {
      expect(serializeQuery(term({ kind: 'type', value: 'fire' }))).toBe('fire');
    });

    it('gender serializes as a bare value', () => {
      expect(serializeQuery(term({ kind: 'gender', value: 'male' }))).toBe('male');
    });

    it('size serializes as a bare value', () => {
      expect(serializeQuery(term({ kind: 'size', value: 'xxl' }))).toBe('xxl');
    });

    it('raidOrigin serializes as a bare value', () => {
      expect(serializeQuery(term({ kind: 'raidOrigin', value: 'megaraid' }))).toBe('megaraid');
    });

    it('move serializes with an @ prefix', () => {
      expect(serializeQuery(term({ kind: 'move', value: 'Thunderbolt' }))).toBe('@Thunderbolt');
    });

    it('moveType serializes with an @ prefix', () => {
      expect(serializeQuery(term({ kind: 'moveType', value: 'electric' }))).toBe('@electric');
    });

    it('fastMoveType serializes with an @1 prefix', () => {
      expect(serializeQuery(term({ kind: 'fastMoveType', value: 'electric' }))).toBe('@1electric');
    });

    it('chargedMoveType serializes with an @2 prefix', () => {
      expect(serializeQuery(term({ kind: 'chargedMoveType', value: 'electric' }))).toBe(
        '@2electric'
      );
    });

    it('secondChargedMoveType serializes with an @3 prefix', () => {
      expect(serializeQuery(term({ kind: 'secondChargedMoveType', value: 'electric' }))).toBe(
        '@3electric'
      );
    });

    it('weather serializes as the literal @weather', () => {
      expect(serializeQuery(term({ kind: 'weather' }))).toBe('@weather');
    });

    it('special serializes as the literal @special', () => {
      expect(serializeQuery(term({ kind: 'special' }))).toBe('@special');
    });

    it('weakAgainst serializes with a < prefix', () => {
      expect(serializeQuery(term({ kind: 'weakAgainst', value: 'water' }))).toBe('<water');
    });

    it('superEffectiveAgainst serializes with a > prefix', () => {
      expect(serializeQuery(term({ kind: 'superEffectiveAgainst', value: 'water' }))).toBe(
        '>water'
      );
    });

    it('statRating serializes as value + field suffix', () => {
      expect(serializeQuery(term({ kind: 'statRating', field: 'hp', value: 4 }))).toBe('4hp');
      expect(serializeQuery(term({ kind: 'statRating', field: 'attack', value: 0 }))).toBe(
        '0attack'
      );
      expect(serializeQuery(term({ kind: 'statRating', field: 'defense', value: 2 }))).toBe(
        '2defense'
      );
    });

    it('appraisalStars serializes as value + *', () => {
      expect(serializeQuery(term({ kind: 'appraisalStars', value: 4 }))).toBe('4*');
    });

    it('buddyLevel serializes with a buddy prefix', () => {
      expect(serializeQuery(term({ kind: 'buddyLevel', value: 3 }))).toBe('buddy3');
    });

    it('megaLevel serializes with a mega prefix', () => {
      expect(serializeQuery(term({ kind: 'megaLevel', value: 2 }))).toBe('mega2');
    });

    it('raw serializes as a bare value', () => {
      expect(serializeQuery(term({ kind: 'raw', value: 'anything goes' }))).toBe('anything goes');
    });
  });

  describe('numeric field prefixes and range serialization', () => {
    it('serializes each numeric field prefix, with dex as the empty-prefix case', () => {
      expect(serializeQuery(term({ kind: 'numeric', field: 'cp', value: 1500 }))).toBe('cp1500');
      expect(serializeQuery(term({ kind: 'numeric', field: 'hp', value: 100 }))).toBe('hp100');
      expect(serializeQuery(term({ kind: 'numeric', field: 'age', value: 5 }))).toBe('age5');
      expect(serializeQuery(term({ kind: 'numeric', field: 'dex', value: 25 }))).toBe('25');
      expect(serializeQuery(term({ kind: 'numeric', field: 'distance', value: 10 }))).toBe(
        'distance10'
      );
      expect(serializeQuery(term({ kind: 'numeric', field: 'year', value: 2026 }))).toBe(
        'year2026'
      );
      expect(serializeQuery(term({ kind: 'numeric', field: 'candykm', value: 5 }))).toBe(
        'candykm5'
      );
      expect(serializeQuery(term({ kind: 'numeric', field: 'maxmove', value: 3 }))).toBe(
        'maxmove3'
      );
      expect(serializeQuery(term({ kind: 'numeric', field: 'maxguard', value: 2 }))).toBe(
        'maxguard2'
      );
      expect(serializeQuery(term({ kind: 'numeric', field: 'maxspirit', value: 1 }))).toBe(
        'maxspirit1'
      );
    });

    it('serializes a bare numeric value as-is', () => {
      expect(serializeQuery(term({ kind: 'numeric', field: 'cp', value: 1500 }))).toBe('cp1500');
    });

    it('serializes a min-max range', () => {
      expect(
        serializeQuery(term({ kind: 'numeric', field: 'cp', value: { min: 10, max: 50 } }))
      ).toBe('cp10-50');
    });

    it('serializes a min-only range', () => {
      expect(serializeQuery(term({ kind: 'numeric', field: 'cp', value: { min: 10 } }))).toBe(
        'cp10-'
      );
    });

    it('serializes a max-only range', () => {
      expect(serializeQuery(term({ kind: 'numeric', field: 'cp', value: { max: 50 } }))).toBe(
        'cp-50'
      );
    });

    it('throws when a numeric range has neither min nor max', () => {
      expect(() => serializeQuery(term({ kind: 'numeric', field: 'cp', value: {} }))).toThrow(
        'Numeric range must specify at least one of min/max.'
      );
    });
  });

  describe('combinators', () => {
    it('joins AND nodes with &', () => {
      const node = and(
        term({ kind: 'keyword', value: 'shiny' }),
        term({ kind: 'keyword', value: 'legendary' })
      );
      expect(serializeQuery(node)).toBe('shiny&legendary');
    });

    it('joins OR nodes with ,', () => {
      const node = or(
        term({ kind: 'name', value: 'pikachu' }),
        term({ kind: 'name', value: 'raichu' })
      );
      expect(serializeQuery(node)).toBe('pikachu,raichu');
    });

    it('prefixes NOT with !', () => {
      const node = not(term({ kind: 'keyword', value: 'costume' }));
      expect(serializeQuery(node)).toBe('!costume');
    });

    it('throws when NOT wraps an OR node', () => {
      const node = not(
        or(term({ kind: 'name', value: 'pikachu' }), term({ kind: 'name', value: 'raichu' }))
      );
      expect(() => serializeQuery(node)).toThrow(
        'Cannot serialize NOT wrapping an OR node: Pokemon GO search syntax has no grouping, so "!(a,b)" cannot be expressed. Negate each branch individually instead.'
      );
    });
  });

  describe('shared-filter-once-around-OR-group (regression, doc-verified worked example)', () => {
    it('applies a shared AND filter set once around the whole OR group', () => {
      const node = and(
        not(term({ kind: 'keyword', value: 'shiny' })),
        or(term({ kind: 'name', value: 'pikachu' }), term({ kind: 'name', value: 'raichu' })),
        not(term({ kind: 'keyword', value: 'costume' })),
        not(term({ kind: 'tag', value: 'Trade' }))
      );

      expect(serializeQuery(node)).toBe('!shiny&pikachu,raichu&!costume&!#Trade');
    });
  });
});
