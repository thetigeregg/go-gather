import { EventTypeKey, PogoEvent } from '@go-gather/shared';
import { formatEventName } from './calendar-event-name.util';
import { getRaidSubType } from './calendar-event-subtype.util';
import {
  extractPokemonNameFromMaxMonday,
  extractPokemonNameFromRaidBattle,
  extractPokemonNamesFromRaidHour,
  extractPokemonNamesFromSpotlightHour,
  parseDynamaxMaxBattleName,
  parseEventPokemonNames,
  parseGigantamaxMaxBattleName,
  parsePokemonNameAndSuffix,
} from './event-pokemon-names.util';
import {
  EventWithExtraData,
  getPokemonImagesFromBosses,
  getRaidBossesWithTierFallback,
  getSpriteImagesFromNames,
  getSpriteUrl,
  PokemonImageData,
  PokemonImageOptions,
  SPRITE_EFFECTS,
  SpriteEffect,
} from './event-sprite-url.util';
import {
  getGigantamaxSpriteUrl,
  getPokemonId,
  hasSplitMegaXYForms,
} from './pokemon-sprite-mapper.util';
import { getSuperMegaShieldCount } from './super-mega-shields.util';

/**
 * Ported from pogo-cal's src/utils/eventPokemon.ts (dispatcher) +
 * eventPokemonResolvers.ts (per-event-type resolvers) — static-sprite path
 * only. Faithfully includes the gap where event types with no resolver
 * entry (e.g. `elite-raids`) produce no sprite at all, matching source.
 */

/** Event-level sprite effect, derived from the event (not a caller-supplied display string). The
 * dispatcher applies this to resolved images that don't already carry a per-sprite effect.
 * Gigantamax is deliberately absent: it's asset-dependent per Pokemon, so `resolveMaxBattleImages`
 * stamps it per-sprite instead. */
export function getEventSpriteEffect(event: PogoEvent): SpriteEffect | undefined {
  if (getRaidSubType(event) === 'shadow-raids') {
    return SPRITE_EFFECTS.SHADOW;
  }
  if (event.eventType === 'max-mondays') {
    return SPRITE_EFFECTS.DYNAMAX;
  }
  if (event.eventType === 'max-battles' && parseDynamaxMaxBattleName(formatEventName(event.name))) {
    return SPRITE_EFFECTS.DYNAMAX;
  }
  return undefined;
}

const RAID_DAY_TITLE_EXCEPTIONS = new Set(['fashion raid day']);

/** Multi-form Gigantamax forms as they appear in titles (e.g. "Toxtricity Low Key",
 * "Urshifu (Rapid Strike Form)"). Capture group 1 is normalized to a slug for the sprite lookup. */
const GMAX_FORM_IN_TITLE =
  /[\s(]+(low[\s-]?key|single[\s-]?strike|rapid[\s-]?strike)[\s)]*(?:form)?[\s)]*/i;

/** Major events (GO Fest / GO Tour / Wild Area) and generic `event` type: raid schedule boss data
 * pre-mapped into raidbattles. */
export function resolveBossImages(
  event: EventWithExtraData,
  options?: PokemonImageOptions
): PokemonImageData[] | null {
  if (!event.extraData.raidbattles?.bosses.length) {
    return null;
  }
  const images = getPokemonImagesFromBosses(event, options);
  return images.length > 0 ? images : null;
}

