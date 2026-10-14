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
    ...table(['|- style=background:#FFF', '! V', "| '''1'''", '| {{MSP/GO|0999Z|Gimmighoul}}']),
  ].join('\n');
}

/** 15 filler Gigantamax species (dex 600–614) released Oct 26, 2024, plus
 * `rows`, between sections and an unreleased table that must be ignored.
 * Starts with the species sections (default `speciesSections()`), as the
 * real page does. */
export function availabilityPage(
  rows: string[],
  fillerCount = 15,
  species: string = speciesSections()
): string {
  return [
    species,
    '===Mega Evolution and Primal Reversion===',
    ...table([row('Aug 27, 2020', '{{MSP/GO|0003M|Venusaur}}')]),
    '===Gigantamax===',
    'The following Gigantamax Pokémon are currently available:',
    ...table([row('Oct 26, 2024', fillerCodes(fillerCount, 600, 'GMax')), ...rows]),
    'The following Gigantamax forms have yet to be released:',
    ...table(['|- style=background:#FFF', '! I', "| '''1'''", '| {{MSP/GO|0133GMax|Eevee}}']),
    '===Region-exclusive Pokémon===',
    ...table([row('Jul 6, 2016', '{{MSP/GO|0083|Farfetchd}}')]),
  ].join('\n');
}
