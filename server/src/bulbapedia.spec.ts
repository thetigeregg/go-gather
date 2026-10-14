import {
  extractSection,
  fetchWikitext,
  parseDynamaxReleases,
  parseGigantamaxReleases,
  parseMegaReleases,
  parseMspGoCodes,
  parseReleaseDate,
  parseShinyReleases,
  parseSpeciesReleases,
  stripComments,
  templateCalls,
} from './bulbapedia';
import {
  availabilityPage,
  dynamaxPage,
  megaSection,
  row,
  shinyPage,
  shinyRow,
  speciesSections,
} from './bulbapedia.test-helpers';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('parseMspGoCodes', () => {
  it('reads the code and ignores named parameters and modifiers', () => {
    expect(
      parseMspGoCodes(
        '{{MSP/GO|size=80|0003GMax s|Venusaur|shadow=yes}}{{MSP/GO|0521 f|Unfezant}}{{MSP/GO|0892R|Urshifu}}'
      )
    ).toEqual([
      { code: '0003GMax s', dexNr: 3, formCode: 'GMax' },
      { code: '0521 f', dexNr: 521, formCode: '' },
      { code: '0892R', dexNr: 892, formCode: 'R' },
    ]);
  });

  it('appends a form given as a named parameter to the form letters', () => {
    expect(parseMspGoCodes('{{MSP/GO|size=80|0222|form=G|Corsola}}')).toEqual([
      { code: '0222 (form=G)', dexNr: 222, formCode: 'G' },
    ]);
  });

  it('throws on a template without a dex-number code', () => {
    expect(() => parseMspGoCodes('{{MSP/GO|West Sea}}')).toThrow(/unrecognized MSP\/GO code/);
  });
});

describe('parseReleaseDate', () => {
  it.each([
    ['Oct 26, 2024', '2024-10-26'],
    ['Sep 4, 2024', '2024-09-04'],
    ['Sept. 4, 2024', '2024-09-04'],
    ['November 6, 2026 (global)', '2026-11-06'],
  ])('parses %s', (cell, expected) => {
    expect(parseReleaseDate(cell)).toBe(expected);
  });

  it.each(['TBA', 'Foo 1, 2024', '2024-10-26'])('returns null for %s', (cell) => {
    expect(parseReleaseDate(cell)).toBeNull();
  });
});

describe('extractSection', () => {
  const wikitext = [
    '==First==',
    'first body',
    '===Nested===',
    'nested body',
    '==Second==',
    'second body',
  ].join('\n');

  it('returns the body up to the next heading of the same level, including subsections', () => {
    expect(extractSection(wikitext, 'First')).toBe('first body\n===Nested===\nnested body');
  });

  it('runs to the end of the page for the last section', () => {
    expect(extractSection(wikitext, 'Second')).toBe('second body');
  });

  it('stops a subsection at the next higher-level heading', () => {
    expect(extractSection(wikitext, 'Nested')).toBe('nested body');
  });

  it('throws when the heading is missing', () => {
    expect(() => extractSection(wikitext, 'Missing')).toThrow(/section "Missing" not found/);
  });
});

