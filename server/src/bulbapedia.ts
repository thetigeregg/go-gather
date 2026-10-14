/**
 * Pokemon GO availability — which species, regional forms, Mega/Primal
 * forms, Dynamax/Gigantamax Pokemon and shinies have been released, and
 * when — read from Bulbapedia's community-maintained Pokemon GO pages. Neither
 * pokemon-go-api nor PokeAPI says what has actually been released in-game,
 * and the hand-kept lists this replaces (`releasedDynamaxDexNumbers`/
 * `releasedGigantamaxDexNumbers` in sync-overrides.json, the
 * `excludedDexNumbers` user setting) kept drifting behind the game.
 * Bulbapedia content is licensed CC BY-NC-SA.
 *
 * Reads raw wikitext through the MediaWiki API (the plain `?action=raw` URL
 * sits behind a Cloudflare challenge), where every Pokemon is written as a
 * `{{MSP/GO|<code>|<name>|...}}` template — far more stable to parse than
 * rendered HTML. Any structural surprise throws rather than returning a
 * partial list — availability-store.ts records that as a failed update and
 * keeps the dataset's last good parse, so a layout change on Bulbapedia's
 * side never empties the DMax/GMax dexes.
 *
 * Parsing keeps each row's release date rather than filtering to "released
 * today": Bulbapedia lists announced releases ahead of time. The catalog
 * sync stamps each entry with its date (release-dates.ts) and the app hides
 * entries whose date hasn't arrived on the device, so announced releases go
 * live on schedule even while Bulbapedia is unreachable.
 */

const BULBAPEDIA_API_URL = 'https://bulbapedia.bulbagarden.net/w/api.php';
const USER_AGENT =
  'go-gather-catalog-sync/1.0 (personal non-commercial Pokemon GO tracker; fetches once per day)';
const REQUEST_TIMEOUT_MS = 30_000;

const DYNAMAX_PAGE = 'Dynamax (GO)';
const DYNAMAX_SECTION = 'List of Pokémon capable of Dynamaxing by release date';
const AVAILABILITY_PAGE = 'List of Pokémon by availability in Pokémon GO';
const GIGANTAMAX_SECTION = 'Gigantamax';
const SPECIES_SECTION = 'List of Pokémon by date';
const UNRELEASED_SECTION = 'Unreleased Pokémon';
const MEGA_SECTION = 'Mega Evolution and Primal Reversion';
const SHINY_PAGE = 'List of Shiny Pokémon in Pokémon GO';
const SHINY_ROW_TEMPLATE = 'lop/shiny/GO';

// As of October 2026 the pages list 150 Dynamax, 19 Gigantamax, 959
// released and 60 Mega/Primal species, and 479 shiny families — a count
// far below that means the page layout changed under the parser.
const MIN_DYNAMAX_SPECIES = 100;
const MIN_GIGANTAMAX_SPECIES = 15;
const MIN_RELEASED_SPECIES = 900;
const MIN_MEGA_SPECIES = 40;
const MIN_SHINY_FAMILIES = 400;

export const GIGANTAMAX_CODE_SUFFIX = 'GMax';

/** Bulbapedia's Mega/Primal form letters mapped to the suffix of
 * pokemon-go-api's `megaEvolutions` keys (`CHARIZARD_MEGA_X`,
 * `KYOGRE_PRIMAL`), which the catalog keeps as each Mega entry's `form`. */
export const MEGA_CODES: Partial<Record<string, string>> = {
  M: 'MEGA',
  MX: 'MEGA_X',
  MY: 'MEGA_Y',
  MZ: 'MEGA_Z',
  P: 'PRIMAL',
};

/** A release of a whole species (`form: null`) or of one of its forms.
 * What `form` holds depends on the dataset — see the aliases below. */
export interface FormRelease {
  dexNr: number;
  form: string | null;
}

export interface DatedFormRelease extends FormRelease {
  /** `YYYY-MM-DD`, as listed on Bulbapedia — may be in the future for an
   * announced release. */
  releasedOn: string;
}

/** A Dynamax/Gigantamax release. `form` is pokemon-go-api's `form` value
 * (e.g. `RAPID_STRIKE`) when Bulbapedia lists a specific form's release
 * rather than the whole species. */
