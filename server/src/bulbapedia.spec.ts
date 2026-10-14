import {
  extractSection,
  fetchMaxReleases,
  parseDynamaxReleases,
  parseGigantamaxReleases,
  parseMspGoCodes,
  parseReleaseDate,
} from './bulbapedia';

const AS_OF = new Date('2026-10-14T12:00:00Z');

function row(date: string, pokemon: string): string {
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

function dynamaxPage(rows: string[], fillerCount = 100): string {
  return [
    'Intro mentioning {{MSP/GO|0150|Mewtwo}} outside any section.',
    '==List of Pokémon capable of Dynamaxing by release date==',
    ...table([row('Sep 4, 2024', fillerCodes(fillerCount, 600)), ...rows]),
    '==Bugs and errors==',
    '| {{MSP/GO|0151|Mew}}',
  ].join('\n');
}

function availabilityPage(rows: string[], fillerCount = 15): string {
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
  it('reads species from the release table only, merging gender variants', () => {
    const releases = parseDynamaxReleases(
      dynamaxPage([row('Jun 1, 2025', '{{MSP/GO|0415|Combee}}{{MSP/GO|0415 f|Combee}}')]),
      AS_OF
    );

    expect(releases).toContainEqual({ dexNr: 415, form: null });
    expect(releases.filter((r) => r.dexNr === 415)).toHaveLength(1);
    expect(releases.some((r) => r.dexNr === 150 || r.dexNr === 151)).toBe(false);
    expect(releases).toHaveLength(101);
  });

  it('maps per-form codes to pokemon-go-api form values', () => {
    const releases = parseDynamaxReleases(
      dynamaxPage([
        row('Nov 16, 2024', '{{MSP/GO|0849A|Toxtricity}}{{MSP/GO|0849L|Toxtricity}}'),
        row('Feb 1, 2025', '{{MSP/GO|0892|Urshifu}}{{MSP/GO|0892R|Urshifu}}'),
      ]),
      AS_OF
    );

    expect(releases).toEqual(
      expect.arrayContaining([
        { dexNr: 849, form: 'AMPED' },
        { dexNr: 849, form: 'LOW_KEY' },
        { dexNr: 892, form: 'SINGLE_STRIKE' },
        { dexNr: 892, form: 'RAPID_STRIKE' },
      ])
    );
    expect(releases.some((r) => (r.dexNr === 849 || r.dexNr === 892) && !r.form)).toBe(false);
  });

  it('includes releases dated today and skips announced future ones', () => {
    const releases = parseDynamaxReleases(
      dynamaxPage([
        row('Oct 14, 2026', '{{MSP/GO|0850|Sizzlipede}}'),
        row('Oct 19, 2026', '{{MSP/GO|0215|Sneasel}}{{MSP/GO|0461|Weavile}}'),
      ]),
      AS_OF
    );

    expect(releases).toContainEqual({ dexNr: 850, form: null });
    expect(releases.some((r) => r.dexNr === 215 || r.dexNr === 461)).toBe(false);
  });

  it('treats an unmapped form letter as the whole species and warns', () => {
    const releases = parseDynamaxReleases(
      dynamaxPage([row('Jun 1, 2025', '{{MSP/GO|0555G|Darmanitan}}')]),
      AS_OF
    );

    expect(releases).toContainEqual({ dexNr: 555, form: null });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"0555G"'));
  });

  it('skips rows with an unreadable date and warns', () => {
    const releases = parseDynamaxReleases(
      dynamaxPage([row('TBA', '{{MSP/GO|0483|Dialga}}')]),
      AS_OF
    );

    expect(releases.some((r) => r.dexNr === 483)).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"TBA"'));
  });

  it('throws when far fewer species than expected are parsed', () => {
    expect(() => parseDynamaxReleases(dynamaxPage([], 20), AS_OF)).toThrow(
      /only 20 Dynamax species parsed/
    );
  });

  it('throws when the section has no release table', () => {
    const page = '==List of Pokémon capable of Dynamaxing by release date==\nNo table here.';

    expect(() => parseDynamaxReleases(page, AS_OF)).toThrow(/release table not found/);
  });
});

