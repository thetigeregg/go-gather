import { PogoEvent, PokemonBoss } from '@go-gather/shared';
import { parsePokemonNameAndSuffix } from './event-pokemon-names.util';
import { getPokemonSpriteUrl, hasExactSpriteForm } from './pokemon-sprite-mapper.util';
import { getSuperMegaShieldCount } from './super-mega-shields.util';

/**
 * Ported from pogo-cal's src/utils/eventSprite.ts — static-sprite path
 * only. Source's `useAnimated` option/branch is dropped entirely (not just
 * defaulted off) per the static-only decision; there is no animated code
 * path in this port to opt into.
 */

export interface PokemonImageOptions {
  isMega?: boolean;
  excludeTiers?: string[];
}

export const SPRITE_EFFECTS = {
  DYNAMAX: 'dynamax',
  GIGANTAMAX: 'gigantamax',
  SHADOW: 'shadow',
} as const;

export type SpriteEffect = (typeof SPRITE_EFFECTS)[keyof typeof SPRITE_EFFECTS];

export interface PokemonImageData {
  name: string;
  imageUrl: string | null;
  fallbackImageUrl?: string | null;
  effect?: SpriteEffect;
  /** Number of shields this Super Mega Raid boss has (undefined for non-Super-Mega/unknown bosses). */
  shieldCount?: number;
}

/** A PogoEvent guaranteed to carry `extraData`. The entry point normalizes to this (defaulting a
 * missing/null `extraData` to `{}`) before dispatching, so resolvers can read `event.extraData.X`
 * without defensive optional chaining, and title-based fallback parsing still runs even with no data. */
export type EventWithExtraData = PogoEvent & { extraData: NonNullable<PogoEvent['extraData']> };

export function getSpriteUrl(
  pokemonName: string,
  suffix?: string,
  options?: PokemonImageOptions,
  fallbackUrl?: string | null
): string | null {
  const finalSuffix = suffix ?? (options?.isMega ? '-mega' : undefined);

  try {
    // getPokemonSpriteUrl is a pure lookup and never actually throws — this
    // try/catch is defensive, matching source, and not expected to trigger.
    const staticUrl = getPokemonSpriteUrl(pokemonName, finalSuffix);
    if (staticUrl) {
      return staticUrl;
    }
  } catch (error) {
    console.warn(`Failed to generate sprite for ${pokemonName}:`, error);
  }

  if (fallbackUrl) {
    return fallbackUrl;
  }

  return null;
}

export function getRaidBossesWithTierFallback(
  event: PogoEvent,
  options?: PokemonImageOptions
): readonly PokemonBoss[] {
  const allBosses = event.extraData?.raidbattles?.bosses;
  if (!allBosses || allBosses.length === 0) {
    return [];
  }

  if (!options?.excludeTiers || options.excludeTiers.length === 0) {
    return allBosses;
  }

  for (let i = options.excludeTiers.length; i >= 0; i--) {
    const activeExclusions = options.excludeTiers.slice(0, i);
    const filtered =
      activeExclusions.length > 0
        ? allBosses.filter((b) => !b.raidType || !activeExclusions.includes(b.raidType))
        : allBosses;
    if (filtered.length > 0) {
      return filtered;
    }
  }

  return allBosses;
}

export function getPokemonImagesFromBosses(
  event: PogoEvent,
  options?: PokemonImageOptions
): PokemonImageData[] {
  const bosses = getRaidBossesWithTierFallback(event, options);
  const images: PokemonImageData[] = [];

  for (const boss of bosses) {
    const parsedData = parsePokemonNameAndSuffix(boss.name);
    const shieldCount =
      boss.raidType === 'Super Mega' ? getSuperMegaShieldCount(boss.name) : undefined;

    if (parsedData) {
      const hasRealForm = hasExactSpriteForm(parsedData.pokemonName, parsedData.suffix);
      const spriteUrl = hasRealForm
        ? getSpriteUrl(parsedData.pokemonName, parsedData.suffix, options, boss.image)
        : boss.image || getSpriteUrl(parsedData.pokemonName, undefined, options, boss.image);

      images.push({
        name: boss.name,
        imageUrl: spriteUrl,
        fallbackImageUrl: boss.image || null,
        shieldCount,
      });
    } else {
      // parsePokemonNameAndSuffix never actually returns null in the current
      // implementation (kept `| null` for API-shape parity with source) —
      // this branch is not expected to trigger.
      images.push({
        name: boss.name,
        imageUrl: boss.image || null,
        fallbackImageUrl: boss.image || null,
        shieldCount,
      });
    }
  }

  return images;
}

export function getSpriteImagesFromNames(
  names: readonly string[],
  options?: PokemonImageOptions,
  megaFallback = false
): PokemonImageData[] {
  const images: PokemonImageData[] = [];

  for (const name of names) {
    const parsed = parsePokemonNameAndSuffix(name);
    if (!parsed) {
      // Not expected to trigger — see the note in getPokemonImagesFromBosses.
      continue;
    }

    const suffix = parsed.suffix ?? (megaFallback ? '-mega' : undefined);
    images.push({ name, imageUrl: getSpriteUrl(parsed.pokemonName, suffix, options) });
  }

  return images;
}
