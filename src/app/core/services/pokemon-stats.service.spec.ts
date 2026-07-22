import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PokemonData, PokemonStatsService } from './pokemon-stats.service';

const POKEMON_DATA_URL =
  'https://raw.githubusercontent.com/mgrann03/pokemon-resources/refs/heads/main/pogo_pkm.min.json';

function makePokemon(overrides: Partial<PokemonData> = {}): PokemonData {
  return {
    id: 150,
    name: 'Mewtwo',
    form: 'Normal',
    types: ['Psychic'],
    stats: { baseAttack: 300, baseDefense: 182, baseStamina: 214 },
    ...overrides,
  };
}

describe('PokemonStatsService', () => {
  let service: PokemonStatsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(PokemonStatsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('searchCatchablePokemon returns null before data has loaded', () => {
    expect(service.searchCatchablePokemon('Mewtwo')).toBeNull();
  });

  it('loadPokemonData fetches from the public CDN URL and caches the result', async () => {
    const loadPromise = new Promise((resolve) => {
      service.loadPokemonData().subscribe(resolve);
    });

    const req = httpMock.expectOne(POKEMON_DATA_URL);
    expect(req.request.method).toBe('GET');
    req.flush([makePokemon()]);

    await loadPromise;

    expect(service.searchCatchablePokemon('Mewtwo')).toEqual(makePokemon());
  });

  it('loadPokemonData does not re-fetch once already loaded', async () => {
    const firstLoad = new Promise((resolve) => {
      service.loadPokemonData().subscribe(resolve);
    });
    httpMock.expectOne(POKEMON_DATA_URL).flush([makePokemon()]);
    await firstLoad;

    await new Promise((resolve) => {
      service.loadPokemonData().subscribe(resolve);
    });
    httpMock.expectNone(POKEMON_DATA_URL);
  });

  describe('searchCatchablePokemon (data loaded)', () => {
    beforeEach(async () => {
      const loadPromise = new Promise((resolve) => {
        service.loadPokemonData().subscribe(resolve);
      });
      httpMock
        .expectOne(POKEMON_DATA_URL)
        .flush([
          makePokemon({ name: 'Mewtwo', form: 'Normal' }),
          makePokemon({ name: 'Dialga', form: 'Origin', id: 483 }),
          makePokemon({ name: 'Braviary', form: 'Hisuian', id: 628 }),
          makePokemon({ name: 'Necrozma', form: 'Normal', id: 800 }),
          makePokemon({ name: 'Necrozma', form: 'Dusk Mane', id: 800 }),
        ]);
      await loadPromise;
    });

    it('returns null for an unknown Pokemon', () => {
      expect(service.searchCatchablePokemon('Unknown Species')).toBeNull();
    });

    it('strips a Gigantamax prefix before searching', () => {
      expect(service.searchCatchablePokemon('Gigantamax Mewtwo')?.name).toBe('Mewtwo');
    });

    it('strips a Dynamax prefix before searching', () => {
      expect(service.searchCatchablePokemon('Dynamax Mewtwo')?.name).toBe('Mewtwo');
    });

    it('strips a Mega prefix before searching', () => {
      expect(service.searchCatchablePokemon('Mega Mewtwo')?.name).toBe('Mewtwo');
    });

    it('strips a Primal prefix before searching', () => {
      expect(service.searchCatchablePokemon('Primal Mewtwo')?.name).toBe('Mewtwo');
    });

    it('strips a Shadow prefix before searching', () => {
      expect(service.searchCatchablePokemon('Shadow Mewtwo')?.name).toBe('Mewtwo');
    });

    it('maps a Mega X/Y variant to the base species', () => {
      expect(service.searchCatchablePokemon('Mega Mewtwo X')?.name).toBe('Mewtwo');
    });

    it('maps a regional prefix to the data form order', () => {
      expect(service.searchCatchablePokemon('Hisuian Braviary')?.form).toBe('Hisuian');
    });

    it('maps an "Origin Forme X" prefix to "X Origin"', () => {
      expect(service.searchCatchablePokemon('Origin Forme Dialga')?.form).toBe('Origin');
    });

    it('maps a parenthetical form to the data form order', () => {
      expect(service.searchCatchablePokemon('Necrozma (Dusk Mane)')?.form).toBe('Dusk Mane');
    });

    it('prefers the Normal form when searching by base name alone', () => {
      expect(service.searchCatchablePokemon('Necrozma')?.form).toBe('Normal');
    });

    it('falls back to any matching form when no Normal form exists for that species', () => {
      expect(service.searchCatchablePokemon('Dialga')?.form).toBe('Origin');
    });
  });

  describe('getPokemonCP', () => {
    it('resolves CP values for a known Pokemon', async () => {
      const loadPromise = new Promise((resolve) => {
        service.loadPokemonData().subscribe(resolve);
      });
      httpMock.expectOne(POKEMON_DATA_URL).flush([makePokemon()]);
      await loadPromise;

      const cp = await new Promise((resolve) => {
        service.getPokemonCP('Mewtwo').subscribe(resolve);
      });
      expect(cp).toEqual({ level20Max: 2387, level25Max: 2984 });
    });

    it('resolves null for an unknown Pokemon', async () => {
      const loadPromise = new Promise((resolve) => {
        service.loadPokemonData().subscribe(resolve);
      });
      httpMock.expectOne(POKEMON_DATA_URL).flush([makePokemon()]);
      await loadPromise;

      const cp = await new Promise((resolve) => {
        service.getPokemonCP('Unknown Species').subscribe(resolve);
      });
      expect(cp).toBeNull();
    });

    it('loads data lazily if not already loaded', async () => {
      const cpPromise = new Promise((resolve) => {
        service.getPokemonCP('Mewtwo').subscribe(resolve);
      });
      httpMock.expectOne(POKEMON_DATA_URL).flush([makePokemon()]);

      expect(await cpPromise).toEqual({ level20Max: 2387, level25Max: 2984 });
    });
  });
});
