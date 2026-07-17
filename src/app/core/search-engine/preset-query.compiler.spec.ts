import type { PresetQuery, PresetQueryRule } from '@go-gather/shared';
import { compilePresetQuery } from './preset-query.compiler';

function makeRule(overrides: Partial<PresetQueryRule> = {}): PresetQueryRule {
  return {
    id: 'rule-1',
    term: { kind: 'keyword', value: 'shiny' },
    negate: false,
    ...overrides,
  };
}

function makePreset(overrides: Partial<PresetQuery> = {}): PresetQuery {
  return {
    id: 'preset-1',
    name: 'Test Preset',
    groups: [],
    ...overrides,
  };
}

describe('compilePresetQuery', () => {
  it('returns null for a preset with no groups', () => {
    expect(compilePresetQuery(makePreset())).toBeNull();
  });

  it('returns null when every group has zero rules', () => {
    const preset = makePreset({
      groups: [
        { id: 'group-1', rules: [] },
        { id: 'group-2', rules: [] },
      ],
    });

    expect(compilePresetQuery(preset)).toBeNull();
  });

  it('compiles a single group with a single rule directly, with no extra wrapping', () => {
    const preset = makePreset({
      groups: [{ id: 'group-1', rules: [makeRule()] }],
    });

    expect(compilePresetQuery(preset)).toBe('shiny');
  });

  it('ANDs multiple rules within a group', () => {
    const preset = makePreset({
      groups: [
        {
          id: 'group-1',
          rules: [
            makeRule({ term: { kind: 'keyword', value: 'shiny' } }),
            makeRule({ id: 'rule-2', term: { kind: 'keyword', value: 'legendary' } }),
          ],
        },
      ],
    });

    expect(compilePresetQuery(preset)).toBe('shiny&legendary');
  });

  it('negates a rule marked negate: true', () => {
    const preset = makePreset({
      groups: [
        {
          id: 'group-1',
          rules: [makeRule({ term: { kind: 'keyword', value: 'costume' }, negate: true })],
        },
      ],
    });

    expect(compilePresetQuery(preset)).toBe('!costume');
  });

  it('ORs multiple groups together', () => {
    const preset = makePreset({
      groups: [
        { id: 'group-1', rules: [makeRule({ term: { kind: 'name', value: 'pikachu' } })] },
        {
          id: 'group-2',
          rules: [makeRule({ id: 'rule-2', term: { kind: 'name', value: 'raichu' } })],
        },
      ],
    });

    expect(compilePresetQuery(preset)).toBe('pikachu,raichu');
  });

  it('filters out empty groups without stray OR wrapping when only one group survives', () => {
    const preset = makePreset({
      groups: [
        { id: 'group-1', rules: [] },
        { id: 'group-2', rules: [makeRule({ term: { kind: 'name', value: 'pikachu' } })] },
      ],
    });

    expect(compilePresetQuery(preset)).toBe('pikachu');
  });
});
