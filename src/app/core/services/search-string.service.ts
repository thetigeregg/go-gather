import { Injectable, inject } from '@angular/core';
import {
  CatalogEntry,
  ExcludedSearchTerm,
  PokedexType,
  Region as RegionEnum,
} from '@go-gather/shared';
import { serializeQuery } from '../search-engine/search-query.builder';
import {
  Region as SearchRegion,
  SearchTerm,
  Size,
  SimpleKeyword,
  and,
  not,
  or,
  term,
} from '../search-engine/search-query.model';
import { PokeDataService } from './poke-data.service';
import { UserDataService } from './user-data.service';

type Palette = 'default' | 'shiny';
type GenderFilter = 'male' | 'female' | 'genderless';

/** In-game dex-completion tags are atomic/composable, not one tag per
 * pokedex-type+palette combination — a shiny Gigantamax catch gets both
 * `GMax` and `[Shiny]` applied together, not a fused "Shiny GMax Dex" tag.
 * This maps each non-regular pokedex type to its one attribute tag; `Living
 * Dex`/`[Shiny]` (below) are handled separately since they're palette-driven
 * rather than pokedex-type-driven. `[XXS]`/`[XXL]`/`[Mega]`/`[Shiny]` are
 * bracketed in-game specifically to avoid colliding with Pokemon GO's own
 * reserved `xxs`/`xxl`/`megaevolve`/`shiny` search keywords — confirmed
 * brackets don't break search-bar parsing. `GMax`/`DMax` don't need brackets
 * since tags are always `#`-prefixed and keywords are bare, so there's no
 * ambiguity for those two specifically. */
const ATOMIC_TAG_BY_POKEDEX_TYPE: Partial<Record<PokedexType, string>> = {
  mega: '[Mega]',
  max: 'GMax',
  dmax: 'DMax',
  xxl: '[XXL]',
  xxs: '[XXS]',
};

/** GMax/DMax/Costume entries share the same speciesName/dexNr as their
 * regular-dex counterpart (e.g. "Venusaur" the base species and "Venusaur
 * (Gigantamax)" both have speciesName "Venusaur"), so a search string built
 * purely from species names would also match the regular, non-evolved
 * Pokemon. Adding the matching in-game search keyword restricts the string
 * to just that pokedex type's own entries. `regular`/`mega` have no keyword
 * here — `megaevolve` was deliberately dropped (confirmed in-game it
 * shouldn't be added), so a Mega search string is just species names, same
 * as Regular. */
const KEYWORD_BY_POKEDEX_TYPE: Partial<Record<PokedexType, SimpleKeyword>> = {
  max: 'gigantamax',
  dmax: 'dynamax',
  costume: 'costume',
};

/** XXL/XXS entries are literal clones of a regular entry (same speciesName/
 * dexNr/sprite — see transform.ts's addSizeTierEntries), so a search string
 * for them needs the in-game `xxl`/`xxs` SIZE term, not a SimpleKeyword like
 * the mechanic-based pokedex types above — otherwise it'd just re-search the
 * regular, non-size-filtered species. */
const SIZE_BY_POKEDEX_TYPE: Partial<Record<PokedexType, Size>> = {
  xxl: 'xxl',
  xxs: 'xxs',
};

/** `@go-gather/shared`'s `Region` enum values (lowercase region names) line
 * up 1:1 with the search engine's `Region` term values, so this is a type
 * assertion rather than a lookup table — kept as a named cast so a future
 * mismatch between the two Region shapes fails loudly instead of silently
 * emitting a wrong keyword. */
function toSearchRegion(region: RegionEnum): SearchRegion {
  return region.toString() as SearchRegion;
}

/**
 * `ExcludedSearchTerm.value` is a plain `string` (it comes from user input
 * via the Search Strings page's exclusion form), but `keyword`/`size` term
 * kinds are typed as string-literal unions (`SimpleKeyword`/`Size`) here — a
 * named cast per kind, same pattern as `toSearchRegion` above, rather than a
 * runtime validation layer, since the UI only ever lets a user pick a
 * keyword/size value from those closed lists (`SIMPLE_KEYWORDS`/`SIZES` in
 * `search-term-catalog.ts`).
 */
function toExclusionTerm(entry: ExcludedSearchTerm): SearchTerm {
  switch (entry.kind) {
    case 'tag':
      return { kind: 'tag', value: entry.value };
    case 'keyword':
      return { kind: 'keyword', value: entry.value as SimpleKeyword };
    case 'size':
      return { kind: 'size', value: entry.value as Size };
  }
}

@Injectable({
  providedIn: 'root',
})
export class SearchStringService {
  private readonly userDataService = inject(UserDataService);
  private readonly pokeDataService = inject(PokeDataService);
  private missingEntries: CatalogEntry[] = [];
  private pokedexType: PokedexType = 'regular';
  private excludedSearchTerms: ExcludedSearchTerm[] = [];

