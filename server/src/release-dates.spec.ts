import { Region, type PokedexType } from '@go-gather/shared';
import type { LoadedAvailability } from './availability-store';
import type { AvailabilityData } from './bulbapedia';
import {
  GO_LAUNCH_DATE,
  stampReleaseDates,
  undatedMegaNames,
  unlistedShinyCount,
  unmappedUnreleasedForms,
  unmatchedUnreleasedFormIds,
} from './release-dates';
import type { UnstampedCatalogEntry } from './transform';

function entry(
  dexNr: number,
  overrides: Partial<UnstampedCatalogEntry> & { pokedexType?: PokedexType } = {}
): UnstampedCatalogEntry {
  return {
    id: `${String(dexNr)}-${overrides.form ?? 'base'}`,
    dexNr,
    generation: 1,
    speciesId: `SPECIES_${String(dexNr)}`,
    formId: `SPECIES_${String(dexNr)}`,
    name: `Species ${String(dexNr)}`,
    speciesName: `Species ${String(dexNr)}`,
    imgUrl: `${String(dexNr)}.png`,
    isShiny: false,
    isFemale: false,
    form: null,
    costume: null,
    region: null,
    primaryType: 'POKEMON_TYPE_NORMAL',
    secondaryType: null,
    pokemonClass: null,
    isBaseForm: true,
    pokedexType: 'regular',
    order: 0,
    ...overrides,
  };
}

const availability: AvailabilityData = {
  species: [
    { dexNr: 19, formCode: '', releasedOn: '2016-07-06' },
    { dexNr: 19, formCode: 'A', releasedOn: '2019-06-28' },
    { dexNr: 19, formCode: 'A', releasedOn: '2018-06-01' },
    { dexNr: 52, formCode: '', releasedOn: '2016-07-06' },
    { dexNr: 52, formCode: 'G', releasedOn: '2019-10-01' },
    { dexNr: 128, formCode: '', releasedOn: '2016-07-06' },
    { dexNr: 128, formCode: 'PC', releasedOn: '2023-11-01' },
    { dexNr: 386, formCode: 'A', releasedOn: '2019-02-01' },
    { dexNr: 386, formCode: '', releasedOn: '2018-11-01' },
    { dexNr: 849, formCode: '', releasedOn: '2024-11-16' },
    { dexNr: 892, formCode: '', releasedOn: '2025-02-01' },
    { dexNr: 902, formCode: '', releasedOn: '2026-11-14' },
  ],
  gigantamax: [
    { dexNr: 849, form: null, releasedOn: '2024-11-16' },
    { dexNr: 892, form: 'RAPID_STRIKE', releasedOn: '2026-06-01' },
  ],
  dynamax: [
    { dexNr: 849, form: 'AMPED', releasedOn: '2024-11-17' },
    { dexNr: 892, form: null, releasedOn: '2025-03-01' },
  ],
  mega: [
    { dexNr: 6, form: 'MEGA_X', releasedOn: '2020-08-27' },
    { dexNr: 6, form: 'MEGA_Y', releasedOn: '2020-09-01' },
    { dexNr: 382, form: 'PRIMAL', releasedOn: '2023-02-18' },
  ],
  shiny: [
    { dexNr: 19, formCode: '', dynamax: false, releasedOn: '2017-01-01' },
    { dexNr: 19, formCode: 'A', dynamax: false, releasedOn: '2019-01-01' },
    // Meowth's shiny GMax is listed, Galarian Meowth's shiny isn't.
    { dexNr: 52, formCode: '', dynamax: false, releasedOn: '2016-07-06' },
    { dexNr: 52, formCode: 'GMax', dynamax: false, releasedOn: '2016-07-06' },
    // Paldean Tauros breeds only; plain Tauros' shiny isn't listed.
    { dexNr: 128, formCode: 'PC', dynamax: false, releasedOn: '2024-01-01' },
    { dexNr: 6, formCode: '', dynamax: false, releasedOn: '2018-05-19' },
    { dexNr: 6, formCode: 'MX', dynamax: false, releasedOn: '2018-05-19' },
    // A family whose shiny debuts years after the species (Greavard).
    { dexNr: 386, formCode: '', dynamax: false, releasedOn: '2026-11-01' },
    { dexNr: 849, formCode: '', dynamax: true, releasedOn: '2024-12-01' },
    { dexNr: 849, formCode: 'GMax', dynamax: true, releasedOn: '2024-12-01' },
    { dexNr: 892, formCode: '', dynamax: false, releasedOn: '2025-06-01' },
    { dexNr: 902, formCode: '', dynamax: false, releasedOn: '2026-11-01' },
  ],
  unreleasedForms: [
    { dexNr: 555, formCode: 'GZ' },
    { dexNr: 658, formCode: 'A' },
    { dexNr: 999, formCode: '' },
  ],
};