describe('parseDynamaxReleases', () => {
  it('reads dated species from the release table only, merging gender variants', () => {
    const releases = parseDynamaxReleases(
      dynamaxPage([row('Jun 1, 2025', '{{MSP/GO|0415|Combee}}{{MSP/GO|0415 f|Combee}}')])
    );

    expect(releases).toContainEqual({ dexNr: 415, form: null, releasedOn: '2025-06-01' });
    expect(releases.filter((r) => r.dexNr === 415)).toHaveLength(1);
    expect(releases.some((r) => r.dexNr === 150 || r.dexNr === 151)).toBe(false);
    expect(releases).toHaveLength(101);
  });

  it('keeps announced future releases, with their date', () => {
    const releases = parseDynamaxReleases(
      dynamaxPage([row('Oct 19, 2026', '{{MSP/GO|0215|Sneasel}}')])
    );

    expect(releases).toContainEqual({ dexNr: 215, form: null, releasedOn: '2026-10-19' });
  });

  it('keeps the earliest date for a Pokemon listed in more than one row', () => {
    const releases = parseDynamaxReleases(
      dynamaxPage([
        row('Jul 1, 2025', '{{MSP/GO|0850|Sizzlipede}}'),
        row('May 1, 2025', '{{MSP/GO|0850|Sizzlipede}}'),
        row('Aug 1, 2025', '{{MSP/GO|0850|Sizzlipede}}'),
      ])
    );

    expect(releases.filter((r) => r.dexNr === 850)).toEqual([
      { dexNr: 850, form: null, releasedOn: '2025-05-01' },
    ]);
  });

  it('maps per-form codes to pokemon-go-api form values', () => {
    const releases = parseDynamaxReleases(
      dynamaxPage([
        row('Nov 16, 2024', '{{MSP/GO|0849A|Toxtricity}}{{MSP/GO|0849L|Toxtricity}}'),
        row('Feb 1, 2025', '{{MSP/GO|0892|Urshifu}}{{MSP/GO|0892R|Urshifu}}'),
      ])
    );

    expect(releases).toEqual(
      expect.arrayContaining([
        { dexNr: 849, form: 'AMPED', releasedOn: '2024-11-16' },
        { dexNr: 849, form: 'LOW_KEY', releasedOn: '2024-11-16' },
        { dexNr: 892, form: 'SINGLE_STRIKE', releasedOn: '2025-02-01' },
        { dexNr: 892, form: 'RAPID_STRIKE', releasedOn: '2025-02-01' },
      ])
    );
    expect(releases.some((r) => (r.dexNr === 849 || r.dexNr === 892) && !r.form)).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([
    ['an unmapped form letter', '{{MSP/GO|0555G|Darmanitan}}', 555, '"0555G"'],
    [
      'an unlisted letter for a species with mapped forms',
      '{{MSP/GO|0849X|Toxtricity}}',
      849,
      '"0849X"',
    ],
  ])('treats %s as the whole species and warns', (_, pokemon, dexNr, warning) => {
    const releases = parseDynamaxReleases(dynamaxPage([row('Jun 1, 2025', pokemon)]));

    expect(releases).toContainEqual({ dexNr, form: null, releasedOn: '2025-06-01' });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(warning));
  });

  it.each(['TBA', 'tbd (summer)'])('skips rows with an unscheduled %s date and warns', (date) => {
    const releases = parseDynamaxReleases(dynamaxPage([row(date, '{{MSP/GO|0483|Dialga}}')]));

    expect(releases.some((r) => r.dexNr === 483)).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`"${date}"`));
  });

  it.each(['Sometime 2026', '2026-06-01', 'Foo 1, 2026'])(
    'throws on a row with an unreadable %s date',
    (date) => {
      expect(() =>
        parseDynamaxReleases(dynamaxPage([row(date, '{{MSP/GO|0483|Dialga}}')]))
      ).toThrow(/unreadable release date/);
    }
  );

  it('reads inline cells and cells wrapped onto following lines', () => {
    const releases = parseDynamaxReleases(
      dynamaxPage([
        '|- style=background:#FFF\n| Mar 1, 2026 || {{MSP/GO|0129|Magikarp}} || Notes.',
        '|- style=background:#FFF\n| Apr 1, 2026\n| {{MSP/GO|0237|Hitmontop}}\n{{MSP/GO|0349|Feebas}}\n| Notes.',
      ])
    );

    expect(releases).toEqual(
      expect.arrayContaining([
        { dexNr: 129, form: null, releasedOn: '2026-03-01' },
        { dexNr: 237, form: null, releasedOn: '2026-04-01' },
        { dexNr: 349, form: null, releasedOn: '2026-04-01' },
      ])
    );
  });

  it.each([
    ['too few cells', '|- style=background:#FFF\n| {{MSP/GO|0483|Dialga}}'],
    [
      'a rowspan date',
      '|- style=background:#FFF\n| rowspan=2 | Nov 6, 2026\n| {{MSP/GO|0483|Dialga}}\n| Notes.',
    ],
  ])('throws on a row with %s', (_, unexpectedRow) => {
    expect(() => parseDynamaxReleases(dynamaxPage([unexpectedRow]))).toThrow(
      /unexpected release row layout/
    );
  });

  it.each(['[[Dialga]]', '{{MSP|0483|Dialga}}', ''])(
    'throws on a row whose Pokemon cell %j has no MSP/GO code',
    (pokemon) => {
      expect(() => parseDynamaxReleases(dynamaxPage([row('Jun 1, 2025', pokemon)]))).toThrow(
        /no MSP\/GO Pokemon in release row/
      );
    }
  );

  it('throws when far fewer species than expected are parsed', () => {
    expect(() => parseDynamaxReleases(dynamaxPage([], 20))).toThrow(
      /only 20 Dynamax species parsed/
    );
  });

  it('throws when the section has no release table', () => {
    const page = '==List of Pokémon capable of Dynamaxing by release date==\nNo table here.';

    expect(() => parseDynamaxReleases(page)).toThrow(/release table not found/);
  });
});

