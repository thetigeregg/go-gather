import { PogoEvent } from '@go-gather/shared';
import { formatEventName } from './calendar-event-name.util';
import { getRaidSubType } from './calendar-event-subtype.util';

/**
 * Ported from pogo-cal's src/utils/eventPokemonNames.ts. Pure title/string
 * parsing — no sprite-URL resolution here, that's
 * pokemon-sprite-mapper.util.ts/event-sprite-url.util.ts.
 */

/** Parse multiple Pokemon names from event title text separated by commas and "and".
 * Examples: "Mega Latias and Mega Latios" → ["Mega Latias", "Mega Latios"]
 *           "Pokemon A, Pokemon B, and Pokemon C" → ["Pokemon A", "Pokemon B", "Pokemon C"]
 *           "Genesect (Burn Drive), Genesect (Chill Drive)" → ["Genesect (Burn Drive)", "Genesect (Chill Drive)"] */
export function parseEventPokemonNames(pokemonString: string): string[] {
  const pokemonFormParenthesesMatch = pokemonString.match(
    /^(.+?)\s+\((.+?)\s+&\s+(.+?)\s+forme?\)$/i
  );
  if (pokemonFormParenthesesMatch) {
    const baseName = pokemonFormParenthesesMatch[1].trim();
    const form1 = pokemonFormParenthesesMatch[2].trim();
    const form2 = pokemonFormParenthesesMatch[3].trim();
    return [`${baseName} (${form1} Forme)`, `${baseName} (${form2} Forme)`];
  }

  const pokemonNames: string[] = [];
  const commaParts = pokemonString.split(',').map((part) => part.trim());

  if (commaParts.length > 1) {
    for (let i = 0; i < commaParts.length; i++) {
      let part = commaParts[i];

      if (part.toLowerCase().startsWith('and ')) {
        part = part.substring(4).trim();
      }

      if (i === commaParts.length - 1 && part.includes(' and ')) {
        const andParts = part.split(' and ').map((p) => p.trim());
        pokemonNames.push(...andParts);
      } else {
        pokemonNames.push(part);
      }
    }
  } else if (pokemonString.includes(' and ')) {
    const andParts = pokemonString.split(' and ').map((p) => p.trim());
    pokemonNames.push(...andParts);
  } else {
    pokemonNames.push(pokemonString);
  }

  return pokemonNames.filter((name) => name.length > 0);
}

export function extractPokemonNamesFromRaidHour(eventName: string): string[] {
  const decodedEventName = formatEventName(eventName);

  const match = decodedEventName.match(/^(.+?)\s+Raid\s+Hour$/i);
  if (!match) {
    return [];
  }

  return parseEventPokemonNames(match[1].trim());
}

export function extractPokemonNameFromMaxMonday(eventName: string): string | null {
  const match = eventName.match(/^Dynamax\s+(.+?)\s+during\s+Max\s+Monday$/i);
  return match ? match[1].trim() : null;
}

/** Single source of truth for the max-battle title patterns. Returns the captured Pokemon name
 * (e.g. "Toxtricity Low Key") for a matching title, else null. */
export function parseGigantamaxMaxBattleName(eventName: string): string | null {
  const match = eventName.match(/^Gigantamax\s+(.+?)\s+Max\s+Battle\s+(?:Day|Weekend)$/i);
  return match ? match[1].trim() : null;
}

export function parseDynamaxMaxBattleName(eventName: string): string | null {
  const match = eventName.match(/^Dynamax\s+(.+?)\s+Max\s+Battle\s+(?:Weekend|Day)$/i);
  return match ? match[1].trim() : null;
}

export function extractPokemonNamesFromSpotlightHour(eventName: string): string[] {
  const decodedEventName = formatEventName(eventName);

  const match = decodedEventName.match(/^(.+?)\s+Spotlight\s+Hour$/i);
  if (!match) {
    return [];
  }

  return parseEventPokemonNames(match[1].trim());
}