function releasedOn(unstamped: UnstampedCatalogEntry): string | null {
  return stampReleaseDates([unstamped], availability)[0].releasedOn;
}

describe('stampReleaseDates', () => {
  it("gives regular, costume and size-tier entries the species' earliest debut", () => {
    expect(releasedOn(entry(386))).toBe('2018-11-01');
    expect(releasedOn(entry(386, { costume: 'HOLIDAY', pokedexType: 'costume' }))).toBe(
      '2018-11-01'
    );
    expect(releasedOn(entry(386, { pokedexType: 'xxl' }))).toBe('2018-11-01');
  });

  it("gives a regional form its regional code's earliest debut", () => {
    expect(releasedOn(entry(19, { region: Region.Alola }))).toBe('2018-06-01');
  });

  it("falls back to the species' debut for a regional form with no regional row", () => {
    expect(releasedOn(entry(52, { region: Region.Alola }))).toBe('2016-07-06');
  });

  it('matches regional codes by their first letter, like Paldean Tauros breeds', () => {
    expect(releasedOn(entry(128, { region: Region.Paldea }))).toBe('2023-11-01');
  });

  it('dates a Gigantamax entry by its own form, then by the species-level release', () => {
    expect(releasedOn(entry(892, { form: 'RAPID_STRIKE_GIGANTAMAX', pokedexType: 'max' }))).toBe(
      '2026-06-01'
    );
    // Toxtricity is split by form here but dated as a whole species upstream.
    expect(releasedOn(entry(849, { form: 'AMPED_GIGANTAMAX', pokedexType: 'max' }))).toBe(
      '2024-11-16'
    );
    // A Max entry without a form goes straight to the species-level release.
    expect(releasedOn(entry(849, { pokedexType: 'max' }))).toBe('2024-11-16');
  });

  it('dates a Dynamax entry the same way', () => {
    expect(releasedOn(entry(849, { form: 'AMPED_DYNAMAX', pokedexType: 'dmax' }))).toBe(
      '2024-11-17'
    );
    expect(releasedOn(entry(892, { form: 'DYNAMAX', pokedexType: 'dmax' }))).toBe('2025-03-01');
  });

  it('marks a Max entry with no Max release as not released', () => {
    expect(releasedOn(entry(19, { form: 'DYNAMAX', pokedexType: 'dmax' }))).toBeNull();
    expect(releasedOn(entry(19, { form: 'GIGANTAMAX', pokedexType: 'max' }))).toBeNull();
  });

  function mega(dexNr: number, speciesId: string, suffix: string): UnstampedCatalogEntry {
    return entry(dexNr, { speciesId, form: `${speciesId}_${suffix}`, pokedexType: 'mega' });
  }

  it('dates a Mega or Primal entry by its own form suffix', () => {
    expect(releasedOn(mega(6, 'CHARIZARD', 'MEGA_X'))).toBe('2020-08-27');
    expect(releasedOn(mega(6, 'CHARIZARD', 'MEGA_Y'))).toBe('2020-09-01');
    expect(releasedOn(mega(382, 'KYOGRE', 'PRIMAL'))).toBe('2023-02-18');
  });

  it("doesn't date a Mega from its sibling Megas' releases", () => {
    expect(releasedOn(mega(6, 'CHARIZARD', 'MEGA_Z'))).toBeNull();
  });

  it("can't match a Mega whose form doesn't start with its species id", () => {
    expect(
      releasedOn(entry(6, { speciesId: 'CHARIZARD', form: 'MEGA_X', pokedexType: 'mega' }))
    ).toBeNull();
  });

  it('marks a Mega with no Mega release as not released', () => {
    expect(releasedOn(mega(386, 'DEOXYS', 'MEGA'))).toBeNull();
  });

  it("dates Megas by their species' debut when no Mega data is saved yet", () => {
    const [stamped] = stampReleaseDates([mega(386, 'DEOXYS', 'MEGA')], {
      ...availability,
      mega: null,
    });

    expect(stamped.releasedOn).toBe('2018-11-01');
  });

  it('treats every species as released when no species data is saved yet', () => {
    const [regular, regional, unknown, gmax] = stampReleaseDates(
      [
        entry(386),
        entry(19, { region: Region.Alola }),
        entry(1001),
        entry(892, { form: 'RAPID_STRIKE_GIGANTAMAX', pokedexType: 'max' }),
      ],
      { ...availability, species: null }
    );

    expect(regular.releasedOn).toBe(GO_LAUNCH_DATE);
    expect(regional.releasedOn).toBe(GO_LAUNCH_DATE);
    expect(unknown.releasedOn).toBe(GO_LAUNCH_DATE);
    // Max entries still use their own release dates.
    expect(gmax.releasedOn).toBe('2026-06-01');
  });

  it('keeps announced future debuts as they are', () => {
    expect(releasedOn(entry(902))).toBe('2026-11-14');
  });

  it("marks a species Bulbapedia doesn't date as not released", () => {
    expect(releasedOn(entry(1001))).toBeNull();
    expect(releasedOn(entry(1001, { region: Region.Paldea }))).toBeNull();
  });

  it('keeps every other field and the entry order', () => {
    const entries = [entry(19), entry(386)];

    const stamped = stampReleaseDates(entries, availability);

    expect(stamped).toEqual([
      { ...entries[0], releasedOn: '2016-07-06' },
      { ...entries[1], releasedOn: '2018-11-01' },
    ]);
  });
});

