/**
 * Stamps each catalog entry with the date it debuted (or is announced to
 * debut) in Pokemon GO, from the saved Bulbapedia availability data (see
 * bulbapedia.ts). Runs on transform.ts's output rather than inside it, so
 * the ported flattening logic stays untouched. The app compares `releasedOn`
 * against the device's own date to decide what's out.
 *
 * Rules, most specific first:
 * - An alternate form Bulbapedia lists as not yet available (its "forms yet
 *   to be made available" table, mapped by UNRELEASED_FORM_IDS) isn't
 *   released: null — shiny and XXL/XXS copies included, as they share the
 *   form's `formId`.
 * - Gigantamax / Dynamax entries: that Max release's date — by form when
 *   Bulbapedia lists the form separately (Urshifu's styles), otherwise the
 *   species-level Max release. A Max entry Bulbapedia doesn't list as a Max
 *   release at all isn't released: null.
 * - Mega / Primal entries: that Mega's release date, matched by its form
 *   suffix (`MEGA_X`, `PRIMAL`, …), or null (not released).
 * - Regional-form entries: the earliest debut of that species' regional
 *   code (`0019A` = Alolan Rattata), falling back to the species' own date
 *   when Bulbapedia has no separate regional row.
 * - Everything else (base, gender, other forms, costumes, XXL/XXS): the
 *   species' earliest debut, under any form.
 * - A species Bulbapedia doesn't date at all isn't released: null.
 *
 * Shiny entries then need their shiny listed in Bulbapedia's shiny list too,
 * and are released from the later of the date above and that listing's
 * family shiny debut — null if either is null. Which listing counts depends
 * on the entry: a `…GMax` code for Gigantamax, a family row flagged
 * `dynamax=yes` for Dynamax, the matching Mega code for Megas, a code
 * starting with the region's letter for regional forms (Paldean Tauros is
 * `PC`/`PB`/`PA`), and a plain or species-specific code for everything else.
 * Costumes and species-specific forms (Unown, Vivillon, …) aren't in the
 * shiny list, so they follow their species' shiny.
 *
 * Without any saved species data yet (see availability-store.ts's
 * loadAvailability), every species counts as released since Pokemon GO's
 * launch — the behaviour from before species dates existed. Without saved
 * Mega data, Megas fall back to the species rule, as before Mega dates
 * existed. Without saved shiny data, shiny entries share their non-shiny
 * twin's date, as before shiny data existed.
 */
import { Region, type CatalogEntry } from '@go-gather/shared';
import type { LoadedAvailability } from './availability-store.js';
import {
  GIGANTAMAX_CODE_SUFFIX,
  keepEarliest,
  MEGA_CODES,
  type DatedMaxRelease,
  type DatedShinyRelease,
} from './bulbapedia.js';
import { DYNAMAX_FORM, GIGANTAMAX_FORM } from './max-forms.js';
import type { UnstampedCatalogEntry } from './transform.js';

/** Pokemon GO's launch day — the release date for anything known to be
 * released without a more specific date (see db.ts's migration too). */
export const GO_LAUNCH_DATE = '2016-07-06';

/**
 * Bulbapedia's codes in its "forms yet to be made available" table, written
 * as it writes them (`0555Z`; a `form=` argument's value appended, so
 * `{{MSP|0658|form=A|…}}` is `0658A`), mapped to the catalog `formId` they
 * hide. `null` means a known form with no separate catalog entry, so there's
 * nothing to hide. Every code must be listed: an unknown one is logged by the
 * catalog sync rather than guessed, since a wrong guess could hide a released
 * form. When Niantic releases a form, Bulbapedia moves it to the date table
 * and its entry here simply stops matching.
 */
export const UNRELEASED_FORM_IDS: Partial<Record<string, string | null>> = {
  '0555Z': 'DARMANITAN_ZEN',
  '0555GZ': 'DARMANITAN_GALARIAN_ZEN',
  '0648P': 'MELOETTA_PIROUETTE',
  '0666Fan': 'VIVILLON_FANCY',
  '0666Pok': 'VIVILLON_POKEBALL',
  // Ash-Greninja, Eternal Floette, Ultra Necrozma, Dada Zarude and Bloodmoon
  // Ursaluna have no catalog entry of their own.
  '0658A': null,
  '0670E': null,
  '0800U': null,
  '0893D': null,
  '0901B': null,
  // Gimmighoul's Chest Form. The catalog's only Gimmighoul is the Roaming
  // Form released in GO, and the same plain code is dated as released.
  '0999': null,
};

function unreleasedFormCode(dexNr: number, formCode: string): string {
  return `${String(dexNr).padStart(4, '0')}${formCode}`;
}

/** Bulbapedia's regional-form letters. */
export const REGION_CODES: Partial<Record<string, Region>> = {
  A: Region.Alola,
  G: Region.Galar,
  H: Region.Hisui,
  P: Region.Paldea,
};

