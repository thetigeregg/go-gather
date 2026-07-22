import { PokemonBoss } from '@go-gather/shared';
import { parsePokemonNameAndSuffix } from './event-pokemon-names.util';
import { PokemonImageData } from './event-sprite-url.util';
import { getPokemonSpriteUrl } from './pokemon-sprite-mapper.util';
import { getSuperMegaShieldCount } from './super-mega-shields.util';

/**
 * Ported from pogo-cal's src/utils/raidTierGroups.ts — static-sprite path
 * only. Source's `useAnimated` option/branch is dropped entirely (not just
 * defaulted off) per the static-only decision, matching event-sprite-url.util.ts.
 */

interface TierGroupBoss {
  name: string;
  image: string;
}

interface TierGroupInput {
  label: string;
  bosses: TierGroupBoss[];
}

/** Orders raid tier labels: "Super Mega" first, then "Tier N" descending, then alphabetical. */
export function sortTierLabel(a: string, b: string): number {
  const normalizedA = a.trim().toLowerCase();
  const normalizedB = b.trim().toLowerCase();

  if (normalizedA === 'super mega' && normalizedB !== 'super mega') return -1;
  if (normalizedB === 'super mega' && normalizedA !== 'super mega') return 1;

  const tierA = a.match(/^Tier (\d+)$/i);
  const tierB = b.match(/^Tier (\d+)$/i);
  if (tierA && tierB) return parseInt(tierB[1], 10) - parseInt(tierA[1], 10);
  if (tierA) return -1;
  if (tierB) return 1;

  return a.localeCompare(b);
}

/** Groups bosses by their `raidType` (defaulting to "Other"), sorted via {@link sortTierLabel}. */
export function buildTierGroupsFromBosses(
  bosses: PokemonBoss[] | undefined
): { label: string; bosses: PokemonBoss[] }[] | undefined {
  if (!bosses || bosses.length === 0) {
    return undefined;
  }

  const tierMap = new Map<string, PokemonBoss[]>();
  bosses.forEach((boss) => {
    const label = boss.raidType || 'Other';
    if (!tierMap.has(label)) {
      tierMap.set(label, []);
    }
    const group = tierMap.get(label);
    group?.push(boss);
  });

  return Array.from(tierMap.entries())
    .sort(([a], [b]) => sortTierLabel(a, b))
    .map(([label, groupedBosses]) => ({
      label,
      bosses: groupedBosses,
    }));
}

export interface RaidTierGroupWithImages {
  label: string;
  showLabel: boolean;
  images: PokemonImageData[];
}

export function buildRaidTierGroupsWithImages(
  groups: TierGroupInput[] | undefined
): RaidTierGroupWithImages[] | null {
  if (!groups || groups.length === 0) return null;

  const shouldHideOtherLabel = groups.length === 1 && groups[0].label === 'Other';

  return groups.map((group) => {
    const isSuperMega = group.label === 'Super Mega';
    return {
      label: group.label,
      showLabel: !shouldHideOtherLabel,
      images: group.bosses.map((boss) => {
        const parsed = parsePokemonNameAndSuffix(boss.name);
        // Source's `hasExactSpriteForm` check here only gated its animated-sprite
        // branch (`generatedUrl = hasRealForm ? getPokemonAnimatedUrl(...) : null`).
        // With the animated path dropped entirely (static-only scope), that
        // generated URL is always null, so this always falls through to the
        // event-provided image, then the un-suffixed base static sprite.
        // parsePokemonNameAndSuffix never actually returns null in the current
        // implementation (kept `| null` for API-shape parity with source) —
        // this ternary's else branch is not expected to trigger.
        const imageUrl = boss.image || (parsed ? getPokemonSpriteUrl(parsed.pokemonName) : null);

        return {
          name: boss.name,
          imageUrl,
          fallbackImageUrl: boss.image || null,
          shieldCount: isSuperMega ? getSuperMegaShieldCount(boss.name) : undefined,
        } satisfies PokemonImageData;
      }),
    };
  });
}