describe('stampReleaseDates for shiny entries', () => {
  const shiny = (dexNr: number, overrides: Partial<UnstampedCatalogEntry> = {}) =>
    entry(dexNr, { isShiny: true, ...overrides });

  it("releases a shiny from the later of its Pokemon's date and its family's shiny debut", () => {
    expect(releasedOn(shiny(19))).toBe('2017-01-01');
    expect(releasedOn(shiny(386))).toBe('2026-11-01');
    expect(releasedOn(shiny(902))).toBe('2026-11-14');
  });

  it("hides a shiny Bulbapedia doesn't list", () => {
    expect(releasedOn(shiny(128))).toBeNull();
    expect(releasedOn(shiny(1001))).toBeNull();
  });

  it('matches regional shinies by the code prefix, never by a GMax code', () => {
    expect(releasedOn(shiny(19, { region: Region.Alola }))).toBe('2019-01-01');
    expect(releasedOn(shiny(128, { region: Region.Paldea }))).toBe('2024-01-01');
    expect(releasedOn(shiny(52, { region: Region.Galar }))).toBeNull();
  });

  it('matches shiny Megas by their form suffix', () => {
    const megaEntry = (suffix: string) =>
      shiny(6, { speciesId: 'CHARIZARD', form: `CHARIZARD_${suffix}`, pokedexType: 'mega' });

    expect(releasedOn(megaEntry('MEGA_X'))).toBe('2020-08-27');
    expect(releasedOn(megaEntry('MEGA_Y'))).toBeNull();
  });

  it('matches shiny Gigantamax by a GMax code and shiny Dynamax by the family flag', () => {
    expect(releasedOn(shiny(849, { form: 'GIGANTAMAX', pokedexType: 'max' }))).toBe('2024-12-01');
    expect(releasedOn(shiny(849, { form: 'AMPED_DYNAMAX', pokedexType: 'dmax' }))).toBe(
      '2024-12-01'
    );
    expect(releasedOn(shiny(892, { form: 'DYNAMAX', pokedexType: 'dmax' }))).toBeNull();
  });

  it("lets costume shinies follow their species' shiny", () => {
    expect(releasedOn(shiny(386, { costume: 'HOLIDAY', pokedexType: 'costume' }))).toBe(
      '2026-11-01'
    );
  });

  it('leaves non-shiny entries alone', () => {
    expect(releasedOn(entry(128))).toBe('2016-07-06');
  });

  it("gives shinies their Pokemon's date when no shiny data is saved yet", () => {
    const [stamped] = stampReleaseDates([shiny(128)], { ...availability, shiny: null });

    expect(stamped.releasedOn).toBe('2016-07-06');
  });
});