/**
 * The region a Bulbapedia form code belongs to, by its first letter — a
 * prefix rather than an exact letter, since some regional forms have longer
 * codes (Paldean Tauros breeds are `PC`/`PB`/`PA`, Galarian Zen Darmanitan
 * `GZ`). A species-specific code that happens to start with one of these
 * letters (Deoxys `A` is Attack Forme, Vivillon `Pa` Poké Ball Pattern)
 * only ever meets an entry with a region, so the overlap is harmless.
 */
function regionForCode(formCode: string): Region | undefined {
  return REGION_CODES[formCode.charAt(0)];
}

interface Dated {
  releasedOn: string;
}

/** A Mega entry's `form` is pokemon-go-api's `megaEvolutions` key, which
 * is always its species id plus a suffix (`CHARIZARD_MEGA_X`,
 * `KYOGRE_PRIMAL`) — the same split transform.ts makes. Returns the suffix
 * Bulbapedia's codes are mapped to, or '' if the key doesn't start with the
 * species id. */
function megaFormSuffix(entry: UnstampedCatalogEntry): string {
  const prefix = `${entry.speciesId}_`;
  return entry.form?.startsWith(prefix) ? entry.form.slice(prefix.length) : '';
}

/** Keyed by `dexNr|assetForm form`, matching the catalog entry's own
 * `form`: `${FORM}_${suffix}` for a form-level release, the bare suffix for
 * a species-level one. */
function maxReleaseDates(releases: DatedMaxRelease[], suffix: string): Map<string, Dated> {
  const dates = new Map<string, Dated>();
  for (const { dexNr, form, releasedOn } of releases) {
    keepEarliest(dates, `${String(dexNr)}|${form ? `${form}_${suffix}` : suffix}`, { releasedOn });
  }
  return dates;
}

/** Earliest family shiny debut per key, by what a shiny-list code is
 * listed as. */
interface ShinyListings {
  /** Keyed by dex number. */
  base: Map<string, Dated>;
  /** Keyed `dexNr|region`. */
  region: Map<string, Dated>;
  /** Keyed `dexNr|suffix`, like megaDates. */
  mega: Map<string, Dated>;
  /** Keyed by dex number. */
  gigantamax: Map<string, Dated>;
  /** Keyed by dex number. */
  dynamax: Map<string, Dated>;
}

function shinyListings(releases: DatedShinyRelease[]): ShinyListings {
  const listings: ShinyListings = {
    base: new Map(),
    region: new Map(),
    mega: new Map(),
    gigantamax: new Map(),
    dynamax: new Map(),
  };
  for (const { dexNr, formCode, dynamax, releasedOn } of releases) {
    const dex = String(dexNr);
    const dated = { releasedOn };
    if (dynamax) {
      keepEarliest(listings.dynamax, dex, dated);
    }
    // GMax first, so `0052GMax` never counts as Galarian Meowth.
    if (formCode.endsWith(GIGANTAMAX_CODE_SUFFIX)) {
      keepEarliest(listings.gigantamax, dex, dated);
      continue;
    }
    const megaSuffix = MEGA_CODES[formCode];
    if (megaSuffix) {
      keepEarliest(listings.mega, `${dex}|${megaSuffix}`, dated);
    }
    // `P` is both Primal and Paldea; harmless for the same reason as in
    // regionForCode.
    const region = regionForCode(formCode);
    if (region) {
      keepEarliest(listings.region, `${dex}|${region}`, dated);
    }
    if (!megaSuffix && !region) {
      keepEarliest(listings.base, dex, dated);
    }
  }
  return listings;
}

function shinyListingDate(entry: UnstampedCatalogEntry, listings: ShinyListings): string | null {
  const dex = String(entry.dexNr);
  const listing =
    entry.pokedexType === 'max'
      ? listings.gigantamax.get(dex)
      : entry.pokedexType === 'dmax'
        ? listings.dynamax.get(dex)
        : entry.pokedexType === 'mega'
          ? listings.mega.get(`${dex}|${megaFormSuffix(entry)}`)
          : entry.region
            ? listings.region.get(`${dex}|${entry.region}`)
            : listings.base.get(dex);
  return listing?.releasedOn ?? null;
}

function laterOf(first: string | null, second: string | null): string | null {
  if (first === null || second === null) {
    return null;
  }
  return first > second ? first : second;
}

interface ReleaseDating {
  /** An entry's date by the rules above, ignoring whether it's shiny. */
  pokemonDate: (entry: UnstampedCatalogEntry) => string | null;
  /** The shiny listings, or null when no shiny data is saved. */
  shiny: ShinyListings | null;
}

