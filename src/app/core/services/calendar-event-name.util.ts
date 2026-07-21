/**
 * Ported from pogo-cal's src/utils/eventName.ts, minus getSmartGroupDisplayName
 * ("group similar events" is resolved deferred for this port).
 */
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/** Decodes HTML entities in a string to their corresponding characters. */
export function decodeHtmlEntities(text: string): string {
  if (!text) {
    return text;
  }

  let decoded = text;

  for (const [entity, character] of Object.entries(HTML_ENTITIES)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), character);
  }

  decoded = decoded.replace(/&#(\d+);/g, (_, dec: string) =>
    String.fromCharCode(parseInt(dec, 10))
  );
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  return decoded;
}

/** Removes a "Pokémon "/"Pokemon " prefix from event names. */
function removePokemonGoPrefix(text: string): string {
  return text.replace(/^(pokémon |pokemon )/i, '');
}

export function formatEventName(text: string): string {
  return removePokemonGoPrefix(decodeHtmlEntities(text));
}
