import { SUPER_MEGA_SHIELD_COUNTS } from './super-mega-shields.constant';

/** Ported from pogo-cal's src/utils/superMegaShields.ts. Looks up the shield count for a Super
 * Mega Raid boss by name, with or without a "Mega" prefix. */
export function getSuperMegaShieldCount(pokemonName: string): number | undefined {
  const normalized = pokemonName
    .trim()
    .toLowerCase()
    .replace(/^mega\s+/, '');
  const shieldCounts: Partial<Record<string, number>> = SUPER_MEGA_SHIELD_COUNTS;
  return shieldCounts[normalized];
}