export type MaxRelease = FormRelease;
export type DatedMaxRelease = DatedFormRelease;

/** A Mega/Primal release. `form` is the Mega's form suffix (`MEGA`,
 * `MEGA_X`, `PRIMAL`, …). */
export interface DatedMegaRelease extends DatedFormRelease {
  form: string;
}

export interface DatedSpeciesRelease {
  dexNr: number;
  /** Bulbapedia's form letters for this code — `''` for the plain species,
   * `A`/`G`/`H`/`P` for a regional form (resolved to a region in
   * release-dates.ts), other letters for species-specific forms. */
  formCode: string;
  /** `YYYY-MM-DD` — may be in the future for an announced debut. */
  releasedOn: string;
}

/** One Pokemon code listed in a family row of Bulbapedia's shiny list —
 * its shiny is out (or announced) from the row's shiny debut date. */
export interface DatedShinyRelease {
  dexNr: number;
  /** Bulbapedia's form letters, as in `DatedSpeciesRelease` — plus Mega
   * (`M`, `MX`, …) and Gigantamax (`GMax`) codes, which the species list
   * doesn't have. Classified in release-dates.ts. */
  formCode: string;
  /** Whether the row lists any member as catchable as a shiny Dynamax, which
   * evolving makes every Dynamax-capable member of the family available. */
  dynamax: boolean;
  /** `YYYY-MM-DD` — the family row's first date, its shiny debut. May be in
   * the future for an announced shiny. */
  releasedOn: string;
}

/** Every dataset saved in `availability_sources`, keyed by dataset name. */
export interface AvailabilityData {
  dynamax: DatedMaxRelease[];
  gigantamax: DatedMaxRelease[];
  species: DatedSpeciesRelease[];
  mega: DatedMegaRelease[];
  shiny: DatedShinyRelease[];
}

export type AvailabilityDataset = keyof AvailabilityData;

/**
 * Bulbapedia's per-species form letters (the part of an MSP/GO code between
 * the dex number and any ` s`/` f` modifier, e.g. the `R` in `0892R`) mapped
 * to pokemon-go-api's own `form` values. Only species whose Max release is
 * listed per form need an entry. The empty-string key is the code with no
 * letter at all: for Urshifu it means one specific default form (Bulbapedia
 * lists it as `0892` + `0892R`), while for Toxtricity it means the whole
 * species (`null`) — Bulbapedia lists its Gigantamax as a single `0849GMax`.
 * Any other letter for these species is unexpected and warns. Kept in code
 * rather than sync-overrides.json so it can't drift
 * between the repo and the NAS host copy — it only changes when another
 * multi-form species gets a Max release.
 */
