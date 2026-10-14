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

/** 15 filler Gigantamax species (dex 600–614) released Oct 26, 2024, plus
 * `rows`, between sections and an unreleased table that must be ignored. */
export function availabilityPage(rows: string[], fillerCount = 15): string {
  return [
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
