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
 * - A form UNRELEASED_FORM_IDS maps that the species data dates under its
 *   own code (Bulbapedia moved it to the date table once released): that
 *   date, never hidden even if a stale forms list still has it.
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
 * `{{MSP|0658|form=A|…}}` is `0658A`), mapped to the catalog entries they
 * hide: a `formId` string hides every entry with that `formId`, while
 * `{ formId, form }` targets just the one variant whose `form` also matches
 * (`null` for the plain variant) — for a form sharing its `formId` with a
 * released one. `null` means a known form with no separate catalog entry, so
 * there's nothing to hide. Every code must be listed: an unknown one is logged by the
 * catalog sync rather than guessed, since a wrong guess could hide a released
 * form. When Niantic releases a form, Bulbapedia moves it to the date table,
 * and a code the species data dates is never hidden — even if a stale
 * forms list (one that failed to update) still has it — and is dated by
 * that row.
 */
export const UNRELEASED_FORM_IDS: Partial<Record<string, FormTarget | string | null>> = {
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
  // Gimmighoul's Chest Form. Both catalog Gimmighoul entries (plain and
  // `COIN_A1`) are the Roaming Form released in GO, and the same plain code
  // is dated as released.
  '0999': null,
};

function unreleasedFormCode(dexNr: number, formCode: string): string {
  return `${String(dexNr).padStart(4, '0')}${formCode}`;
}

/** Catalog entries an UNRELEASED_FORM_IDS code refers to: every entry with
 * `formId`, or with `form` given, only the one whose `form` also matches. */
export interface FormTarget {
  formId: string;
  form?: string | null;
}

/** The catalog entries a Bulbapedia form code maps to, or null if none. */
function formTargetFor(dexNr: number, formCode: string): FormTarget | null {
  const target = UNRELEASED_FORM_IDS[unreleasedFormCode(dexNr, formCode)];
  if (!target) {
    return null;
  }
  return typeof target === 'string' ? { formId: target } : target;
}

function formTargetKey({ formId, form }: FormTarget): string {
  return form === undefined ? formId : `${formId}|${form ?? ''}`;
}

function matchesFormTarget(entry: UnstampedCatalogEntry, target: FormTarget): boolean {
  return (
    entry.formId === target.formId && (target.form === undefined || entry.form === target.form)
  );
}

/** Form targets with a value each, looked up by catalog entry. */
class FormTargetMap<T> {
  private readonly byFormId = new Map<string, { target: FormTarget; value: T }[]>();

  add(target: FormTarget, value: T): void {
    const forFormId = this.byFormId.get(target.formId) ?? [];
    forFormId.push({ target, value });
    this.byFormId.set(target.formId, forFormId);
  }

  /** A variant target wins over a broad `formId` one, whichever was added
   * first, so a family-wide value never shadows a variant's own. */
  get(entry: UnstampedCatalogEntry): T | undefined {
    const matches = (this.byFormId.get(entry.formId) ?? []).filter(({ target }) =>
      matchesFormTarget(entry, target)
    );
    return (matches.find(({ target }) => target.form !== undefined) ?? matches.at(0))?.value;
  }

  entries(): { target: FormTarget; value: T }[] {
    return [...this.byFormId.values()].flat();
  }
}

/** What UNRELEASED_FORM_IDS's codes say about the catalog entries they map
 * to: the species data's earliest date for a code it dates — so a form
 * released since it was listed is dated by its own row, not its species' or
 * region's earlier debut — or null to hide one only the unreleased-forms
 * table lists. A date wins over null for the same target; across targets,
 * the variant one wins either way, so a dated variant is never hidden by a
 * broad listing and a listed variant never dated by a broad row. */
function mappedFormReleases(availability: LoadedAvailability): FormTargetMap<Dated | null> {
  const earliest = new Map<string, { target: FormTarget; releasedOn: string }>();
  for (const { dexNr, formCode, releasedOn } of availability.species ?? []) {
    const target = formTargetFor(dexNr, formCode);
    if (target) {
      keepEarliest(earliest, formTargetKey(target), { target, releasedOn });
    }
  }
  const releases = new FormTargetMap<Dated | null>();
  for (const { target, releasedOn } of earliest.values()) {
    releases.add(target, { releasedOn });
  }
  const seen = new Set(earliest.keys());
  for (const { dexNr, formCode } of availability.unreleasedForms ?? []) {
    const target = formTargetFor(dexNr, formCode);
    const key = target ? formTargetKey(target) : '';
    if (target && !seen.has(key)) {
      seen.add(key);
      releases.add(target, null);
    }
  }
  return releases;
}

const REGIONAL_CODE = /^[AGHP][A-Z]*$/;

/** Bulbapedia's regional-form letters. */
export const REGION_CODES: Partial<Record<string, Region>> = {
  A: Region.Alola,
  G: Region.Galar,
  H: Region.Hisui,
  P: Region.Paldea,
};

/**
 * The region a Bulbapedia form code belongs to: a region letter followed
 * by capital letters only. That covers the plain letters and the longer
 * regional codes (Paldean Tauros breeds are `PC`/`PB`/`PA`, Galarian Zen
 * Darmanitan `GZ`), while species-specific codes that merely start with a
 * region letter (Vivillon `Pol`, Furfrou `He`, Oricorio `Pa`) are written
 * with lowercase letters and stay non-regional. The plain letters still
 * collide with a few species-specific codes (Deoxys `A` is Attack Forme,
 * Primal `P`), but those species have no regional form in the catalog,
 * so the extra regional date is never looked up.
 */
function regionForCode(formCode: string): Region | undefined {
  return REGIONAL_CODE.test(formCode) ? REGION_CODES[formCode.charAt(0)] : undefined;
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
  for (const { dexNr, formCode, dynamax, releasedOn, dynamaxReleasedOn } of releases) {
    const dex = String(dexNr);
    const dated = { releasedOn };
    if (dynamax) {
      // Data saved before per-Pokemon Dynamax dates existed has none: the
      // row's date is what it used then.
      keepEarliest(listings.dynamax, dex, { releasedOn: dynamaxReleasedOn ?? releasedOn });
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
  const formReleases = mappedFormReleases(availability);

  function releaseDateFor(entry: UnstampedCatalogEntry): string | null {
    const formRelease = formReleases.get(entry);
    if (formRelease === null) {
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

    if (formRelease) {
      return formRelease.releasedOn;
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

/**
 * Forms the unreleased-forms table should hide that match no catalog entry
 * — most likely pokemon-go-api renamed the `formId` — for the catalog sync
 * to log, since the form is then shown instead of hidden.
 */
export function unmatchedUnreleasedFormIds(
  entries: UnstampedCatalogEntry[],
  availability: LoadedAvailability
): string[] {
  return mappedFormReleases(availability)
    .entries()
    .filter(({ value }) => value === null)
    .map(({ target }) => target)
    .filter((target) => !entries.some((entry) => matchesFormTarget(entry, target)))
    .map((target) =>
      target.form === undefined ? target.formId : `${target.formId} (form ${target.form ?? 'none'})`
    );
}
