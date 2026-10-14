import { Region, type PokedexType } from '@go-gather/shared';
import type { AvailabilityData } from './bulbapedia';
import { GO_LAUNCH_DATE, stampReleaseDates, undatedMegaNames } from './release-dates';
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
    { dexNr: 128, formCode: '', releasedOn: '2016-07-06' },
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
    // Unmapped Bulbapedia codes: species-level releases. Charizard also has
    // mapped codes, so its one must not spread to its other Megas.
    { dexNr: 6, form: null, releasedOn: '2027-03-01' },
    { dexNr: 445, form: null, releasedOn: '2027-03-01' },
    { dexNr: 382, form: 'PRIMAL', releasedOn: '2023-02-18' },
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
    expect(releasedOn(entry(128, { region: Region.Paldea }))).toBe('2016-07-06');
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

  it('uses a species-level Mega release only for a species with no mapped Mega codes', () => {
    expect(releasedOn(mega(445, 'GARCHOMP', 'MEGA_Z'))).toBe('2027-03-01');
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
