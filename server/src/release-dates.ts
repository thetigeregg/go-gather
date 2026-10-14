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
 *   species-level Max release.
 * - Regional-form entries: the earliest debut of that species' regional
 *   code (`0019A` = Alolan Rattata), falling back to the species' own date
 *   when Bulbapedia has no separate regional row.
 * - Everything else (base, gender, other forms, costumes, Mega, XXL/XXS):
 *   the species' earliest debut, under any form.
 * - A species Bulbapedia doesn't date at all isn't released: null.
 */
import { Region, type CatalogEntry } from '@go-gather/shared';
import type { AvailabilityData, DatedMaxRelease } from './bulbapedia.js';
import { DYNAMAX_FORM, GIGANTAMAX_FORM } from './max-forms.js';
import type { UnstampedCatalogEntry } from './transform.js';

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

function keepEarliest(dates: Map<string, string>, key: string, date: string): void {
  const existing = dates.get(key);
  if (existing === undefined || date < existing) {
    dates.set(key, date);
  }
}

/** Keyed by `dexNr|assetForm form`, matching the catalog entry's own
 * `form`: `${FORM}_${suffix}` for a form-level release, the bare suffix for
 * a species-level one. */
function maxReleaseDates(releases: DatedMaxRelease[], suffix: string): Map<string, string> {
  const dates = new Map<string, string>();
  for (const { dexNr, form, releasedOn } of releases) {
    keepEarliest(dates, `${String(dexNr)}|${form ? `${form}_${suffix}` : suffix}`, releasedOn);
  }
  return dates;
}

export function stampReleaseDates(
  entries: UnstampedCatalogEntry[],
  availability: AvailabilityData
): CatalogEntry[] {
  const speciesDates = new Map<string, string>();
  const regionDates = new Map<string, string>();
  for (const { dexNr, formCode, releasedOn } of availability.species) {
    keepEarliest(speciesDates, String(dexNr), releasedOn);
    const region = REGION_CODES[formCode];
    if (region) {
      keepEarliest(regionDates, `${String(dexNr)}|${region}`, releasedOn);
    }
  }
  const gigantamaxDates = maxReleaseDates(availability.gigantamax, GIGANTAMAX_FORM);
  const dynamaxDates = maxReleaseDates(availability.dynamax, DYNAMAX_FORM);

  function releaseDateFor(entry: UnstampedCatalogEntry): string | null {
    const dexNr = String(entry.dexNr);
    const speciesDate = speciesDates.get(dexNr) ?? null;
    const max =
      entry.pokedexType === 'max'
        ? { dates: gigantamaxDates, suffix: GIGANTAMAX_FORM }
        : entry.pokedexType === 'dmax'
          ? { dates: dynamaxDates, suffix: DYNAMAX_FORM }
          : null;
    if (max) {
      // An entry split by form while Bulbapedia dates the whole species
      // (Toxtricity's `AMPED_GIGANTAMAX`) falls back to the species-level
      // Max release, not the species' own debut.
      return (
        max.dates.get(`${dexNr}|${entry.form ?? ''}`) ??
        max.dates.get(`${dexNr}|${max.suffix}`) ??
        speciesDate
      );
    }
    if (entry.region) {
      return regionDates.get(`${dexNr}|${entry.region}`) ?? speciesDate;
    }
    return speciesDate;
  }

  return entries.map((entry) => ({ ...entry, releasedOn: releaseDateFor(entry) }));
}
