/**
 * Minimal Bulbapedia wikitext pages for tests, shaped like the real
 * `Dynamax (GO)` and availability pages (see bulbapedia.ts). Each page pads
 * its release table with filler species so it clears the parser's minimum
 * species-count checks.
 */

export function row(date: string, pokemon: string): string {
  return `|- style=background:#FFF\n| ${date}\n| ${pokemon}\n| Notes mentioning {{GO|Wooloo}}.`;
}

function fillerCodes(count: number, firstDexNr: number, suffix = ''): string {
  return Array.from(
    { length: count },
    (_, index) => `{{MSP/GO|${String(firstDexNr + index).padStart(4, '0')}${suffix}|Filler}}`
  ).join('');
}

function table(rows: string[]): string[] {
  return [
    '{| class="roundy"',
    '|- style="background-color:#fff"',
    '! Date',
    '! Pokémon',
    '! Notes',
    ...rows,
    '|}',
  ];
}

/** 100 filler species (dex 600–699) released Sep 4, 2024, plus `rows`. */
export function dynamaxPage(rows: string[], fillerCount = 100): string {
  return [
    'Intro mentioning {{MSP/GO|0150|Mewtwo}} outside any section.',
    '==List of Pokémon capable of Dynamaxing by release date==',
    ...table([row('Sep 4, 2024', fillerCodes(fillerCount, 600)), ...rows]),
    '==Bugs and errors==',
    '| {{MSP/GO|0151|Mew}}',
  ].join('\n');
}

export interface SpeciesSectionOptions {
  /** Extra rows for the species date table. */
  rows?: string[];
  /** Dex numbers in the Unreleased Pokémon list, alternating the plain
   * `{{MSP|…}}` and `{{MSP/GO|…}}` templates as the real page does. */
  unreleased?: number[];
  /** Filler species dex 1…fillerCount, all dated Jul 6, 2016. */
  fillerCount?: number;
  /** Sprite templates in the "forms yet to be made available" table, e.g.
   * `{{MSP/GO|0555Z|Darmanitan}}` or `{{MSP|0658|form=A|Greninja}}`. */
  unreleasedForms?: string[];
}

/**
 * The "List of Pokémon by date" section with its "Unreleased Pokémon"
 * subsection. By default dex 1–900 are dated and dex 901 is unreleased, so
 * the cross-check passes; tests add species from 902 up.
 */
export function speciesSections({
  rows = [],
  unreleased = [901],
  fillerCount = 900,
  unreleasedForms = ['{{MSP/GO|0999Z|Gimmighoul}}'],
}: SpeciesSectionOptions = {}): string {
  const unreleasedCodes = unreleased
    .map(
      (dexNr, index) =>
        `{{${index % 2 === 0 ? 'MSP' : 'MSP/GO'}|${String(dexNr).padStart(4, '0')}|Unreleased}}`
    )
    .join('');
  return [
    '==List of Pokémon by date==',
    ...table([row('Jul 6, 2016', fillerCodes(fillerCount, 1)), ...rows]),
    '===Unreleased Pokémon===',
    ...table(['|- style=background:#FFF', '! IX', "| '''1'''", `| ${unreleasedCodes}`]),
    'The following forms have yet to be made available:',
    ...table([
      '|- style=background:#FFF',
      '! V',
      `| '''${String(unreleasedForms.length)}'''`,
      `| ${unreleasedForms.join('')}`,
    ]),
  ].join('\n');
}

/** The "Mega Evolution and Primal Reversion" section: 40 filler Megas (dex
 * 700–739, code `M`) released Aug 27, 2020, plus `rows`, followed by the
 * "yet to be released" table, written with `{{MSP/HOME|…}}` as on the real
 * page, which must be ignored. */
export function megaSection(rows: string[] = [], fillerCount = 40): string {
  return [
    '===Mega Evolution and Primal Reversion===',
    'The following Pokémon transformations are currently available:',
    ...table([row('Aug 27, 2020', fillerCodes(fillerCount, 700, 'M')), ...rows]),
    'The following Mega Evolutions have yet to be released:',
    ...table([
      '|- style=background:#FFF',
      '! I',
      "| '''2'''",
      '| {{MSP/HOME|0036M|Clefable}}{{MSP/HOME|0359MZ|Absol}}',
    ]),
  ].join('\n');
}

