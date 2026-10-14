/**
 * Released Dynamax/Gigantamax Pokemon, read from Bulbapedia's
 * community-maintained Pokemon GO pages. Neither pokemon-go-api nor PokeAPI
 * says which species have actually been released for Max Battles, and the
 * hand-kept lists this replaces (`releasedDynamaxDexNumbers`/
 * `releasedGigantamaxDexNumbers` in sync-overrides.json) kept drifting
 * behind the game. Bulbapedia content is licensed CC BY-NC-SA.
 *
 * Reads raw wikitext through the MediaWiki API (the plain `?action=raw` URL
 * sits behind a Cloudflare challenge), where every Pokemon is written as a
 * `{{MSP/GO|<code>|<name>|...}}` template — far more stable to parse than
 * rendered HTML. Any structural surprise throws rather than returning a
 * partial list, so a broken parse aborts the catalog sync and leaves the
 * previous catalog in place instead of emptying the DMax/GMax dexes.
 */

const BULBAPEDIA_API_URL = 'https://bulbapedia.bulbagarden.net/w/api.php';
const USER_AGENT =
  'go-gather-catalog-sync/1.0 (personal non-commercial Pokemon GO tracker; fetches once per day)';
const REQUEST_TIMEOUT_MS = 30_000;

const DYNAMAX_PAGE = 'Dynamax (GO)';
const DYNAMAX_SECTION = 'List of Pokémon capable of Dynamaxing by release date';
const AVAILABILITY_PAGE = 'List of Pokémon by availability in Pokémon GO';
const GIGANTAMAX_SECTION = 'Gigantamax';

// As of October 2026 the pages list 150 Dynamax and 19 Gigantamax species —
// a count far below that means the page layout changed under the parser.
const MIN_DYNAMAX_SPECIES = 100;
const MIN_GIGANTAMAX_SPECIES = 15;

const GIGANTAMAX_CODE_SUFFIX = 'GMax';

export interface MaxRelease {
  dexNr: number;
  /** pokemon-go-api `form` value (e.g. `RAPID_STRIKE`) when Bulbapedia lists
   * a specific form's release rather than the whole species; null otherwise. */
  form: string | null;
}

export interface MaxReleases {
  dynamax: MaxRelease[];
  gigantamax: MaxRelease[];
}

/**
 * Bulbapedia's per-species form letters (the part of an MSP/GO code between
 * the dex number and any ` s`/` f` modifier, e.g. the `R` in `0892R`) mapped
 * to pokemon-go-api's own `form` values. Only species whose Max release is
 * listed per form need an entry. The empty-string key is the code with no
 * letter at all, which for these species means one specific default form
 * rather than the whole species (Bulbapedia lists Urshifu as `0892` +
 * `0892R`). Kept in code rather than sync-overrides.json so it can't drift
 * between the repo and the NAS host copy — it only changes when another
 * multi-form species gets a Max release.
 */
const FORM_CODES: Partial<Record<number, Record<string, string>>> = {
  849: { A: 'AMPED', L: 'LOW_KEY' },
  892: { '': 'SINGLE_STRIKE', R: 'RAPID_STRIKE' },
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const RELEASE_DATE = /^([A-Za-z]{3})[A-Za-z]*\.? (\d{1,2}), (\d{4})/;
const MSP_GO_TEMPLATE = /\{\{MSP\/GO\|([^}]*)\}\}/g;
// `0892R`, `0003GMax s`, `0521 f`: a 4-digit dex number, optional form
// letters, then optional space-separated modifiers (shiny/female) that don't
// matter for Max availability.
const MSP_GO_CODE = /^(\d{4})(\S*)(?:\s+\S+)*$/;
const HEADING = /^(={2,6})\s*(.+?)\s*\1\s*$/;

interface PokemonCode {
  code: string;
  dexNr: number;
  formCode: string;
}

interface ReleaseRow {
  /** `YYYY-MM-DD` */
  releasedOn: string;
  pokemon: PokemonCode[];
}

/** Reads every `{{MSP/GO|...}}` template in a wikitext fragment, in order. */
export function parseMspGoCodes(wikitext: string): PokemonCode[] {
  return [...wikitext.matchAll(MSP_GO_TEMPLATE)].map((match) => {
    const positional = match[1].split('|').filter((param) => !param.includes('='));
    const code = positional.at(0)?.trim() ?? '';
    const codeMatch = MSP_GO_CODE.exec(code);
    if (!codeMatch) {
      throw new Error(`Bulbapedia: unrecognized MSP/GO code in ${match[0]}`);
    }
    return { code, dexNr: Number(codeMatch[1]), formCode: codeMatch[2] };
  });
}

