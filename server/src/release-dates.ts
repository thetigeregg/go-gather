/**
 * Stamps each catalog entry with the date it debuted (or is announced to
 * debut) in Pokemon GO, from the saved Bulbapedia availability data (see
 * bulbapedia.ts). Runs on transform.ts's output rather than inside it, so
 * the ported flattening logic stays untouched. The app compares `releasedOn`
 * against the device's own date to decide what's out.
 *
 * Rules, most specific first:
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
 * Without any saved species data yet (see availability-store.ts's
 * loadAvailability), every species counts as released since Pokemon GO's
 * launch — the behaviour from before species dates existed. Without saved
 * Mega data, Megas fall back to the species rule, as before Mega dates
 * existed.
 */
import { Region, type CatalogEntry } from '@go-gather/shared';
import type { LoadedAvailability } from './availability-store.js';
import { keepEarliest, type DatedMaxRelease } from './bulbapedia.js';
import { DYNAMAX_FORM, GIGANTAMAX_FORM } from './max-forms.js';
import type { UnstampedCatalogEntry } from './transform.js';

/** Pokemon GO's launch day — the release date for anything known to be
 * released without a more specific date (see db.ts's migration too). */
export const GO_LAUNCH_DATE = '2016-07-06';

/** Bulbapedia's regional-form letters. Other letters are species-specific
 * forms (Deoxys `A` is Attack Forme, not Alolan), but a species-specific
 * letter only ever reaches a lookup for an entry that has a region, so the
 * overlap is harmless. */
export const REGION_CODES: Partial<Record<string, Region>> = {
  A: Region.Alola,
  G: Region.Galar,
  H: Region.Hisui,
  P: Region.Paldea,
};

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

export function stampReleaseDates(
  entries: UnstampedCatalogEntry[],
  availability: LoadedAvailability
): CatalogEntry[] {
  const speciesDates = new Map<string, Dated>();
  const regionDates = new Map<string, Dated>();
  for (const { dexNr, formCode, releasedOn } of availability.species ?? []) {
    keepEarliest(speciesDates, String(dexNr), { releasedOn });
    const region = REGION_CODES[formCode];
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

  function releaseDateFor(entry: UnstampedCatalogEntry): string | null {
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

  return entries.map((entry) => ({ ...entry, releasedOn: releaseDateFor(entry) }));
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
