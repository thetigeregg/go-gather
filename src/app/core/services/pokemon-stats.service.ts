import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of, shareReplay, tap } from 'rxjs';
import { calculateRaidCP, cleanPokemonName, CPResult } from './pokemon-cp.util';
import { normalizePokemonName } from './pokemon-sprite-mapper.util';

const POKEMON_DATA_URL =
  'https://raw.githubusercontent.com/mgrann03/pokemon-resources/refs/heads/main/pogo_pkm.min.json';

export interface PokemonStats {
  baseStamina: number;
  baseAttack: number;
  baseDefense: number;
}

export interface PokemonData {
  id: number;
  name: string;
  form: string;
  types: string[];
  stats: PokemonStats;
  released?: boolean;
  shadow?: boolean;
  raid_tier?: number;
}

// Maps verbose in-game form names to the simplified form names used in the source data.
const FORM_NAME_ALIASES: Partial<Record<string, string>> = {
  'hero of many battles': 'hero',
  normal: 'Normal',
};

const REGIONAL_DATA_FORMS: Partial<Record<string, string>> = {
  alolan: 'Alola',
  galarian: 'Galarian',
  hisuian: 'Hisuian',
  paldean: 'Paldea',
};

/**
 * Ported from pogo-cal's src/stores/pokemonData.ts (a Pinia store) — this is
 * static reference data lazily fetched directly from the same public CDN the
 * sprite `<img>` URLs already point at, not go-gather's own `server/`, so it
 * mirrors the source's lazy-fetch-and-cache-in-memory approach rather than
 * being proxied/synced like the calendar-events feed.
 */
@Injectable({ providedIn: 'root' })
export class PokemonStatsService {
  private readonly http = inject(HttpClient);
  private pokemonData: readonly PokemonData[] = [];
  private isLoaded = false;
  private load$: Observable<readonly PokemonData[]> | null = null;

  /** Lazily loads and caches the Pokemon stats data; safe to call repeatedly. */
  loadPokemonData(): Observable<readonly PokemonData[]> {
    if (this.isLoaded) {
      return of(this.pokemonData);
    }

    this.load$ ??= this.http.get<PokemonData[]>(POKEMON_DATA_URL).pipe(
      tap((data) => {
        this.pokemonData = data;
        this.isLoaded = true;
      }),
      shareReplay(1)
    );

    return this.load$;
  }

  /**
   * Get CP values for a Pokemon by name. Automatically loads data if not
   * already loaded. Returns null if not found, not loaded, or the matched
   * entry has no stats.
   */
  getPokemonCP(pokemonName: string): Observable<CPResult | null> {
    return this.loadPokemonData().pipe(
      map(() => {
        const pokemon = this.searchCatchablePokemon(pokemonName);
        return pokemon ? calculateRaidCP(pokemon.stats) : null;
      })
    );
  }

  /**
   * Search for a catchable Pokemon by name, stripping battle-form prefixes.
   * Returns the base form that can actually be caught/encountered. Requires
   * data to already be loaded (via loadPokemonData()) — returns null otherwise.
   */
  searchCatchablePokemon(pokemonName: string): PokemonData | null {
    if (!this.isLoaded || this.pokemonData.length === 0) {
      return null;
    }

    // Strip all battle form prefixes - these forms can't be caught, only base forms
    let searchName = pokemonName;
    let wasMegaPrefixed = false;
    if (searchName.startsWith('Gigantamax ')) {
      searchName = searchName.substring(11);
    } else if (searchName.startsWith('Dynamax ')) {
      searchName = searchName.substring(8);
    } else if (searchName.startsWith('Mega ')) {
      wasMegaPrefixed = true;
      searchName = searchName.substring(5);
    } else if (searchName.startsWith('Primal ')) {
      searchName = searchName.substring(7);
    } else if (searchName.startsWith('Shadow ')) {
      searchName = searchName.substring(7);
    }

    // Mega variants with a trailing X/Y should map to the base species for CP lookup.
    // Example: "Mega Mewtwo X" -> "Mewtwo".
    if (wasMegaPrefixed) {
      const megaVariantMatch = searchName.match(/^(.+?)\s+[XY]$/i);
      if (megaVariantMatch) {
        searchName = megaVariantMatch[1].trim();
      }
    }

    // Handle regional form prefixes: "Hisuian Braviary" → "Braviary Hisuian" (data stores name + form order).
    const regionalPrefixMatch = searchName.match(/^(Alolan|Galarian|Hisuian|Paldean)\s+(.+)$/i);
    if (regionalPrefixMatch) {
      const basePokemonName = regionalPrefixMatch[2].trim();
      // The regex only matches these 4 literal prefixes, and REGIONAL_DATA_FORMS
      // has an entry for each lowercased — regionalForm is never actually undefined.
      const regionalForm = REGIONAL_DATA_FORMS[regionalPrefixMatch[1].toLowerCase()];
      searchName = `${basePokemonName} ${regionalForm ?? ''}`.trim();
    }

    // Handle form prefixes: "Origin Forme Dialga" → "Dialga Origin"
    const formPrefixMatch = searchName.match(/^(.+?)\s+forme?\s+(.+)$/i);
    if (formPrefixMatch) {
      const formName = formPrefixMatch[1].trim();
      const basePokemonName = formPrefixMatch[2].trim();
      searchName = `${basePokemonName} ${formName}`;
    }

    // Handle form in parentheses: "Dialga (Origin Forme)" → "Dialga Origin"
    const formParenthesesMatch = searchName.match(/^(.+?)\s+\((.+?)(?:\s+forme?)?\)$/i);
    if (formParenthesesMatch) {
      const basePokemonName = formParenthesesMatch[1].trim();
      const rawFormName = formParenthesesMatch[2].trim();
      const formName = FORM_NAME_ALIASES[rawFormName.toLowerCase()] ?? rawFormName;
      searchName = `${basePokemonName} ${formName}`;
    }

    const normalizedSearch = normalizePokemonName(searchName);
    const cleanSearch = cleanPokemonName(searchName);

    // Try exact match first (with form)
    for (const pokemon of this.pokemonData) {
      const fullName = `${pokemon.name} ${pokemon.form}`.trim();
      const normalizedFullName = normalizePokemonName(fullName);
      const cleanFullName = cleanPokemonName(fullName);

      if (normalizedFullName === normalizedSearch || cleanFullName === cleanSearch) {
        return pokemon;
      }
    }

    // Try base name match (ignore form), preferring the Normal form
    for (const pokemon of this.pokemonData) {
      const normalizedBaseName = normalizePokemonName(pokemon.name);
      const cleanBaseName = cleanPokemonName(pokemon.name);

      if (
        (normalizedBaseName === normalizedSearch || cleanBaseName === cleanSearch) &&
        pokemon.form === 'Normal'
      ) {
        return pokemon;
      }
    }

    // Return first match with base name (any form)
    for (const pokemon of this.pokemonData) {
      const normalizedBaseName = normalizePokemonName(pokemon.name);
      const cleanBaseName = cleanPokemonName(pokemon.name);

      if (normalizedBaseName === normalizedSearch || cleanBaseName === cleanSearch) {
        return pokemon;
      }
    }

    return null;
  }
}