function releaseDating(availability: LoadedAvailability): ReleaseDating {
  const speciesDates = new Map<string, Dated>();
  const regionDates = new Map<string, Dated>();
  for (const { dexNr, formCode, releasedOn } of availability.species ?? []) {
    keepEarliest(speciesDates, String(dexNr), { releasedOn });
    const region = regionForCode(formCode);
    if (region) {
      keepEarliest(regionDates, `${String(dexNr)}|${region}`, { releasedOn });
    }
  }
  const gigantamaxDates = maxReleaseDates(availability.gigantamax, GIGANTAMAX_FORM);
  const dynamaxDates = maxReleaseDates(availability.dynamax, DYNAMAX_FORM);
  // Keyed `dexNr|suffix`.
  const megaDates = new Map<string, Dated>();
  for (const { dexNr, form, releasedOn } of availability.mega ?? []) {
    keepEarliest(megaDates, `${String(dexNr)}|${form}`, { releasedOn });
  }
  const unreleasedFormIds = new Set(
    (availability.unreleasedForms ?? []).flatMap(({ dexNr, formCode }) => {
      const formId = UNRELEASED_FORM_IDS[unreleasedFormCode(dexNr, formCode)];
      return formId ? [formId] : [];
    })
  );

  function releaseDateFor(entry: UnstampedCatalogEntry): string | null {
    if (unreleasedFormIds.has(entry.formId)) {
      return null;
    }
    const dexNr = String(entry.dexNr);
    const max =
      entry.pokedexType === 'max'
        ? { dates: gigantamaxDates, suffix: GIGANTAMAX_FORM }
        : entry.pokedexType === 'dmax'
          ? { dates: dynamaxDates, suffix: DYNAMAX_FORM }
          : null;
    if (max) {
      // An entry split by form while Bulbapedia dates the whole species
      // (Toxtricity's `AMPED_GIGANTAMAX`) falls back to the species-level
      // Max release.
      return (
        (max.dates.get(`${dexNr}|${entry.form ?? ''}`) ?? max.dates.get(`${dexNr}|${max.suffix}`))
          ?.releasedOn ?? null
      );
    }

    if (entry.pokedexType === 'mega' && availability.mega) {
      return megaDates.get(`${dexNr}|${megaFormSuffix(entry)}`)?.releasedOn ?? null;
    }

    const speciesDate = availability.species
      ? (speciesDates.get(dexNr)?.releasedOn ?? null)
      : GO_LAUNCH_DATE;
    if (entry.region) {
      return regionDates.get(`${dexNr}|${entry.region}`)?.releasedOn ?? speciesDate;
    }
    return speciesDate;
  }

  return {
    pokemonDate: releaseDateFor,
    shiny: availability.shiny ? shinyListings(availability.shiny) : null,
  };
}

export function stampReleaseDates(
  entries: UnstampedCatalogEntry[],
  availability: LoadedAvailability
): CatalogEntry[] {
  const { pokemonDate, shiny } = releaseDating(availability);
  return entries.map((entry) => {
    const releasedOn = pokemonDate(entry);
    return {
      ...entry,
      releasedOn:
        entry.isShiny && shiny ? laterOf(releasedOn, shinyListingDate(entry, shiny)) : releasedOn,
    };
  });
}

/**
 * Non-shiny Mega entries left without a date by stampReleaseDates, for the
 * catalog sync to log. An undated Mega is hidden as unreleased: right for
 * one Niantic hasn't released, but also what a Bulbapedia row the parser
 * missed looks like. Empty when no Mega data is saved, since Megas are then
 * dated by their species and an undated one points at the species data.
 */
export function undatedMegaNames(
  entries: CatalogEntry[],
  availability: LoadedAvailability
): string[] {
  if (!availability.mega) {
    return [];
  }
  return entries
    .filter((entry) => entry.pokedexType === 'mega' && !entry.isShiny && entry.releasedOn === null)
    .map((entry) => entry.name);
}

/**
 * How many shiny entries stampReleaseDates hides only because Bulbapedia
 * doesn't list their shiny — the Pokemon itself is dated — for the catalog
 * sync to log. Uses the same rules as stampReleaseDates. Zero when no shiny
 * data is saved, since shinies then follow their Pokemon.
 */
export function unlistedShinyCount(
  entries: UnstampedCatalogEntry[],
  availability: LoadedAvailability
): number {
  const { pokemonDate, shiny } = releaseDating(availability);
  if (!shiny) {
    return 0;
  }
  return entries.filter(
    (entry) =>
      entry.isShiny && pokemonDate(entry) !== null && shinyListingDate(entry, shiny) === null
  ).length;
}

/**
 * Codes in Bulbapedia's unreleased-forms table that UNRELEASED_FORM_IDS
 * doesn't know, for the catalog sync to log so they can be mapped. Their
 * forms stay dated (shown) until then.
 */
export function unmappedUnreleasedForms(availability: LoadedAvailability): string[] {
  return (availability.unreleasedForms ?? [])
    .map(({ dexNr, formCode }) => unreleasedFormCode(dexNr, formCode))
    .filter((code) => !Object.hasOwn(UNRELEASED_FORM_IDS, code));
}
