import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PokemonImageData } from '../../core/services/event-sprite-url.util';
import { PokemonData, PokemonStatsService } from '../../core/services/pokemon-stats.service';
import { PokemonImageComponent } from './pokemon-image.component';

const POKEMINERS_URL =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon/Addressable%20Assets/pm068.icon.png';

function makePokemonImage(overrides: Partial<PokemonImageData> = {}): PokemonImageData {
  return {
    name: 'Machamp',
    imageUrl:
      'https://raw.githubusercontent.com/mgrann03/pokemon-resources/refs/heads/main/graphics/pogo/machamp.png',
    ...overrides,
  };
}

function makePokemonData(overrides: Partial<PokemonData> = {}): PokemonData {
  return {
    id: 68,
    name: 'Machamp',
    form: 'Normal',
    types: ['Fighting'],
    stats: { baseAttack: 234, baseDefense: 159, baseStamina: 172 },
    ...overrides,
  };
}

describe('PokemonImageComponent', () => {
  let fixture: ComponentFixture<PokemonImageComponent>;
  let component: PokemonImageComponent;
  let fakeStatsService: {
    loadPokemonData: ReturnType<typeof vi.fn>;
    searchCatchablePokemon: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    fakeStatsService = {
      loadPokemonData: vi.fn().mockReturnValue({ subscribe: () => undefined }),
      searchCatchablePokemon: vi.fn().mockReturnValue(null),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: PokemonStatsService, useValue: fakeStatsService }],
    });
    TestBed.overrideComponent(PokemonImageComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(PokemonImageComponent);
    component = fixture.componentInstance;
    component.eventType = 'raid-battles';
  });

  it('triggers a lazy data load on init', () => {
    fixture.detectChanges();
    expect(fakeStatsService.loadPokemonData).toHaveBeenCalled();
  });

  describe('resolvedEffect', () => {
    it("prefers the sprite's own effect over the event-level fallback", () => {
      component.pokemonData = makePokemonImage({ effect: 'shadow' });
      component.effect = 'dynamax';
      expect(component.resolvedEffect).toBe('shadow');
    });

    it('falls back to the event-level effect when the sprite has none', () => {
      component.pokemonData = makePokemonImage();
      component.effect = 'gigantamax';
      expect(component.resolvedEffect).toBe('gigantamax');
    });
  });

  describe('shieldCount', () => {
    it('reflects the pokemonData shieldCount', () => {
      component.pokemonData = makePokemonImage({ shieldCount: 10 });
      expect(component.shieldCount).toBe(10);
    });

    it('is undefined when there is no pokemonData', () => {
      expect(component.shieldCount).toBeUndefined();
    });
  });

  describe('image fallback chain', () => {
    it('uses the primary imageUrl first', () => {
      component.pokemonData = makePokemonImage();
      component.ngOnChanges();
      expect(component.currentImageSrc).toBe(makePokemonImage().imageUrl);
      expect(component.hasError).toBe(false);
    });

    it('advances to the 256x256 fallback folder on the first error', () => {
      component.pokemonData = makePokemonImage({ imageUrl: POKEMINERS_URL });
      component.ngOnChanges();
      component.onImageError();
      expect(component.currentImageSrc).toContain('Pokemon%20-%20256x256');
    });

    it('advances to the pokemongohub.net mirror on the second error', () => {
      component.pokemonData = makePokemonImage({ imageUrl: POKEMINERS_URL });
      component.ngOnChanges();
      component.onImageError();
      component.onImageError();
      expect(component.currentImageSrc).toContain('pokemongohub.net');
    });

    it('advances to the LeekDuck fallback image after all generated sources are exhausted', () => {
      component.pokemonData = makePokemonImage({
        imageUrl: POKEMINERS_URL,
        fallbackImageUrl: 'https://leekduck.com/boss.png',
      });
      component.ngOnChanges();
      component.onImageError();
      component.onImageError();
      component.onImageError();
      expect(component.currentImageSrc).toBe('https://leekduck.com/boss.png');
    });

    it('reports hasError once every source is exhausted', () => {
      component.pokemonData = makePokemonImage({ imageUrl: null });
      component.ngOnChanges();
      expect(component.currentImageSrc).toBeNull();
      expect(component.hasError).toBe(true);
    });

    it('resets the error level when the image sources change', () => {
      component.pokemonData = makePokemonImage({ imageUrl: POKEMINERS_URL });
      component.ngOnChanges();
      component.onImageError();
      expect(component.hasError).toBe(false);

      component.pokemonData = makePokemonImage({
        name: 'Snorlax',
        imageUrl: 'https://example.com/snorlax.png',
      });
      component.ngOnChanges();
      expect(component.currentImageSrc).toBe('https://example.com/snorlax.png');
    });

    it('does not reset the error level when re-triggered with the same image sources', () => {
      component.pokemonData = makePokemonImage({ imageUrl: POKEMINERS_URL });
      component.ngOnChanges();
      component.onImageError();
      component.ngOnChanges();
      expect(component.currentImageSrc).toContain('Pokemon%20-%20256x256');
    });
  });

  describe('formattedCP', () => {
    it('is empty when showCP is false', () => {
      component.showCP = false;
      component.pokemonData = makePokemonImage();
      fakeStatsService.searchCatchablePokemon.mockReturnValue(makePokemonData());
      expect(component.formattedCP).toBe('');
    });

    it('is empty when the event type does not support CP', () => {
      component.showCP = true;
      component.eventType = 'community-day';
      component.pokemonData = makePokemonImage();
      fakeStatsService.searchCatchablePokemon.mockReturnValue(makePokemonData());
      expect(component.formattedCP).toBe('');
    });

    it('is empty for a placeholder', () => {
      component.showCP = true;
      component.isPlaceholder = true;
      component.pokemonData = makePokemonImage();
      fakeStatsService.searchCatchablePokemon.mockReturnValue(makePokemonData());
      expect(component.formattedCP).toBe('');
    });

    it('is empty when there is no pokemonData', () => {
      component.showCP = true;
      expect(component.formattedCP).toBe('');
    });

    it('is empty when the Pokemon cannot be found in the stats data', () => {
      component.showCP = true;
      component.pokemonData = makePokemonImage();
      fakeStatsService.searchCatchablePokemon.mockReturnValue(null);
      expect(component.formattedCP).toBe('');
    });

    it('shows a single CP value for a non-weather-boost-supporting event type', () => {
      component.showCP = true;
      component.eventType = 'max-battles';
      component.pokemonData = makePokemonImage();
      fakeStatsService.searchCatchablePokemon.mockReturnValue(makePokemonData());
      expect(component.formattedCP).toBe('1,602');
    });

    it('shows both CP values for a weather-boost-supporting event type', () => {
      component.showCP = true;
      component.eventType = 'raid-battles';
      component.pokemonData = makePokemonImage();
      fakeStatsService.searchCatchablePokemon.mockReturnValue(makePokemonData());
      expect(component.formattedCP).toBe('1,602 / 2,003');
    });

    it('always shows weather boost for a raid-hour sub-event, regardless of event type', () => {
      component.showCP = true;
      component.isRaidHourSubEvent = true;
      component.eventType = 'community-day';
      component.pokemonData = makePokemonImage();
      fakeStatsService.searchCatchablePokemon.mockReturnValue(makePokemonData());
      expect(component.formattedCP).toBe('1,602 / 2,003');
    });

    it('never shows CP for a spotlight sub-event, even for a CP-supported event type', () => {
      component.showCP = true;
      component.isSpotlightSubEvent = true;
      component.eventType = 'raid-battles';
      component.pokemonData = makePokemonImage();
      fakeStatsService.searchCatchablePokemon.mockReturnValue(makePokemonData());
      expect(component.formattedCP).toBe('');
    });
  });
});