/** Raid battles — check bosses data FIRST, then fall back to event name extraction, then LeekDuck images. */
export function resolveRaidBattleImages(
  event: EventWithExtraData,
  options?: PokemonImageOptions
): PokemonImageData[] | null {
  if (event.extraData.raidbattles?.bosses && event.extraData.raidbattles.bosses.length > 0) {
    const images = getPokemonImagesFromBosses(event, options);
    if (images.length > 0) {
      return images;
    }
  }

  const pokemonName = extractPokemonNameFromRaidBattle(event);
  if (pokemonName) {
    const raidSubType = getRaidSubType(event);
    const isMega = raidSubType === 'mega-raids' || raidSubType === 'super-mega-raids';
    const pokemonNames = parseEventPokemonNames(pokemonName);
    const images = getSpriteImagesFromNames(pokemonNames, options, isMega);

    if (images.length > 0) {
      if (raidSubType === 'super-mega-raids') {
        return images.map((image) => ({
          ...image,
          shieldCount: getSuperMegaShieldCount(image.name),
        }));
      }
      return images;
    }
  }

  // Not expected to trigger in practice: reaching here means bosses exist
  // but getPokemonImagesFromBosses above returned empty for them, which it
  // never does for a non-empty boss list. Kept for parity with source.
  if (event.extraData.raidbattles?.bosses) {
    const bosses = getRaidBossesWithTierFallback(event, options);
    if (bosses.length > 0) {
      return bosses.map((boss) => ({ name: boss.name, imageUrl: boss.image || null }));
    }
  }

  return null;
}

/** Raid-hour events — parse Pokemon names from title and generate sprite URLs. */
export function resolveRaidHourImages(
  event: EventWithExtraData,
  options?: PokemonImageOptions
): PokemonImageData[] | null {
  const pokemonNames = extractPokemonNamesFromRaidHour(formatEventName(event.name));
  if (pokemonNames.length === 0) {
    return null;
  }

  const images = getSpriteImagesFromNames(pokemonNames, options);
  return images.length > 0 ? images : null;
}

/** Raid-day events — prefer bosses data, then fall back to title parsing. */
export function resolveRaidDayImages(
  event: EventWithExtraData,
  options?: PokemonImageOptions
): PokemonImageData[] | null {
  if (event.extraData.raidbattles?.bosses && event.extraData.raidbattles.bosses.length > 0) {
    const images = getPokemonImagesFromBosses(event, options);
    if (images.length > 0) {
      return images;
    }
  }

  const eventName = formatEventName(event.name);
  if (RAID_DAY_TITLE_EXCEPTIONS.has(eventName.toLowerCase())) {
    return [];
  }

  const match = eventName.match(/^(.+?)\s+((?:Super\s+)?Mega\s+|Fusion\s+)?Raid\s+Day$/i);
  if (match) {
    const pokemonNameString = match[1].trim();
    // Capture group 2 is optional in the regex, so it's genuinely `string |
    // undefined` at runtime even though plain index access types it as
    // `string` — `.at()` types its result as possibly-undefined instead.
    const raidModifier = match.at(2)?.trim().toLowerCase() ?? '';

    if (
      pokemonNameString.toLowerCase() === 'shadow' ||
      pokemonNameString.toLowerCase() === 'raid'
    ) {
      return [];
    }

    const parsedData = parsePokemonNameAndSuffix(pokemonNameString);
    if (parsedData) {
      const isAmbiguousSplitForm =
        !parsedData.suffix && hasSplitMegaXYForms(parsedData.pokemonName);
      const isMegaModifier = raidModifier.includes('mega') && !isAmbiguousSplitForm;
      const suffix = parsedData.suffix ?? (isMegaModifier ? '-mega' : undefined);
      const spriteUrl = getSpriteUrl(parsedData.pokemonName, suffix, options);
      const displayName = isMegaModifier ? `Mega ${pokemonNameString}` : pokemonNameString;
      const shieldCount =
        isMegaModifier && raidModifier.includes('super mega')
          ? getSuperMegaShieldCount(displayName)
          : undefined;

      return [{ name: displayName, imageUrl: spriteUrl, shieldCount }];
    }
  }

  return null;
}

