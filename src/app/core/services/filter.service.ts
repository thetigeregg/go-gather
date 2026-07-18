import { Injectable, inject } from '@angular/core';
import { CatalogEntry, UserSettings } from '@go-gather/shared';
import { PokeDataService } from './poke-data.service';
import { SearchConfigService } from './search-config.service';
import { REGION_BY_GENERATION, UserDataService } from './user-data.service';

export interface SpeciesGroup {
  dexNr: number;
  speciesId: string;
  speciesName: string;
  entries: CatalogEntry[];
}

export interface Generation {
  generationName: string;
  speciesList: SpeciesGroup[];
}

@Injectable({
  providedIn: 'root',
})
export class FilterService {
  private readonly pokeDataService = inject(PokeDataService);
  private readonly userDataService = inject(UserDataService);
  private readonly searchConfigService = inject(SearchConfigService);

  groupPokemonByGeneration(userSettings: UserSettings): Generation[] {
    const excludedPatterns = this.compileExcludedPatterns(userSettings.excludedNamePatterns);
    const excludedShinyPatterns = this.compileExcludedPatterns(
      userSettings.excludedShinyNamePatterns
    );

    const excludedDexNumbers = new Set(userSettings.excludedDexNumbers);
    const excludedShinyDexNumbers = new Set(userSettings.excludedShinyDexNumbers);

    const inPokedex = this.pokeDataService.catalog.filter(
      (entry) =>
        entry.pokedexType === userSettings.pokedexType &&
        !excludedDexNumbers.has(entry.dexNr) &&
        !(entry.isShiny && excludedShinyDexNumbers.has(entry.dexNr)) &&
        !(entry.isShiny && this.isExcludedByName(entry, excludedShinyPatterns)) &&
        !this.isExcludedByName(entry, excludedPatterns)
    );

    // Some species (e.g. Burmy, Cherrim) have no "plain" entry at all — every
    // entry has a form/region. Hiding "Alternate Forms" would otherwise wipe
    // out the whole species with nothing left to show, so that toggle only
    // applies to species that actually have a formless entry to fall back to.
    const speciesWithPlainEntry = new Set(
      inPokedex.filter((entry) => !entry.form).map((entry) => entry.speciesId)
    );

    const visibleEntries = inPokedex.filter((entry) =>
      this.isEntryVisible(entry, userSettings, speciesWithPlainEntry.has(entry.speciesId))
    );

    const speciesGroups = this.groupBySpecies(visibleEntries);
    const generations = new Map<number, SpeciesGroup[]>();

    for (const group of speciesGroups) {
      const generation = group.entries[0].generation;
      const groupsForGeneration = generations.get(generation) ?? [];
      groupsForGeneration.push(group);
      generations.set(generation, groupsForGeneration);
    }

    return Array.from(generations.entries())
      .sort(([genA], [genB]) => genA - genB)
      .map(([generation, speciesList]) => ({
        generationName: `Generation ${String(generation)}`,
        speciesList,
      }));
  }

  private isEntryVisible(
    entry: CatalogEntry,
    userSettings: UserSettings,
    speciesHasPlainEntry: boolean
  ): boolean {
    if (userSettings.shinyFilter === 'shiny' && !entry.isShiny) {
      return false;
    }

    if (userSettings.shinyFilter === 'non-shiny' && entry.isShiny) {
      return false;
    }

    if (entry.region && !userSettings.showRegional && speciesHasPlainEntry) {
      return false;
    }

    // Matches the real in-game "region" search exactly: typing a region name
    // returns Pokemon whose ORIGIN generation is that region, OR whose
    // alternate FORM is that region — not just one or the other.
    if (userSettings.regionFilter !== 'all') {
      const originRegion = REGION_BY_GENERATION[entry.generation];
      const matchesOrigin = originRegion === userSettings.regionFilter;
      const matchesForm = entry.region?.toString() === userSettings.regionFilter;

      if (!matchesOrigin && !matchesForm) {
        return false;
      }
    }

    if (entry.form && !userSettings.showAlternate && speciesHasPlainEntry) {
      return false;
    }

    if (entry.isFemale && !userSettings.showGender) {
      return false;
    }

    // Costume Dex gets its own opt-out gender gate on top of the global
    // `showGender` toggle above — unlike Mega/GMax/DMax/XXL/XXS, costume
    // entries sometimes come in real male/female pairs (see transform.ts's
    // findGenderedFormKeys), and costumeGenderEnabled (sync-overrides.json)
    // lets that be turned off specifically for the Costume Dex without
    // affecting gender visibility everywhere else.
    if (
      entry.pokedexType === 'costume' &&
      entry.isFemale &&
      !this.searchConfigService.costumeGenderEnabled
    ) {
      return false;
    }

    if (userSettings.showUncaughtOnly && this.userDataService.getItemState(entry.id)) {
      return false;
    }

    return true;
  }

  /**
   * Invalid regex patterns (e.g. a user mid-typing an unclosed group) are
   * dropped rather than thrown, so a malformed pattern can't blank out the
   * whole catalog while it's being edited.
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

  private groupBySpecies(entries: CatalogEntry[]): SpeciesGroup[] {
    const groups = new Map<string, SpeciesGroup>();

    for (const entry of entries) {
      const key = entry.speciesId;
      const existing = groups.get(key);

      if (existing) {
        existing.entries.push(entry);
      } else {
        groups.set(key, {
          dexNr: entry.dexNr,
          speciesId: entry.speciesId,
          speciesName: entry.speciesName,
          entries: [entry],
        });
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.dexNr - b.dexNr);
  }
}