  init(): void {
    const entryStates = this.userDataService.getAllEntryStates();
    const {
      pokedexType,
      excludedNamePatterns,
      excludedDexNumbers,
      excludedShinyDexNumbers,
      excludedShinyNamePatterns,
      excludedSearchTermsByPokedex,
    } = this.userDataService.getUserSettings();

    this.pokedexType = pokedexType;
    this.excludedSearchTerms = excludedSearchTermsByPokedex[pokedexType];

    const excludedPatterns = this.compileExcludedPatterns(excludedNamePatterns);
    const excludedShinyPatterns = this.compileExcludedPatterns(excludedShinyNamePatterns);
    const excludedDexNumberSet = new Set(excludedDexNumbers);
    const excludedShinyDexNumberSet = new Set(excludedShinyDexNumbers);

    // Without this, Mega/Gigantamax entries (which share the same speciesName
    // and dexNr as their regular-dex counterpart, e.g. "Mega Venusaur" and
    // "Venusaur (Gigantamax)" both have speciesName "Venusaur") leaked their
    // species name into Regular-pokedex search strings whenever they were
    // uncaught and non-excluded — even though the main grid only shows one
    // pokedex type at a time and Excluded Patterns correctly filtered the
    // regular-dex forms themselves.
    this.missingEntries = this.pokeDataService.catalog.filter(
      (entry) =>
        entry.pokedexType === pokedexType &&
        !entryStates.get(entry.id) &&
        !excludedDexNumberSet.has(entry.dexNr) &&
        !(entry.isShiny && excludedShinyDexNumberSet.has(entry.dexNr)) &&
        !(entry.isShiny && this.isExcludedByName(entry, excludedShinyPatterns)) &&
        !this.isExcludedByName(entry, excludedPatterns)
    );
  }

  getDefaultSearchString(): string | null {
    return this.getSearchString('default');
  }

  getShinySearchString(): string | null {
    return this.getSearchString('shiny');
  }

  getDefaultMaleSearchString(): string | null {
    return this.getSearchString('default', 'male');
  }

  getDefaultFemaleSearchString(): string | null {
    return this.getSearchString('default', 'female');
  }

  getShinyMaleSearchString(): string | null {
    return this.getSearchString('shiny', 'male');
  }

  getShinyFemaleSearchString(): string | null {
    return this.getSearchString('shiny', 'female');
  }

  getAltRegionSearchStrings(desiredPalette: Palette = 'default'): Map<string, string> {
    const altRegions: RegionEnum[] = [
      RegionEnum.Alola,
      RegionEnum.Galar,
      RegionEnum.Hisui,
      RegionEnum.Paldea,
    ];
    const searchStrings = new Map<string, string>();

    for (const region of altRegions) {
      const regionSearchString = this.getSearchString(desiredPalette, 'genderless', region);

      if (regionSearchString && regionSearchString.trim().length > 0) {
        searchStrings.set(region.toString(), regionSearchString);
      }
    }

    return searchStrings;
  }

  /**
   * Invalid regex patterns (e.g. a user mid-typing an unclosed group) are
   * dropped rather than thrown, matching FilterService's equivalent guard,
   * so a malformed Excluded Patterns entry can't break search strings.
   */
  private compileExcludedPatterns(patterns: string[]): RegExp[] {
    return patterns.flatMap((pattern) => {
      try {
        return [new RegExp(pattern, 'i')];
      } catch {
        return [];
      }
    });
  }

  private isExcludedByName(entry: CatalogEntry, excludedPatterns: RegExp[]): boolean {
    return excludedPatterns.some((pattern) => pattern.test(entry.name));
  }

  /**
   * `,`/`;`/`:` are OR-separators in the search bar's own syntax (confirmed
   * against the game's docs), not literal characters — so a species whose
   * real name contains one (e.g. "Type: Null", dex #772) would have that
   * character misparsed as a separator rather than matched as part of the
   * name if substituted in verbatim, silently splitting/corrupting that
   * segment of the generated string. Stripped here (not just replaced with
   * a space) since name-matching only needs the name's leading substring
   * and doesn't require exact spacing/punctuation.
   */
  private sanitizeSpeciesNameForSearch(speciesName: string): string {
    return speciesName.toLowerCase().replace(/[,;:]/g, '');
  }