const FORM_CODES: Partial<Record<number, Record<string, string | null>>> = {
  849: { '': null, A: 'AMPED', L: 'LOW_KEY' },
  892: { '': 'SINGLE_STRIKE', R: 'RAPID_STRIKE' },
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const RELEASE_DATE = /^([A-Za-z]{3})[A-Za-z]*\.? (\d{1,2}), (\d{4})/;
// A date cell for a release that's announced but not yet scheduled.
const UNSCHEDULED_DATE = /^(?:TBA|TBD)\b/i;
const MSP_GO_TEMPLATE = /\{\{MSP\/GO\|([^}]*)\}\}/g;
// The Unreleased list also uses the plain `{{MSP|0833|Chewtle}}` template
// (no GO sprite exists yet), so it's read by dex number alone.
const ANY_MSP_DEX_NR = /\{\{MSP(?:\/GO)?\|(?:size=\d+\|)?(\d{4})/g;
// `0892R`, `0003GMax s`, `0521 f`: a 4-digit dex number, optional form
// letters, then optional space-separated modifiers (shiny/female) that don't
// matter for Max availability.
const MSP_GO_CODE = /^(\d{4})(\S*)(?:\s+\S+)*$/;
const HEADING = /^(={2,6})\s*(.+?)\s*\1\s*$/;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const NAMED_ARGUMENT = /^\s*[A-Za-z0-9_]+\s*=/;
const SHINY_DYNAMAX_FLAG = /\bdynamax\s*=\s*yes\b/;

interface PokemonCode {
  code: string;
  dexNr: number;
  formCode: string;
}

interface ReleaseRow {
  /** `YYYY-MM-DD`, or null for an announced release dated TBA/TBD. */
  releasedOn: string | null;
  pokemon: PokemonCode[];
}

type DatedReleaseRow = ReleaseRow & { releasedOn: string };

function isDated(row: ReleaseRow): row is DatedReleaseRow {
  return row.releasedOn !== null;
}

/**
 * Adds `release` under `key` unless that key already holds an earlier date,
 * so a Pokemon listed in several rows (e.g. a regional debut followed by a
 * global one) keeps its earliest date. Shared by every dataset here and by
 * release-dates.ts.
 */
export function keepEarliest<T extends { releasedOn: string }>(
  releases: Map<string, T>,
  key: string,
  release: T
): void {
  const existing = releases.get(key);
  if (!existing || release.releasedOn < existing.releasedOn) {
    releases.set(key, release);
  }
}

interface TableRow {
  cells: string[];
  isHeader: boolean;
}

/** Removes `<!-- … -->` comments. Bulbapedia's editors comment out rows and
 * dates that aren't live yet — 40 whole families on the shiny list, and an
 * announced date inside another row — so every parser starts with this. */
export function stripComments(wikitext: string): string {
  return wikitext.replace(HTML_COMMENT, '');
}

/**
 * Every `{{name|…}}` call in `wikitext`, as its arguments after the name.
 * Arguments are split on `|` only outside nested `{{…}}` and `[[…]]`, since
 * cells hold templates and links with their own `|`s.
 */
export function templateCalls(wikitext: string, name: string): string[][] {
  const opener = `{{${name}|`;
  const calls: string[][] = [];
  let start = wikitext.indexOf(opener);
  while (start !== -1) {
    const args: string[] = [];
    let current = '';
    let depth = 0;
    let index = start + opener.length;
    let closed = false;
    while (index < wikitext.length) {
      const pair = wikitext.slice(index, index + 2);
      if (pair === '{{' || pair === '[[') {
        depth++;
        current += pair;
        index += 2;
      } else if (pair === '}}' && depth === 0) {
        closed = true;
        break;
      } else if ((pair === '}}' || pair === ']]') && depth > 0) {
        depth--;
        current += pair;
        index += 2;
      } else if (wikitext[index] === '|' && depth === 0) {
        args.push(current);
        current = '';
        index++;
      } else {
        current += wikitext[index];
        index++;
      }
    }
    if (!closed) {
      throw new Error(`Bulbapedia: unclosed {{${name}}} template`);
    }
    args.push(current);
    calls.push(args);
    start = wikitext.indexOf(opener, index + 2);
  }
  return calls;
}

/** Reads every `{{MSP/GO|...}}` template in a wikitext fragment, in order. */
export function parseMspGoCodes(wikitext: string): PokemonCode[] {
  return [...wikitext.matchAll(MSP_GO_TEMPLATE)].map((match) => {
    const params = match[1].split('|').map((param) => param.trim());
    const code = params.filter((param) => !param.includes('=')).at(0) ?? '';
    const codeMatch = MSP_GO_CODE.exec(code);
    if (!codeMatch) {
      throw new Error(`Bulbapedia: unrecognized MSP/GO code in ${match[0]}`);
    }
    // Some entries give the form as a named parameter instead of in the
    // code: `{{MSP/GO|0222|form=G|Corsola}}` is Galarian Corsola.
    const formParam =
      params
        .find((param) => param.startsWith('form='))
        ?.slice(5)
        .trim() ?? '';
    return {
      code: formParam ? `${code} (form=${formParam})` : code,
      dexNr: Number(codeMatch[1]),
      formCode: codeMatch[2] + formParam,
    };
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

/** The lines inside the first wikitable in a section, without its `{|` and
 * `|}` delimiters. */
function firstTableLines(section: string): string[] {
  const lines = section.split('\n');
  const tableStart = lines.findIndex((line) => line.startsWith('{|'));
  const tableEnd = lines.findIndex((line, index) => index > tableStart && line.startsWith('|}'));
  if (tableStart === -1 || tableEnd === -1) {
    throw new Error('Bulbapedia: release table not found');
  }
  return lines.slice(tableStart + 1, tableEnd);
}

/**
 * Splits wikitable lines into rows of cells. Handles both one-cell-per-line
 * (`| a` / `| b`) and inline (`| a || b`) cells, and appends a line that
 * doesn't start a new cell to the previous cell — wikitext lets a long cell
 * wrap onto following lines.
 */
function parseTableRows(tableLines: string[]): TableRow[] {
  const rows: TableRow[] = [];
  for (const line of tableLines) {
    if (line.startsWith('|-')) {
      rows.push({ cells: [], isHeader: false });
      continue;
    }
    const row = rows.at(-1);
    if (!row) {
      continue;
    }
    if (line.startsWith('!')) {
      row.isHeader = true;
      row.cells.push(
        ...line
          .slice(1)
          .split('!!')
          .map((cell) => cell.trim())
      );
    } else if (line.startsWith('|')) {
      row.cells.push(
        ...line
          .slice(1)
          .split('||')
          .map((cell) => cell.trim())
      );
    } else if (row.cells.length > 0) {
      row.cells[row.cells.length - 1] += `\n${line}`;
    }
  }
  return rows;
}

/**
 * Reads the first wikitable in a section as `Date | Pokemon | Notes` rows.
 * Only the first table counts: the Gigantamax section follows its release
 * table with a second "yet to be released" table that must not be read as
 * released. A row layout, date or Pokemon cell this parser doesn't
 * understand throws rather than being skipped, since a silently dropped row is a silently
 * missing release — the species-count check alone wouldn't notice one lost
 * row. Only an explicit TBA/TBD date is accepted without a date: that row
 * comes back with `releasedOn: null`, so it isn't treated as released but
 * still counts as listed (see parseSpeciesReleases' cross-check).
 */
export function parseReleaseTable(section: string): ReleaseRow[] {
  return parseTableRows(firstTableLines(section)).flatMap(({ cells, isHeader }): ReleaseRow[] => {
    if (isHeader || cells.length === 0) {
      return [];
    }
    const rowText = cells.join(' || ');
    if (cells.length < 2 || /rowspan\s*=/i.test(rowText)) {
      throw new Error(`Bulbapedia: unexpected release row layout: ${rowText.slice(0, 120)}`);
    }
    const releasedOn = parseReleaseDate(cells[0]);
    if (!releasedOn) {
      if (!UNSCHEDULED_DATE.test(cells[0])) {
        throw new Error(`Bulbapedia: unreadable release date "${cells[0]}"`);
      }
      console.warn(`Bulbapedia: release row with unscheduled date "${cells[0]}" has no date yet.`);
      return [{ releasedOn: null, pokemon: parseMspGoCodes(cells[1]) }];
    }
    const pokemon = parseMspGoCodes(cells[1]);
    if (pokemon.length === 0) {
      throw new Error(`Bulbapedia: no MSP/GO Pokemon in release row: ${rowText.slice(0, 120)}`);
    }
    return [{ releasedOn, pokemon }];
  });
}

function toMaxRelease(pokemon: PokemonCode, formLetter: string): MaxRelease {
  const forms = FORM_CODES[pokemon.dexNr];
  if (forms && Object.hasOwn(forms, formLetter)) {
    return { dexNr: pokemon.dexNr, form: forms[formLetter] };
  }
  if (forms || formLetter !== '') {
    // Shown as the whole species rather than dropped, so a missing mapping
    // surfaces as a visible entry instead of silently hiding a release. For
    // a species listed above, even a plain code with no letter is unexpected
    // unless mapped: it means Bulbapedia changed how it writes those forms.
    console.warn(
      `Bulbapedia: no form mapping for "${pokemon.code}" — treating it as the whole species.`
    );
  }
  return { dexNr: pokemon.dexNr, form: null };
}

function toMegaRelease(pokemon: PokemonCode): FormRelease & { form: string } {
  const form = MEGA_CODES[pokemon.formCode];
  if (!form) {
    // Not safe to date as the whole species: that would release every Mega
    // the species has. Failing the parse keeps the last good Mega data until
    // the code is mapped.
    throw new Error(`Bulbapedia: no Mega mapping for "${pokemon.code}"`);
  }
  return { dexNr: pokemon.dexNr, form };
}

function releasesFromSection<R extends FormRelease>(
  section: string,
  label: string,
  minSpecies: number,
  toRelease: (pokemon: PokemonCode) => R
): (R & { releasedOn: string })[] {
  const rows = parseReleaseTable(section).filter(isDated);
  const speciesCount = new Set(rows.flatMap((row) => row.pokemon.map((p) => p.dexNr))).size;
  if (speciesCount < minSpecies) {
    throw new Error(
      `Bulbapedia: only ${String(speciesCount)} ${label} species parsed (expected at least ${String(minSpecies)}) — page layout may have changed.`
    );
  }

  const releases = new Map<string, R & { releasedOn: string }>();
  for (const row of rows) {
    for (const pokemon of row.pokemon) {
      const release = toRelease(pokemon);
      keepEarliest(releases, `${String(release.dexNr)}|${release.form ?? ''}`, {
        ...release,
        releasedOn: row.releasedOn,
      });
    }
  }
  return [...releases.values()];
}

export function parseDynamaxReleases(dynamaxPage: string): DatedMaxRelease[] {
  return releasesFromSection(
    extractSection(stripComments(dynamaxPage), DYNAMAX_SECTION),
    'Dynamax',
    MIN_DYNAMAX_SPECIES,
    (pokemon) => toMaxRelease(pokemon, pokemon.formCode)
  );
}

export function parseGigantamaxReleases(availabilityPage: string): DatedMaxRelease[] {
  return releasesFromSection(
    extractSection(stripComments(availabilityPage), GIGANTAMAX_SECTION),
    'Gigantamax',
    MIN_GIGANTAMAX_SPECIES,
    (pokemon) => {
      if (!pokemon.formCode.endsWith(GIGANTAMAX_CODE_SUFFIX)) {
        throw new Error(`Bulbapedia: "${pokemon.code}" in the Gigantamax table isn't a GMax code`);
      }
      return toMaxRelease(pokemon, pokemon.formCode.slice(0, -GIGANTAMAX_CODE_SUFFIX.length));
    }
  );
}

/**
 * Released and announced Mega Evolutions and Primal Reversions, from the
 * first table of the availability page's Mega section. The section's second
 * table ("yet to be released") uses `{{MSP/HOME|…}}` sprites, so it's never
 * read as released either way.
 */
export function parseMegaReleases(availabilityPage: string): DatedMegaRelease[] {
  return releasesFromSection(
    extractSection(stripComments(availabilityPage), MEGA_SECTION),
    'Mega',
    MIN_MEGA_SPECIES,
    toMegaRelease
  );
}

/** Dex numbers in the first table of the "Unreleased Pokémon" section
 * (the second table there lists unreleased alternate forms, not species). */
function parseUnreleasedSpecies(availabilityPage: string): Set<number> {
  const table = firstTableLines(extractSection(availabilityPage, UNRELEASED_SECTION)).join('\n');
  return new Set([...table.matchAll(ANY_MSP_DEX_NR)].map((match) => Number(match[1])));
}

/**
 * Every species and form debut in the "List of Pokémon by date" table,
 * keeping each (species, form letters) pair's earliest date. Cross-checked
 * against the "Unreleased Pokémon" list: every dex number up to the highest
 * one seen must be dated, listed with a TBA/TBD date, or listed as
 * unreleased. Between them those cover the whole National Dex, so a gap
 * means a row was silently lost.
 */
export function parseSpeciesReleases(availabilityPage: string): DatedSpeciesRelease[] {
  const page = stripComments(availabilityPage);
  const rows = parseReleaseTable(extractSection(page, SPECIES_SECTION));
  const releases = new Map<string, DatedSpeciesRelease>();
  for (const row of rows.filter(isDated)) {
    for (const { dexNr, formCode } of row.pokemon) {
      keepEarliest(releases, `${String(dexNr)}|${formCode}`, {
        dexNr,
        formCode,
        releasedOn: row.releasedOn,
      });
    }
  }
  const unscheduled = new Set(
    rows.filter((row) => !isDated(row)).flatMap((row) => row.pokemon.map((p) => p.dexNr))
  );

  const dated = new Set([...releases.values()].map((release) => release.dexNr));
  if (dated.size < MIN_RELEASED_SPECIES) {
    throw new Error(
      `Bulbapedia: only ${String(dated.size)} dated species parsed (expected at least ${String(MIN_RELEASED_SPECIES)}) — page layout may have changed.`
    );
  }

  const unreleased = parseUnreleasedSpecies(page);
  const highestDexNr = Math.max(...dated, ...unscheduled, ...unreleased);
  const missing = Array.from({ length: highestDexNr }, (_, index) => index + 1).filter(
    (dexNr) => !dated.has(dexNr) && !unscheduled.has(dexNr) && !unreleased.has(dexNr)
  );
  if (missing.length > 0) {
    throw new Error(
      `Bulbapedia: species ${missing.slice(0, 10).join(', ')} are neither dated nor listed as unreleased — page layout may have changed.`
    );
  }

  return [...releases.values()];
}

/**
 * Every Pokemon code in Bulbapedia's shiny list, with its family row's
 * shiny debut date. Each `{{lop/shiny/GO|…}}` row is one evolution (or
 * regional) family; its positional arguments are dex, family, the
 * Encounter cell, the Evolution-only cell, the date cell, then event and
 * rates. Codes in either cell have a released shiny. The date cell is free
 * text whose first date is the family's shiny debut; the later segments
 * (Megas, Dynamax, "by encounter", …) aren't parsed — release-dates.ts
 * combines the debut with each entry's own release date instead.
 */
export function parseShinyReleases(shinyPage: string): DatedShinyRelease[] {
  const rows = templateCalls(stripComments(shinyPage), SHINY_ROW_TEMPLATE);
  if (rows.length < MIN_SHINY_FAMILIES) {
    throw new Error(
      `Bulbapedia: only ${String(rows.length)} shiny families parsed (expected at least ${String(MIN_SHINY_FAMILIES)}) — page layout may have changed.`
    );
  }

  const releases = new Map<string, DatedShinyRelease>();
  for (const args of rows) {
    const positional = args.filter((arg) => !NAMED_ARGUMENT.test(arg)).map((arg) => arg.trim());
    if (positional.length < 5) {
      throw new Error(`Bulbapedia: unexpected shiny row layout: ${args.join('|').slice(0, 120)}`);
    }
    const [, family, encounter, evolutionOnly, dateCell] = positional;
    const releasedOn = parseReleaseDate(dateCell);
    if (!releasedOn) {
      if (!UNSCHEDULED_DATE.test(dateCell)) {
        throw new Error(`Bulbapedia: unreadable shiny date "${dateCell.slice(0, 60)}" (${family})`);
      }
      console.warn(
        `Bulbapedia: shiny ${family} has an unscheduled date "${dateCell}" — not listed yet.`
      );
      continue;
    }

    const cells = `${encounter}${evolutionOnly}`;
    const pokemon = parseMspGoCodes(cells);
    if (pokemon.length === 0) {
      throw new Error(`Bulbapedia: no MSP/GO Pokemon in shiny row for ${family}`);
    }
    const dynamax = SHINY_DYNAMAX_FLAG.test(cells);
    for (const { dexNr, formCode } of pokemon) {
      keepEarliest(releases, `${String(dexNr)}|${formCode}|${String(dynamax)}`, {
        dexNr,
        formCode,
        dynamax,
        releasedOn,
      });
    }
  }
  return [...releases.values()];
}

/**
 * Every dataset availability-store.ts saves, with the page it's parsed
 * from. Each dataset is saved (or fails) on its own, even when several are
 * parsed from the same page, so one broken section never discards another
 * section's good data.
 */
export const AVAILABILITY_DATASETS: {
  dataset: AvailabilityDataset;
  page: string;
  parse: (wikitext: string) => AvailabilityData[AvailabilityDataset];
}[] = [
  { dataset: 'dynamax', page: DYNAMAX_PAGE, parse: parseDynamaxReleases },
  { dataset: 'gigantamax', page: AVAILABILITY_PAGE, parse: parseGigantamaxReleases },
  { dataset: 'species', page: AVAILABILITY_PAGE, parse: parseSpeciesReleases },
  { dataset: 'mega', page: AVAILABILITY_PAGE, parse: parseMegaReleases },
  { dataset: 'shiny', page: SHINY_PAGE, parse: parseShinyReleases },
];

export async function fetchWikitext(page: string): Promise<string> {
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