describe('parseGigantamaxReleases', () => {
  it('reads only the released table and strips the GMax suffix', () => {
    const releases = parseGigantamaxReleases(
      availabilityPage([
        row('Mar 28, 2026', '{{MSP/GO|0025GMax|Pikachu}}'),
        row('Jun 1, 2026', '{{MSP/GO|0892GMax|Urshifu}}{{MSP/GO|0892RGMax|Urshifu}}'),
        row('Nov 6, 2026', '{{MSP/GO|0884GMax|Duraludon}}'),
      ]),
      AS_OF
    );

    expect(releases).toEqual(
      expect.arrayContaining([
        { dexNr: 25, form: null },
        { dexNr: 892, form: 'SINGLE_STRIKE' },
        { dexNr: 892, form: 'RAPID_STRIKE' },
      ])
    );
    // Upcoming (Duraludon), unreleased-table (Eevee) and other-section
    // (Venusaur Mega, Farfetch'd) Pokemon are all excluded.
    expect(releases.some((r) => [884, 133, 3, 83].includes(r.dexNr))).toBe(false);
    expect(releases).toHaveLength(18);
  });

  it('throws on a non-Gigantamax code in the release table', () => {
    expect(() =>
      parseGigantamaxReleases(
        availabilityPage([row('Mar 28, 2026', '{{MSP/GO|0025|Pikachu}}')]),
        AS_OF
      )
    ).toThrow(/"0025" in the Gigantamax table isn't a GMax code/);
  });

  it('throws when far fewer species than expected are parsed', () => {
    expect(() => parseGigantamaxReleases(availabilityPage([], 3), AS_OF)).toThrow(
      /only 3 Gigantamax species parsed/
    );
  });
});

describe('fetchMaxReleases', () => {
  function stubFetch(responses: Record<string, { ok: boolean; status: number; body: unknown }>) {
    const fetchMock = vi.fn((input: URL, _init?: RequestInit) => {
      const page = input.searchParams.get('page') ?? '';
      const response = responses[page];
      return Promise.resolve({
        ok: response.ok,
        status: response.status,
        statusText: response.ok ? 'OK' : 'Error',
        json: () => Promise.resolve(response.body),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  const okPages = {
    'Dynamax (GO)': {
      ok: true,
      status: 200,
      body: { parse: { wikitext: dynamaxPage([row('Jun 1, 2025', '{{MSP/GO|0415|Combee}}')]) } },
    },
    'List of Pokémon by availability in Pokémon GO': {
      ok: true,
      status: 200,
      body: { parse: { wikitext: availabilityPage([]) } },
    },
  };

  it('fetches both pages through the MediaWiki API and parses them', async () => {
    const fetchMock = stubFetch(okPages);

    const releases = await fetchMaxReleases(AS_OF);

    expect(releases.dynamax).toContainEqual({ dexNr: 415, form: null });
    expect(releases.gigantamax).toHaveLength(15);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.origin + url.pathname).toBe('https://bulbapedia.bulbagarden.net/w/api.php');
    expect(url.searchParams.get('action')).toBe('parse');
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.['User-Agent']).toContain('go-gather');
  });

  it('throws when a page request fails', async () => {
    stubFetch({ ...okPages, 'Dynamax (GO)': { ok: false, status: 503, body: {} } });

    await expect(fetchMaxReleases(AS_OF)).rejects.toThrow(/failed to fetch "Dynamax \(GO\)": 503/);
  });

  it('throws when the API returns an error instead of wikitext', async () => {
    stubFetch({
      ...okPages,
      'Dynamax (GO)': {
        ok: true,
        status: 200,
        body: { error: { info: "The page you specified doesn't exist." } },
      },
    });

    await expect(fetchMaxReleases(AS_OF)).rejects.toThrow(/doesn't exist/);
  });
});