describe('stampReleaseDates for unreleased forms', () => {
  const form = (formId: string, overrides: Partial<UnstampedCatalogEntry> = {}) =>
    entry(555, { formId, region: Region.Galar, ...overrides });
  const speciesFor555: AvailabilityData = {
    ...availability,
    species: [
      ...availability.species,
      { dexNr: 555, formCode: '', releasedOn: '2020-01-24' },
      { dexNr: 555, formCode: 'G', releasedOn: '2020-06-03' },
      { dexNr: 999, formCode: '', releasedOn: '2023-11-01' },
    ],
    shiny: [
      ...availability.shiny,
      { dexNr: 555, formCode: 'G', dynamax: false, releasedOn: '2021-01-01' },
    ],
  };
  const dated = (unstamped: UnstampedCatalogEntry) =>
    stampReleaseDates([unstamped], speciesFor555)[0].releasedOn;

  it('hides a listed form, with its shiny and size copies', () => {
    expect(dated(form('DARMANITAN_GALARIAN_ZEN'))).toBeNull();
    expect(dated(form('DARMANITAN_GALARIAN_ZEN', { isShiny: true }))).toBeNull();
    expect(dated(form('DARMANITAN_GALARIAN_ZEN', { pokedexType: 'xxl' }))).toBeNull();
  });

  it("leaves the species' other forms dated", () => {
    expect(dated(form('DARMANITAN_GALARIAN_STANDARD'))).toBe('2020-06-03');
    expect(dated(entry(555, { formId: 'DARMANITAN' }))).toBe('2020-01-24');
  });

  it('hides nothing for a code with no catalog entry', () => {
    expect(dated(entry(999, { formId: 'GIMMIGHOUL' }))).toBe('2023-11-01');
  });

  it('never hides a form the species data dates, even from a stale forms list', () => {
    const [stamped] = stampReleaseDates([form('DARMANITAN_GALARIAN_ZEN')], {
      ...speciesFor555,
      species: [...speciesFor555.species, { dexNr: 555, formCode: 'GZ', releasedOn: '2027-01-01' }],
    });

    expect(stamped.releasedOn).toBe('2020-06-03');
  });

  it('hides nothing when no unreleased-form data is saved', () => {
    const [stamped] = stampReleaseDates([form('DARMANITAN_GALARIAN_ZEN')], {
      ...speciesFor555,
      unreleasedForms: null,
    });

    expect(stamped.releasedOn).toBe('2020-06-03');
  });
});

describe('unmatchedUnreleasedFormIds', () => {
  it('lists forms to hide that no catalog entry has', () => {
    const entries = [entry(555, { formId: 'DARMANITAN_GALARIAN_ZEN' })];
    const listing: LoadedAvailability = {
      ...availability,
      unreleasedForms: [
        { dexNr: 555, formCode: 'GZ' },
        { dexNr: 666, formCode: 'Pok' },
      ],
    };

    expect(unmatchedUnreleasedFormIds(entries, listing)).toEqual(['VIVILLON_POKEBALL']);
  });

  it('lists nothing when no unreleased-form data is saved', () => {
    expect(unmatchedUnreleasedFormIds([], { ...availability, unreleasedForms: null })).toEqual([]);
  });
});

describe('unmappedUnreleasedForms', () => {
  it('lists codes the mapping table does not know', () => {
    expect(
      unmappedUnreleasedForms({
        ...availability,
        unreleasedForms: [
          { dexNr: 555, formCode: 'Z' },
          { dexNr: 25, formCode: 'Q' },
        ],
      })
    ).toEqual(['0025Q']);
  });

  it('lists nothing when no unreleased-form data is saved', () => {
    expect(unmappedUnreleasedForms({ ...availability, unreleasedForms: null })).toEqual([]);
  });
});

describe('unlistedShinyCount', () => {
  const shiny = (dexNr: number, overrides: Partial<UnstampedCatalogEntry> = {}) =>
    entry(dexNr, { isShiny: true, ...overrides });
  const entries = [
    // Pokemon dated, shiny not listed: counted, size copies included.
    shiny(128),
    shiny(128, { pokedexType: 'xxl' }),
    // Shiny listed: not counted.
    shiny(19),
    // Pokemon itself not released: not counted.
    shiny(1001),
    // Not a shiny: not counted.
    entry(128),
  ];

  it("counts shinies hidden only because their shiny isn't listed", () => {
    expect(unlistedShinyCount(entries, availability)).toBe(2);
  });

  it('counts nothing when no shiny data is saved', () => {
    expect(unlistedShinyCount(entries, { ...availability, shiny: null })).toBe(0);
  });
});

describe('undatedMegaNames', () => {
  const megaEntry = (name: string, releasedOn: string | null, isShiny = false) => ({
    ...entry(6, { name, pokedexType: 'mega', isShiny }),
    releasedOn,
  });
  const entries = [
    megaEntry('Mega Charizard X', '2020-08-27'),
    megaEntry('Mega Charizard Z', null),
    megaEntry('Mega Charizard Z', null, true),
    { ...entry(1001), releasedOn: null },
  ];

  it('lists non-shiny Megas left without a date', () => {
    expect(undatedMegaNames(entries, availability)).toEqual(['Mega Charizard Z']);
  });

  it('lists nothing when no Mega data is saved, since Megas then use species dates', () => {
    expect(undatedMegaNames(entries, { ...availability, mega: null })).toEqual([]);
  });
});