describe('parseGigantamaxReleases', () => {
  it('reads only the released table and strips the GMax suffix', () => {
    const releases = parseGigantamaxReleases(
      availabilityPage([
        row('Mar 28, 2026', '{{MSP/GO|0025GMax|Pikachu}}'),
        row('Jun 1, 2026', '{{MSP/GO|0892GMax|Urshifu}}{{MSP/GO|0892RGMax|Urshifu}}'),
        row('Nov 6, 2026', '{{MSP/GO|0884GMax|Duraludon}}'),
      ])
    );

    expect(releases).toEqual(
      expect.arrayContaining([
        { dexNr: 25, form: null, releasedOn: '2026-03-28' },
        { dexNr: 892, form: 'SINGLE_STRIKE', releasedOn: '2026-06-01' },
        { dexNr: 892, form: 'RAPID_STRIKE', releasedOn: '2026-06-01' },
        { dexNr: 884, form: null, releasedOn: '2026-11-06' },
      ])
    );
    // Unreleased-table (Eevee) and other-section (Venusaur Mega, Farfetch'd)
    // Pokemon are excluded.
    expect(releases.some((r) => [133, 3, 83].includes(r.dexNr))).toBe(false);
    expect(releases).toHaveLength(19);
  });

  it("reads Toxtricity's single Gigantamax code as the whole species without warning", () => {
    const releases = parseGigantamaxReleases(
      availabilityPage([row('Nov 16, 2024', '{{MSP/GO|0849GMax|Toxtricity}}')])
    );

    expect(releases).toContainEqual({ dexNr: 849, form: null, releasedOn: '2024-11-16' });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('throws on a non-Gigantamax code in the release table', () => {
    expect(() =>
      parseGigantamaxReleases(availabilityPage([row('Mar 28, 2026', '{{MSP/GO|0025|Pikachu}}')]))
    ).toThrow(/"0025" in the Gigantamax table isn't a GMax code/);
  });

  it('throws when far fewer species than expected are parsed', () => {
    expect(() => parseGigantamaxReleases(availabilityPage([], 3))).toThrow(
      /only 3 Gigantamax species parsed/
    );
  });
});

describe('parseSpeciesReleases', () => {
  function parse(options: Parameters<typeof speciesSections>[0]) {
    return parseSpeciesReleases(availabilityPage([], 15, speciesSections(options)));
  }

  it('dates every species in the date table and ignores the other tables', () => {
    const releases = parse({});

    expect(releases).toHaveLength(900);
    expect(releases).toContainEqual({ dexNr: 1, formCode: '', releasedOn: '2016-07-06' });
    // The unreleased-forms table's Gimmighoul (0999Z) isn't read as a species.
    expect(releases.some((r) => r.dexNr === 999)).toBe(false);
  });

  it('counts species in a commented-out row as listed for the gap check', () => {
    const releases = parse({
      rows: [
        `<!--${row('Nov 14, 2026', '{{MSP/GO|0902|Basculegion}}')}-->`,
        row('Jan 1, 2020', '{{MSP/GO|0903|Sneasler}}'),
      ],
    });

    expect(releases.some((r) => r.dexNr === 902)).toBe(false);
    expect(releases).toContainEqual({ dexNr: 903, formCode: '', releasedOn: '2020-01-01' });
  });

  it('ignores a commented-out row', () => {
    const releases = parse({
      rows: [`<!--${row('Jan 1, 2020', '{{MSP/GO|0901|Ursaluna}}')}-->`],
    });

    expect(releases.some((r) => r.dexNr === 901)).toBe(false);
  });

  it('keeps form letters and the earliest date per species and form', () => {
    const releases = parse({
      rows: [
        row('Jun 28, 2019', '{{MSP/GO|0019A|Rattata}}'),
        row('Mar 1, 2020', '{{MSP/GO|0019A|Rattata}}{{MSP/GO|0902|Basculegion}}'),
        row('Jan 1, 2020', '{{MSP/GO|0902 f|Basculegion}}'),
      ],
    });

    expect(releases).toEqual(
      expect.arrayContaining([
        { dexNr: 19, formCode: '', releasedOn: '2016-07-06' },
        { dexNr: 19, formCode: 'A', releasedOn: '2019-06-28' },
        { dexNr: 902, formCode: '', releasedOn: '2020-01-01' },
      ])
    );
    expect(releases.filter((r) => r.dexNr === 902)).toHaveLength(1);
  });

  it('keeps announced debuts, reading the first date of a multi-date cell', () => {
    const releases = parse({
      rows: [row('Nov 14, 2026/Dec 11, 2026/May 3, 2027', '{{MSP/GO|0902|Basculegion}}')],
    });

    expect(releases).toContainEqual({ dexNr: 902, formCode: '', releasedOn: '2026-11-14' });
  });

  it('counts a species in a TBA/TBD row as listed without dating it', () => {
    const releases = parse({ rows: [row('TBA', '{{MSP/GO|0902|Basculegion}}')] });

    expect(releases.some((r) => r.dexNr === 902)).toBe(false);
  });

  it('reads a regional form given as a named form parameter', () => {
    const releases = parse({ rows: [row('Mar 1, 2022', '{{MSP/GO|0222|form=G|Corsola}}')] });

    expect(releases).toContainEqual({ dexNr: 222, formCode: 'G', releasedOn: '2022-03-01' });
  });

  it('accepts both MSP and MSP/GO templates in the unreleased list', () => {
    expect(() => parse({ unreleased: [901, 902, 903] })).not.toThrow();
  });

  it('throws when a species is neither dated nor listed as unreleased', () => {
    expect(() =>
      parse({ rows: [row('Jan 1, 2020', '{{MSP/GO|0905|Overqwil}}')], unreleased: [901, 903] })
    ).toThrow(/species 902, 904 are neither dated nor listed as unreleased/);
  });

  it('throws when far fewer species than expected are dated', () => {
    expect(() => parse({ fillerCount: 500, unreleased: [] })).toThrow(
      /only 500 dated species parsed/
    );
  });
});

describe('parseMegaReleases', () => {
  function parse(rows: string[], fillerCount?: number) {
    return parseMegaReleases(availabilityPage([], 15, undefined, megaSection(rows, fillerCount)));
  }

  it('maps Mega and Primal codes to their form suffixes', () => {
    const releases = parse([
      row('Aug 27, 2020', '{{MSP/GO|0006MX|Charizard}}{{MSP/GO|0006MY|Charizard}}'),
      row('Feb 18, 2023', '{{MSP/GO|0382P|Kyogre}}'),
      row('Sep 18, 2020', '{{MSP/GO|0018M|Pidgeot}}'),
      row('Mar 1, 2027', '{{MSP/GO|0445MZ|Garchomp}}'),
    ]);

    expect(releases).toEqual(
      expect.arrayContaining([
        { dexNr: 445, form: 'MEGA_Z', releasedOn: '2027-03-01' },
        { dexNr: 6, form: 'MEGA_X', releasedOn: '2020-08-27' },
        { dexNr: 6, form: 'MEGA_Y', releasedOn: '2020-08-27' },
        { dexNr: 382, form: 'PRIMAL', releasedOn: '2023-02-18' },
        { dexNr: 18, form: 'MEGA', releasedOn: '2020-09-18' },
      ])
    );
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('keeps the earliest date and announced future releases', () => {
    const releases = parse([
      row('Jul 18, 2026', '{{MSP/GO|0026MX|Raichu}}'),
      row('Jan 1, 2025', '{{MSP/GO|0026MX|Raichu}}'),
      row('Oct 31, 2026', '{{MSP/GO|0609M|Chandelure}}'),
    ]);

    expect(releases.filter((r) => r.dexNr === 26)).toEqual([
      { dexNr: 26, form: 'MEGA_X', releasedOn: '2025-01-01' },
    ]);
    expect(releases).toContainEqual({ dexNr: 609, form: 'MEGA', releasedOn: '2026-10-31' });
  });

  it('ignores the MSP/HOME "yet to be released" table', () => {
    const releases = parse([]);

    expect(releases).toHaveLength(40);
    expect(releases.some((r) => r.dexNr === 36 || r.dexNr === 359)).toBe(false);
  });

  it('throws on an unmapped code rather than dating every Mega of the species', () => {
    expect(() => parse([row('Mar 1, 2027', '{{MSP/GO|0978DM|Tatsugiri}}')])).toThrow(
      /no Mega mapping for "0978DM"/
    );
  });

  it('throws when far fewer species than expected are parsed', () => {
    expect(() => parse([], 10)).toThrow(/only 10 Mega species parsed/);
  });
});

describe('stripComments', () => {
  it('removes single- and multi-line HTML comments', () => {
    expect(stripComments('a<!-- one -->b<!--\ntwo\n-->c')).toBe('abc');
  });

  it('treats an unclosed comment as running to the end, as MediaWiki does', () => {
    expect(stripComments('a<!-- one -->b<!-- never closed\n{{row|1}}')).toBe('ab');
  });
});

describe('templateCalls', () => {
  it('splits top-level arguments, keeping nested templates and links whole', () => {
    expect(
      templateCalls('x {{row|1|{{MSP/GO|0001 s|A}}|[[Link|text]]|n=v}} y {{row|2}}', 'row')
    ).toEqual([['1', '{{MSP/GO|0001 s|A}}', '[[Link|text]]', 'n=v'], ['2']]);
  });

  it('ignores templates with other names', () => {
    expect(templateCalls('{{other|1}}{{rows|2}}', 'row')).toEqual([]);
  });

  it('throws when unbalanced brackets run one call into the next', () => {
    expect(() => templateCalls('{{row|1|[[Link|text\n{{row|2|x}}]]}}', 'row')).toThrow(
      /unbalanced brackets in \{\{row\|1[\s\S]*ran into the next call/
    );
  });

  it('throws on a closer that does not match its opener', () => {
    expect(() => templateCalls('{{row|1|[[Link}}|x}}', 'row')).toThrow(
      /unbalanced brackets in \{\{row\|1…\}\}: unexpected \}\}/
    );
    expect(() => templateCalls('{{row|1|{{tt|x]]|y}}', 'row')).toThrow(/unexpected \]\]/);
  });

  it('throws on an orphan ]]', () => {
    expect(() => templateCalls('{{row|1|x]]|y}}', 'row')).toThrow(/unexpected \]\]/);
  });

  it('throws on an unclosed template', () => {
    expect(() => templateCalls('{{row|1|{{tt|x}}', 'row')).toThrow(/unclosed \{\{row\}\}/);
  });
});

describe('parseShinyReleases', () => {
  it("reads codes from both cells with the family row's first date", () => {
    const releases = parseShinyReleases(
      shinyPage([
        shinyRow({
          dex: 1,
          family: 'Bulbasaur',
          encounter: ['0001 s|Bulbasaur|shadow=yes', '0003GMax s'],
          evolution: ['0003M s'],
          date: 'March 25, 2018',
        }),
      ])
    );

    expect(releases).toEqual(
      expect.arrayContaining([
        { dexNr: 1, formCode: '', dynamax: false, releasedOn: '2018-03-25' },
        { dexNr: 3, formCode: 'GMax', dynamax: false, releasedOn: '2018-03-25' },
        { dexNr: 3, formCode: 'M', dynamax: false, releasedOn: '2018-03-25' },
      ])
    );
  });

  it('reads the positional date cell when a row has no datesort', () => {
    const releases = parseShinyReleases(
      shinyPage([
        shinyRow({
          dex: 808,
          family: 'Meltan',
          encounter: ['0808 s'],
          evolution: ['0809 s'],
          date: 'February 5, 2019',
          dateSort: false,
        }),
      ])
    );

    expect(releases).toContainEqual({
      dexNr: 809,
      formCode: '',
      dynamax: false,
      releasedOn: '2019-02-05',
    });
  });

  it('flags every code in a row with a shiny Dynamax member', () => {
    const releases = parseShinyReleases(
      shinyPage([
        shinyRow({
          dex: 1,
          family: 'Bulbasaur',
          encounter: ['0001 s|Bulbasaur|dynamax=yes', '0003 s'],
          date: 'March 25, 2018',
        }),
      ])
    );

    expect(releases.filter((r) => r.dexNr === 1 || r.dexNr === 3).map((r) => r.dynamax)).toEqual([
      true,
      true,
    ]);
  });

  it('ignores commented-out rows and dates', () => {
    const releases = parseShinyReleases(
      shinyPage([
        `{{lop/shiny/GO|0624|Pawniard|{{MSP/GO|size=80|0624 s|Pawniard}}||<!--November 21, 2026 -->November 14, 2022|Event|0.2%}}`,
      ])
    );

    // The page's commented-out Zorua placeholder row isn't listed.
    expect(releases.some((r) => r.dexNr === 570)).toBe(false);
    expect(releases).toContainEqual({
      dexNr: 624,
      formCode: '',
      dynamax: false,
      releasedOn: '2022-11-14',
    });
  });

  it('keeps the earliest date for a code listed in more than one row', () => {
    const releases = parseShinyReleases(
      shinyPage([
        shinyRow({ dex: 25, family: 'Pikachu', encounter: ['0026 s'], date: 'August 9, 2017' }),
        shinyRow({
          dex: 26,
          family: 'Raichu',
          encounter: ['0026 s'],
          date: 'March 3, 2026',
          form: 'Alolan Form',
        }),
      ])
    );

    expect(releases.filter((r) => r.dexNr === 26)).toEqual([
      { dexNr: 26, formCode: '', dynamax: false, releasedOn: '2017-08-09' },
    ]);
  });

  it('skips a row with an unscheduled date and warns', () => {
    const releases = parseShinyReleases(
      shinyPage([shinyRow({ dex: 570, family: 'Zorua', encounter: ['0570 s'], date: 'TBA' })])
    );

    expect(releases.some((r) => r.dexNr === 570)).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Zorua'));
  });

  it('throws on an unreadable date', () => {
    expect(() =>
      parseShinyReleases(
        shinyPage([shinyRow({ dex: 1, family: 'Bulbasaur', encounter: ['0001 s'], date: 'Soon' })])
      )
    ).toThrow(/unreadable shiny date "Soon/);
  });

  it('throws on a row with no Pokemon codes or too few arguments', () => {
    expect(() =>
      parseShinyReleases(shinyPage(['{{lop/shiny/GO|0001|Bulbasaur|||March 25, 2018|Event}}']))
    ).toThrow(/no MSP\/GO Pokemon in shiny row for Bulbasaur/);
    expect(() => parseShinyReleases(shinyPage(['{{lop/shiny/GO|0001|Bulbasaur}}']))).toThrow(
      /unexpected shiny row layout/
    );
  });

  it('throws when far fewer families than expected are parsed', () => {
    expect(() => parseShinyReleases(shinyPage([], 50))).toThrow(/only 50 shiny families parsed/);
  });
});

describe('fetchWikitext', () => {
  function stubFetch(response: { ok: boolean; status: number; body: unknown }) {
    const fetchMock = vi.fn((_input: URL, _init?: RequestInit) =>
      Promise.resolve({
        ok: response.ok,
        status: response.status,
        statusText: response.ok ? 'OK' : 'Error',
        json: () => Promise.resolve(response.body),
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it("requests the page's wikitext from the MediaWiki API", async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, body: { parse: { wikitext: 'text' } } });

    await expect(fetchWikitext('Dynamax (GO)')).resolves.toBe('text');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.origin + url.pathname).toBe('https://bulbapedia.bulbagarden.net/w/api.php');
    expect(url.searchParams.get('action')).toBe('parse');
    expect(url.searchParams.get('page')).toBe('Dynamax (GO)');
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.['User-Agent']).toContain('go-gather');
  });

  it('throws when the request fails', async () => {
    stubFetch({ ok: false, status: 503, body: {} });

    await expect(fetchWikitext('Dynamax (GO)')).rejects.toThrow(
      /failed to fetch "Dynamax \(GO\)": 503/
    );
  });

  it('throws when the API returns an error instead of wikitext', async () => {
    stubFetch({
      ok: true,
      status: 200,
      body: { error: { info: "The page you specified doesn't exist." } },
    });

    await expect(fetchWikitext('Dynamax (GO)')).rejects.toThrow(/doesn't exist/);
  });
});