/** Max-mondays events — parse Pokemon name from title and generate sprite URL. */
export function resolveMaxMondayImages(
  event: EventWithExtraData,
  options?: PokemonImageOptions
): PokemonImageData[] | null {
  const pokemonName = extractPokemonNameFromMaxMonday(formatEventName(event.name));
  if (!pokemonName) {
    return null;
  }
  const spriteUrl = getSpriteUrl(pokemonName, undefined, options);
  return [{ name: pokemonName, imageUrl: spriteUrl }];
}

/** Spotlight hours (and spotlight sub-events) — prefer structured spotlight payloads, then title parsing. */
export function resolveSpotlightImages(
  event: EventWithExtraData,
  options?: PokemonImageOptions
): PokemonImageData[] | null {
  const images: PokemonImageData[] = [];

  const spotlight = event.extraData.spotlight;
  if (spotlight) {
    if (spotlight.list && spotlight.list.length > 0) {
      for (const pokemon of spotlight.list) {
        const spriteUrl = getSpriteUrl(pokemon.name, undefined, options, pokemon.image);
        images.push({ name: pokemon.name, imageUrl: spriteUrl });
      }
    } else if (spotlight.name) {
      const fallbackImage = spotlight.image || null;
      const spriteUrl = getSpriteUrl(spotlight.name, undefined, options, fallbackImage);
      images.push({ name: spotlight.name, imageUrl: spriteUrl });
    } else if (spotlight.image) {
      images.push({ name: 'Spotlight Pokemon', imageUrl: spotlight.image });
    }

    if (images.length > 0) {
      return images;
    }
  }

  const pokemonNames = extractPokemonNamesFromSpotlightHour(event.name);
  images.push(...getSpriteImagesFromNames(pokemonNames, options));

  return images.length > 0 ? images : null;
}

/** Community day events — prefer spawns data, then fall back to title parsing. */
export function resolveCommunityDayImages(
  event: EventWithExtraData,
  options?: PokemonImageOptions
): PokemonImageData[] | null {
  const spawns = event.extraData.communityday?.spawns;
  if (spawns) {
    const images: PokemonImageData[] = [];

    for (const spawn of spawns) {
      if (spawn.name) {
        const fallbackImage = spawn.image || null;
        const spriteUrl = getSpriteUrl(spawn.name, undefined, options, fallbackImage);
        images.push({ name: spawn.name, imageUrl: spriteUrl });
      }
    }

    if (images.length > 0) {
      return images;
    }
  }

  const eventName = formatEventName(event.name);
  const match = eventName.match(/^(.+?)\s+Community\s+Day$/i);
  if (!match) {
    return null;
  }

  const pokemonNames = parseEventPokemonNames(match[1].trim()).filter(
    (name) => getPokemonId(name) != null
  );
  if (pokemonNames.length === 0) {
    return null;
  }

  const images = getSpriteImagesFromNames(pokemonNames, options);
  return images.length > 0 ? images : null;
}

/** Resolve a single Gigantamax-named Pokemon to its sprite. Returns a Gmax sprite (stamped with the
 * `gigantamax` effect) when a Gmax asset exists for the Pokemon; otherwise falls back to the plain
 * sprite with no effect, so events naming a mix of Gmax and non-Gmax Pokemon render correctly. */
function resolveGigantamaxImage(
  pokemonName: string,
  options?: PokemonImageOptions
): PokemonImageData {
  const formMatch = pokemonName.match(GMAX_FORM_IN_TITLE);
  const formSlug = formMatch ? formMatch[1].toLowerCase().replace(/[\s-]+/g, '-') : undefined;
  const basePokemonName = formMatch
    ? pokemonName.replace(GMAX_FORM_IN_TITLE, '').trim()
    : pokemonName;

  const gmaxUrl = getGigantamaxSpriteUrl(basePokemonName, formSlug);
  if (gmaxUrl) {
    return {
      name: `Gigantamax ${pokemonName}`,
      imageUrl: gmaxUrl,
      effect: SPRITE_EFFECTS.GIGANTAMAX,
    };
  }

  const parsed = parsePokemonNameAndSuffix(pokemonName);
  const spriteUrl = parsed ? getSpriteUrl(parsed.pokemonName, parsed.suffix, options) : null;
  return { name: pokemonName, imageUrl: spriteUrl };
}