/** 15 filler Gigantamax species (dex 600–614) released Oct 26, 2024, plus
 * `rows`, between sections and an unreleased table that must be ignored.
 * Starts with the species sections (default `speciesSections()`) and the
 * Mega section (default `megaSection()`), as the real page does. */
export function availabilityPage(
  rows: string[],
  fillerCount = 15,
  species: string = speciesSections(),
  mega: string = megaSection()
): string {
  return [
    species,
    mega,
    '===Gigantamax===',
    'The following Gigantamax Pokémon are currently available:',
    ...table([row('Oct 26, 2024', fillerCodes(fillerCount, 600, 'GMax')), ...rows]),
    'The following Gigantamax forms have yet to be released:',
    ...table(['|- style=background:#FFF', '! I', "| '''1'''", '| {{MSP/GO|0133GMax|Eevee}}']),
    '===Region-exclusive Pokémon===',
    ...table([row('Jul 6, 2016', '{{MSP/GO|0083|Farfetchd}}')]),
  ].join('\n');
}

export interface ShinyRowOptions {
  dex: number;
  family: string;
  /** Codes for the Encounter cell, e.g. `0001 s` or, with extra template
   * arguments, `0001 s|Bulbasaur|dynamax=yes`. */
  encounter: string[];
  /** Codes for the Evolution-only cell. */
  evolution?: string[];
  /** The date cell's first date, or e.g. `TBA`. */
  date: string;
  /** Also write the date as a `datesort=` argument, as most real rows do. */
  dateSort?: boolean;
  /** A `form=` argument, as on regional family rows. */
  form?: string;
  /** Extra dated notes in the date cell, e.g.
   * `{ date: 'October 26, 2024', text: 'Gigantamax Venusaur' }`. */
  notes?: { date: string; text: string }[];
}

function shinyCells(codes: string[]): string {
  return codes
    .map((code) => `{{MSP/GO|size=80|${code.includes('|') ? code : `${code}|Shiny`}}}`)
    .join('');
}

/** One `{{lop/shiny/GO|…}}` family row, shaped like the real page's. */
export function shinyRow({
  dex,
  family,
  encounter,
  evolution = [],
  date,
  dateSort = true,
  form,
  notes = [],
}: ShinyRowOptions): string {
  const extraNotes = notes.map(
    ({ date: noteDate, text }) => `<br>${noteDate} <small>(${text})</small>`
  );
  return [
    `{{lop/shiny/GO|${String(dex).padStart(4, '0')}|${family}`,
    ...(form ? [`form=${form}`] : []),
    shinyCells(encounter),
    shinyCells(evolution),
    ...(dateSort ? [`datesort=${date}`] : []),
    `${date} <small>(${family})</small><br>March 3, 2026 <small>(Shadow)</small>${extraNotes.join('')}`,
    `[[Community Day|${family} Community Day]]`,
    `{{tt|0.2%|${family}}}}}`,
  ].join('|');
}

/** Bulbapedia's shiny list: `fillerCount` filler families (dex 1000 up)
 * with shinies released Jul 6, 2016, a commented-out placeholder row that
 * must be ignored (as the real page has for unreleased shinies), and
 * `rows`. */
export function shinyPage(rows: string[], fillerCount = 400): string {
  const filler = Array.from({ length: fillerCount }, (_, index) =>
    shinyRow({
      dex: 1000 + index,
      family: 'Filler',
      encounter: [`${String(1000 + index).padStart(4, '0')} s`],
      date: 'July 6, 2016',
    })
  );
  return [
    'The following lists the Pokémon whose Shiny forms are available.',
    '===Kanto families===',
    '{| class="roundy sortable collapsible"',
    '! # !! Family !! Pokémon',
    ...filler,
    `<!--${shinyRow({ dex: 570, family: 'Zorua', encounter: ['0570 s'], date: 'January 1, 2020' })}-->`,
    ...rows,
    '|}',
  ].join('\n');
}
