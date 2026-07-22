import { PokemonBoss } from '@go-gather/shared';
import {
  buildRaidTierGroupsWithImages,
  buildTierGroupsFromBosses,
  sortTierLabel,
} from './raid-tier-groups.util';

function makeBoss(overrides: Partial<PokemonBoss> = {}): PokemonBoss {
  return {
    name: 'Machamp',
    image: 'https://example.com/machamp.png',
    ...overrides,
  } as PokemonBoss;
}

describe('sortTierLabel', () => {
  it('puts Super Mega first regardless of the other label', () => {
    expect(sortTierLabel('Super Mega', 'Tier 5')).toBeLessThan(0);
    expect(sortTierLabel('Tier 5', 'Super Mega')).toBeGreaterThan(0);
  });

  it('is case/whitespace-insensitive for Super Mega detection', () => {
    expect(sortTierLabel(' super mega ', 'Tier 1')).toBeLessThan(0);
  });

  it('sorts Tier N labels descending by N', () => {
    expect(sortTierLabel('Tier 5', 'Tier 1')).toBeLessThan(0);
    expect(sortTierLabel('Tier 1', 'Tier 5')).toBeGreaterThan(0);
  });

  it('puts a Tier-labeled group before a non-tier, non-Super-Mega label', () => {
    expect(sortTierLabel('Tier 3', 'Other')).toBeLessThan(0);
    expect(sortTierLabel('Other', 'Tier 3')).toBeGreaterThan(0);
  });

  it('falls back to alphabetical for two non-tier, non-Super-Mega labels', () => {
    expect(sortTierLabel('Alpha', 'Beta')).toBeLessThan(0);
    expect(sortTierLabel('Beta', 'Alpha')).toBeGreaterThan(0);
  });
});

describe('buildTierGroupsFromBosses', () => {
  it('returns undefined for undefined input', () => {
    expect(buildTierGroupsFromBosses(undefined)).toBeUndefined();
  });

  it('returns undefined for an empty array', () => {
    expect(buildTierGroupsFromBosses([])).toBeUndefined();
  });

  it('groups bosses by raidType and sorts groups via sortTierLabel', () => {
    const bosses = [
      makeBoss({ name: 'Regirock', raidType: 'Tier 3' }),
      makeBoss({ name: 'Mewtwo', raidType: 'Tier 5' }),
      makeBoss({ name: 'Dragonite', raidType: 'Super Mega' }),
    ];
    const groups = buildTierGroupsFromBosses(bosses);
    expect(groups?.map((g) => g.label)).toEqual(['Super Mega', 'Tier 5', 'Tier 3']);
  });

  it('defaults a missing raidType to "Other"', () => {
    const groups = buildTierGroupsFromBosses([makeBoss({ raidType: undefined })]);
    expect(groups).toEqual([{ label: 'Other', bosses: [makeBoss({ raidType: undefined })] }]);
  });

  it('groups multiple bosses sharing the same raidType together', () => {
    const bosses = [
      makeBoss({ name: 'A', raidType: 'Tier 1' }),
      makeBoss({ name: 'B', raidType: 'Tier 1' }),
    ];
    const groups = buildTierGroupsFromBosses(bosses);
    expect(groups).toHaveLength(1);
    expect(groups?.[0].bosses.map((b) => b.name)).toEqual(['A', 'B']);
  });
});

describe('buildRaidTierGroupsWithImages', () => {
  it('returns null for undefined input', () => {
    expect(buildRaidTierGroupsWithImages(undefined)).toBeNull();
  });

  it('returns null for an empty array', () => {
    expect(buildRaidTierGroupsWithImages([])).toBeNull();
  });

  it('hides the label when there is exactly one "Other" group', () => {
    const groups = buildRaidTierGroupsWithImages([{ label: 'Other', bosses: [makeBoss()] }]);
    expect(groups?.[0].showLabel).toBe(false);
  });

  it('shows the label when there are multiple groups', () => {
    const groups = buildRaidTierGroupsWithImages([
      { label: 'Tier 1', bosses: [makeBoss()] },
      { label: 'Tier 3', bosses: [makeBoss()] },
    ]);
    expect(groups?.every((g) => g.showLabel)).toBe(true);
  });

  it('shows the label for a single non-Other group', () => {
    const groups = buildRaidTierGroupsWithImages([{ label: 'Tier 5', bosses: [makeBoss()] }]);
    expect(groups?.[0].showLabel).toBe(true);
  });

  it('prefers the boss-provided image over a generated static sprite', () => {
    const groups = buildRaidTierGroupsWithImages([
      { label: 'Tier 3', bosses: [{ name: 'Machamp', image: 'https://example.com/machamp.png' }] },
    ]);
    expect(groups?.[0].images[0]).toEqual({
      name: 'Machamp',
      imageUrl: 'https://example.com/machamp.png',
      fallbackImageUrl: 'https://example.com/machamp.png',
      shieldCount: undefined,
    });
  });

  it('falls back to a generated static sprite when the boss image is nullish', () => {
    const groups = buildRaidTierGroupsWithImages([
      { label: 'Tier 3', bosses: [{ name: 'Machamp', image: undefined as unknown as string }] },
    ]);
    expect(groups?.[0].images[0].imageUrl).toContain('machamp');
    expect(groups?.[0].images[0].fallbackImageUrl).toBeNull();
  });

  it('stamps a shield count only for the Super Mega group', () => {
    const groups = buildRaidTierGroupsWithImages([
      { label: 'Super Mega', bosses: [{ name: 'Dragonite', image: 'x.png' }] },
    ]);
    expect(groups?.[0].images[0].shieldCount).toBe(10);
  });

  it('does not stamp a shield count for a non-Super-Mega group even for a known boss name', () => {
    const groups = buildRaidTierGroupsWithImages([
      { label: 'Tier 5', bosses: [{ name: 'Dragonite', image: 'x.png' }] },
    ]);
    expect(groups?.[0].images[0].shieldCount).toBeUndefined();
  });
});