/** Max battles — Gigantamax/Dynamax title patterns, then the main event image. */
export function resolveMaxBattleImages(
  event: EventWithExtraData,
  options?: PokemonImageOptions
): PokemonImageData[] | null {
  const eventName = formatEventName(event.name);

  const gigantamaxName = parseGigantamaxMaxBattleName(eventName);
  if (gigantamaxName) {
    const images = parseEventPokemonNames(gigantamaxName).map((name) =>
      resolveGigantamaxImage(name, options)
    );
    if (images.length > 0) {
      return images;
    }
  }

  const dynamaxName = parseDynamaxMaxBattleName(eventName);
  if (dynamaxName) {
    const spriteUrl = getSpriteUrl(dynamaxName, undefined, options);
    return [{ name: dynamaxName, imageUrl: spriteUrl }];
  }

  if (event.image) {
    return [{ name: 'Max Battle', imageUrl: event.image }];
  }

  return null;
}

/** Pokestop showcases — parse Pokemon name(s) from title and generate sprite URLs. */
export function resolvePokestopShowcaseImages(
  event: EventWithExtraData,
  options?: PokemonImageOptions
): PokemonImageData[] | null {
  const eventName = formatEventName(event.name);

  const match = eventName.match(/^(.+?)\s+Pok[eé]Stop\s+Showcases?$/i);
  if (!match) {
    return null;
  }

  const pokemonNameString = match[1].trim();

  if (/(?:\w+-type|\s+type)\b/i.test(pokemonNameString)) {
    return [];
  }

  const pokemonNames = parseEventPokemonNames(pokemonNameString);
  return getSpriteImagesFromNames(pokemonNames, options);
}

function applyEventEffect(
  images: PokemonImageData[],
  effect: SpriteEffect | undefined
): PokemonImageData[] {
  if (!effect) {
    return images;
  }
  return images.map((image) => (image.effect ? image : { ...image, effect }));
}

type ImageResolver = (
  event: EventWithExtraData,
  options?: PokemonImageOptions
) => PokemonImageData[] | null;

const IMAGE_RESOLVERS: Partial<Record<EventTypeKey, ImageResolver>> = {
  'pokemon-go-fest': resolveBossImages,
  'pokemon-go-tour': resolveBossImages,
  'wild-area': resolveBossImages,
  'raid-battles': resolveRaidBattleImages,
  'raid-weekend': resolveRaidBattleImages,
  'raid-hour': resolveRaidHourImages,
  event: resolveBossImages,
  'raid-day': resolveRaidDayImages,
  'max-mondays': resolveMaxMondayImages,
  'pokemon-spotlight-hour': resolveSpotlightImages,
  'community-day': resolveCommunityDayImages,
  'max-battles': resolveMaxBattleImages,
  'pokestop-showcase': resolvePokestopShowcaseImages,
};

export function getEventPokemonImages(
  event: PogoEvent,
  options?: PokemonImageOptions
): PokemonImageData[] {
  const eventWithExtraData: EventWithExtraData = { ...event, extraData: event.extraData ?? {} };

  const effect = getEventSpriteEffect(event);
  const resolver = IMAGE_RESOLVERS[event.eventType];
  let result = resolver ? resolver(eventWithExtraData, options) : null;

  if (!result && eventWithExtraData.extraData.isSpotlightSubEvent) {
    result = resolveSpotlightImages(eventWithExtraData, options);
  }

  return result ? applyEventEffect(result, effect) : [];
}

export function hasEventPokemonImage(event: PogoEvent, options?: PokemonImageOptions): boolean {
  return getEventPokemonImages(event, options).length > 0;
}