/** Uses getRaidSubType to determine the format, then applies the matching regex pattern. */
export function extractPokemonNameFromRaidBattle(event: PogoEvent): string | null {
  const subType = getRaidSubType(event);
  const eventName = formatEventName(event.name);

  switch (subType) {
    case 'shadow-raids': {
      const inShadowRaids = eventName.match(/^Shadow\s+(.+?)\s+in\s+Shadow\s+Raids$/i);
      if (inShadowRaids) {
        return inShadowRaids[1].trim();
      }

      const raidWeekend = eventName.match(/^Shadow\s+(.+?)\s+Raid\s+Weekend$/i);
      return raidWeekend ? raidWeekend[1].trim() : null;
    }
    case 'super-mega-raids': {
      const match = eventName.match(/^Mega\s+(.+?)\s+in\s+Super\s+Mega\s+Raids$/i);
      return match ? match[1].trim() : null;
    }
    case 'mega-raids': {
      const match = eventName.match(/^Mega\s+(.+?)\s+in\s+Mega\s+Raids$/i);
      return match ? match[1].trim() : null;
    }
    case 'primal-raids': {
      const match = eventName.match(/^Primal\s+(.+?)\s+in\s+Primal\s+Raids$/i);
      return match ? match[1].trim() : null;
    }
    case 'raid-battles':
    case 'raid-weekend': {
      const raidBattles = eventName.match(/^(.+?)\s+in\s+(\d+)-star\s+Raid\s+battles$/i);
      if (raidBattles) {
        return raidBattles[1].trim();
      }

      const raidWeekend = eventName.match(/^(.+?)\s+(?:Fusion\s+)?Raid\s+Weekend$/i);
      return raidWeekend ? raidWeekend[1].trim() : null;
    }
    default:
      return null;
  }
}

/** Maps a regional-form prefix word to its sprite-slug suffix (irregular: Alolan/Paldean are abbreviated). */
const REGIONAL_FORM_SUFFIXES: Record<string, string> = {
  alolan: 'alola',
  galarian: 'galarian',
  hisuian: 'hisuian',
  paldean: 'paldea',
};

export function parsePokemonNameAndSuffix(
  pokemonNameString: string
): { pokemonName: string; suffix?: string } | null {
  const megaXYMatch = pokemonNameString.match(/^Mega\s+(.+?)\s+([XY])$/i);
  if (megaXYMatch) {
    const baseName = megaXYMatch[1].trim();
    const variant = megaXYMatch[2].toUpperCase();
    return { pokemonName: baseName, suffix: variant === 'X' ? '-megax' : '-megay' };
  }

  const megaMatch = pokemonNameString.match(/^Mega\s+(.+)$/i);
  if (megaMatch) {
    return { pokemonName: megaMatch[1].trim(), suffix: '-mega' };
  }

  const primalMatch = pokemonNameString.match(/^Primal\s+(.+)$/i);
  if (primalMatch) {
    return { pokemonName: primalMatch[1].trim(), suffix: '-primal' };
  }

  const shadowMatch = pokemonNameString.match(/^Shadow\s+(.+)$/i);
  if (shadowMatch) {
    return { pokemonName: shadowMatch[1].trim() };
  }

  const regionalMatch = pokemonNameString.match(/^(Alolan|Galarian|Hisuian|Paldean)\s+(.+)$/i);
  if (regionalMatch) {
    const baseName = regionalMatch[2].trim();
    return {
      pokemonName: baseName,
      suffix: `-${REGIONAL_FORM_SUFFIXES[regionalMatch[1].toLowerCase()]}`,
    };
  }

  const formeMatch = pokemonNameString.match(
    /^(Therian|Incarnate|Origin|Altered|Sky|Land|Attack|Defense|Speed)\s+Forme?\s+(.+)$/i
  );
  if (formeMatch) {
    const formeName = formeMatch[1].trim().toLowerCase();
    const baseName = formeMatch[2].trim();
    return { pokemonName: baseName, suffix: `-${formeName}` };
  }

  const pokemonFormMatch = pokemonNameString.match(/^(.+?)\s+\((.+?)(?:\s+forme?)?\)$/i);
  if (pokemonFormMatch) {
    const baseName = pokemonFormMatch[1].trim();
    let pokemonFormName = pokemonFormMatch[2].trim().toLowerCase();

    if (baseName.toLowerCase() === 'deoxys' && pokemonFormName === 'normal') {
      return { pokemonName: baseName };
    }

    if (baseName.toLowerCase() === 'genesect' && pokemonFormName.endsWith(' drive')) {
      pokemonFormName = pokemonFormName.replace(/\s+drive$/i, '');
    }

    const FORM_NAME_OVERRIDES: Record<string, string> = {
      'dawn wings': 'dawnwings',
      'dusk mane': 'duskmane',
      'hero of many battles': 'hero',
      'crowned sword': 'crownedsword',
      'crowned shield': 'crownedshield',
    };
    pokemonFormName =
      FORM_NAME_OVERRIDES[pokemonFormName] ?? pokemonFormName.replace(/[^a-z0-9]+/g, '-');

    return { pokemonName: baseName, suffix: `-${pokemonFormName}` };
  }

  if (pokemonNameString.toLowerCase().trim() === 'genesect') {
    return { pokemonName: 'Genesect', suffix: '-normal' };
  }

  return { pokemonName: pokemonNameString.trim() };
}