/** `"Oct 26, 2024"` → `"2024-10-26"`; null for anything else (e.g. "TBA"). */
export function parseReleaseDate(cell: string): string | null {
  const match = RELEASE_DATE.exec(cell);
  if (!match) {
    return null;
  }
  const month = MONTHS.indexOf(match[1].toLowerCase()) + 1;
  if (month === 0) {
    return null;
  }
  return `${match[3]}-${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

/** The body of the section with this exact heading, up to the next heading
 * of the same or a higher level. */
export function extractSection(wikitext: string, title: string): string {
  const lines = wikitext.split('\n');
  let start = -1;
  let level = 0;
  for (let index = 0; index < lines.length; index++) {
    const heading = HEADING.exec(lines[index]);
    if (heading && heading[2] === title) {
      start = index + 1;
      level = heading[1].length;
      break;
    }
  }
  if (start === -1) {
    throw new Error(`Bulbapedia: section "${title}" not found`);
  }

  const end = lines.findIndex((line, index) => {
    if (index < start) {
      return false;
    }
    const heading = HEADING.exec(line);
    return heading !== null && heading[1].length <= level;
  });
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

/**
 * Reads the first wikitable in a section as `Date | Pokemon | Notes` rows.
 * Only the first table counts: the Gigantamax section follows its release
 * table with a second "yet to be released" table that must not be read as
 * released.
 */
export function parseReleaseTable(section: string): ReleaseRow[] {
  const lines = section.split('\n');
  const tableStart = lines.findIndex((line) => line.startsWith('{|'));
  const tableEnd = lines.findIndex((line, index) => index > tableStart && line.startsWith('|}'));
  if (tableStart === -1 || tableEnd === -1) {
    throw new Error('Bulbapedia: release table not found');
  }

  const rows: string[][] = [];
  for (const line of lines.slice(tableStart + 1, tableEnd)) {
    if (line.startsWith('|-')) {
      rows.push([]);
    } else if (line.startsWith('|') && rows.length > 0) {
      rows[rows.length - 1].push(line.slice(1).trim());
    }
  }

  return rows.flatMap((cells) => {
    // Header rows only have `!` cells, so they end up empty here.
    if (cells.length < 2) {
      return [];
    }
    const releasedOn = parseReleaseDate(cells[0]);
    if (!releasedOn) {
      console.warn(`Bulbapedia: skipping release row with unreadable date "${cells[0]}".`);
      return [];
    }
    return [{ releasedOn, pokemon: parseMspGoCodes(cells[1]) }];
  });
}

function toMaxRelease(pokemon: PokemonCode, formLetter: string): MaxRelease {
  const forms = FORM_CODES[pokemon.dexNr];
  if (forms && Object.hasOwn(forms, formLetter)) {
    return { dexNr: pokemon.dexNr, form: forms[formLetter] };
  }
  if (formLetter !== '') {
    // Shown as the whole species rather than dropped, so a missing mapping
    // surfaces as a visible entry instead of silently hiding a release.
    console.warn(
      `Bulbapedia: no form mapping for "${pokemon.code}" — treating it as the whole species.`
    );
  }
  return { dexNr: pokemon.dexNr, form: null };
}

function releasesFromSection(
  section: string,
  label: string,
  minSpecies: number,
  formLetterOf: (pokemon: PokemonCode) => string,
  asOf: Date
): MaxRelease[] {
  const rows = parseReleaseTable(section);
  const speciesCount = new Set(rows.flatMap((row) => row.pokemon.map((p) => p.dexNr))).size;
  if (speciesCount < minSpecies) {
    throw new Error(
      `Bulbapedia: only ${String(speciesCount)} ${label} species parsed (expected at least ${String(minSpecies)}) — page layout may have changed.`
    );
  }

  // Bulbapedia lists announced releases ahead of time ("will appear in Max
  // Battles"); those only count once their date arrives, which the daily
  // scheduled sync then picks up on its own.
  const today = asOf.toISOString().slice(0, 10);
  const releasedRows = rows.filter((row) => row.releasedOn <= today);
  const upcomingCount = rows.length - releasedRows.length;

  const releases = new Map<string, MaxRelease>();
  for (const pokemon of releasedRows.flatMap((row) => row.pokemon)) {
    const release = toMaxRelease(pokemon, formLetterOf(pokemon));
    releases.set(`${String(release.dexNr)}|${release.form ?? ''}`, release);
  }

  console.log(
    `Bulbapedia ${label}: ${String(releases.size)} released entries, ${String(upcomingCount)} upcoming release rows skipped.`
  );
  return [...releases.values()];
}

export function parseDynamaxReleases(dynamaxPage: string, asOf: Date): MaxRelease[] {
  return releasesFromSection(
    extractSection(dynamaxPage, DYNAMAX_SECTION),
    'Dynamax',
    MIN_DYNAMAX_SPECIES,
    (pokemon) => pokemon.formCode,
    asOf
  );
}

export function parseGigantamaxReleases(availabilityPage: string, asOf: Date): MaxRelease[] {
  return releasesFromSection(
    extractSection(availabilityPage, GIGANTAMAX_SECTION),
    'Gigantamax',
    MIN_GIGANTAMAX_SPECIES,
    (pokemon) => {
      if (!pokemon.formCode.endsWith(GIGANTAMAX_CODE_SUFFIX)) {
        throw new Error(`Bulbapedia: "${pokemon.code}" in the Gigantamax table isn't a GMax code`);
      }
      return pokemon.formCode.slice(0, -GIGANTAMAX_CODE_SUFFIX.length);
    },
    asOf
  );
}

async function fetchWikitext(page: string): Promise<string> {
  const url = new URL(BULBAPEDIA_API_URL);
  url.search = new URLSearchParams({
    action: 'parse',
    page,
    prop: 'wikitext',
    redirects: '1',
    format: 'json',
    formatversion: '2',
  }).toString();

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Bulbapedia: failed to fetch "${page}": ${String(response.status)} ${response.statusText}`
    );
  }

  const body = (await response.json()) as {
    parse?: { wikitext?: string };
    error?: { info?: string };
  };
  if (!body.parse?.wikitext) {
    throw new Error(
      `Bulbapedia: no wikitext returned for "${page}": ${body.error?.info ?? 'unknown error'}`
    );
  }
  return body.parse.wikitext;
}

export async function fetchMaxReleases(asOf: Date = new Date()): Promise<MaxReleases> {
  const [dynamaxPage, availabilityPage] = await Promise.all([
    fetchWikitext(DYNAMAX_PAGE),
    fetchWikitext(AVAILABILITY_PAGE),
  ]);
  return {
    dynamax: parseDynamaxReleases(dynamaxPage, asOf),
    gigantamax: parseGigantamaxReleases(availabilityPage, asOf),
  };
}