  private getSearchString(
    desiredPalette: Palette,
    desiredGender: GenderFilter = 'genderless',
    desiredAltRegion: RegionEnum | null = null
  ): string | null {
    const missingEntriesForConfig = this.missingEntries.filter((entry) => {
      if (desiredPalette === 'default' && entry.isShiny) {
        return false;
      }

      if (desiredPalette === 'shiny' && !entry.isShiny) {
        return false;
      }

      // CatalogEntry only ever tracks `isFemale` — there's no true "male"
      // flag, so `entryGender` can only be 'female' or 'genderless'. "Male"
      // and "genderless" both therefore mean the same thing here: not
      // female. Requiring an exact 'male' match (as an earlier version of
      // this check did) meant every entry got excluded whenever a "male"
      // search string was requested, since entryGender could never equal
      // 'male' — Male (Non-Shiny)/(Shiny) always returned null as a result.
      const entryGender: GenderFilter = entry.isFemale ? 'female' : 'genderless';

      if (desiredGender === 'female' && entryGender !== 'female') {
        return false;
      }

      if (
        (desiredGender === 'male' || desiredGender === 'genderless') &&
        entryGender === 'female'
      ) {
        return false;
      }

      if (desiredAltRegion && entry.region !== desiredAltRegion) {
        return false;
      }

      return true;
    });

    if (missingEntriesForConfig.length === 0) {
      return null;
    }

    const speciesNames = [
      ...new Set(
        missingEntriesForConfig.map((entry) => this.sanitizeSpeciesNameForSearch(entry.speciesName))
      ),
    ];

    // Confirmed empirically against the live search bar: a shared filter
    // written ONCE around the whole comma-joined species list (e.g.
    // `!shiny&pikachu,raichu,pichu&gigantamax`) correctly applies to every
    // name in that list — repeating the same filter inside each comma
    // branch instead (`!shiny&pikachu&gigantamax,!shiny&raichu&gigantamax,...`)
    // was tested and returns ZERO results, not just a longer-but-equivalent
    // string. So each shared filter (shiny/gender/region/pokedex-type-keyword/
    // dex-tag/always-excluded-tags) is ANDed exactly once around the whole
    // species group, not distributed per species.
    const atomicTag = ATOMIC_TAG_BY_POKEDEX_TYPE[this.pokedexType];
    const excludedDexTags: string[] = [];
    if (desiredPalette === 'shiny') {
      if (atomicTag) {
        // Non-regular pokedex types (Mega/GMax/DMax/XXL/XXS) only exclude
        // their own atomic tag for the shiny variant, not `[Shiny]` as well —
        // dropped per explicit request, unlike Regular's shiny case just
        // below, which still relies on `[Shiny]` as its sole exclusion.
        excludedDexTags.push(atomicTag);
      } else {
        // Shiny is its own atomic tag for the regular pokedex — a shiny
        // regular catch is tagged `[Shiny]` alone, not `Living Dex` +
        // `[Shiny]` (Living Dex specifically means "the plain, non-shiny
        // baseline").
        excludedDexTags.push('[Shiny]');
      }
    } else if (atomicTag) {
      excludedDexTags.push(atomicTag);
    } else {
      excludedDexTags.push('Living Dex');
    }
    const pokedexTypeKeyword = KEYWORD_BY_POKEDEX_TYPE[this.pokedexType];
    const pokedexTypeSize = SIZE_BY_POKEDEX_TYPE[this.pokedexType];

    // Excluding a `size` entry that matches the CURRENT pokedex type would
    // exclude every result (e.g. excluding `xxl` while generating a search
    // string for the XXL pokedex itself) — skipped structurally here as a
    // safety net even though the UI already seeds each pokedex type without
    // its own matching size by default, since it's the only pokedex type a
    // given size term is ever self-defeating for.
    const implicitExclusionTerms = this.excludedSearchTerms
      .filter((entry) => !(entry.kind === 'size' && entry.value === pokedexTypeSize))
      .map((entry) => not(term(toExclusionTerm(entry))));

    const speciesNode =
      speciesNames.length === 1
        ? term({ kind: 'family', value: speciesNames[0] })
        : or(...speciesNames.map((name) => term({ kind: 'family', value: name })));

    const rootNode = and(
      desiredPalette === 'shiny'
        ? term({ kind: 'keyword', value: 'shiny' })
        : not(term({ kind: 'keyword', value: 'shiny' })),
      speciesNode,
      ...(pokedexTypeKeyword ? [term({ kind: 'keyword', value: pokedexTypeKeyword })] : []),
      ...(pokedexTypeSize ? [term({ kind: 'size', value: pokedexTypeSize })] : []),
      ...(desiredGender !== 'genderless' ? [term({ kind: 'gender', value: desiredGender })] : []),
      ...(desiredAltRegion
        ? [term({ kind: 'region', value: toSearchRegion(desiredAltRegion) })]
        : []),
      ...excludedDexTags.map((tag) => not(term({ kind: 'tag', value: tag }))),
      ...implicitExclusionTerms
    );

    return serializeQuery(rootNode);
  }
}
