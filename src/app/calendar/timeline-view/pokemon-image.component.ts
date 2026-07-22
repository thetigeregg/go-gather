import { Component, Input, OnChanges, OnInit, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { helpCircleOutline, helpOutline } from 'ionicons/icons';
import { MAJOR_CALENDAR_EVENT_TYPES } from '../../core/services/calendar-event-major.util';
import { CPResult, calculateRaidCP, formatCPDisplay } from '../../core/services/pokemon-cp.util';
import { PokemonStatsService } from '../../core/services/pokemon-stats.service';
import {
  getSprite256FallbackUrl,
  getSpriteFallbackUrl,
} from '../../core/services/pokemon-sprite-mapper.util';
import { PokemonImageData, SpriteEffect } from '../../core/services/event-sprite-url.util';

// Event types that support weather boosting (show two CP values).
const WEATHER_BOOST_EVENT_TYPES: readonly string[] = [
  'raid-battles',
  'raid-day',
  'raid-weekend',
  'raid-hour',
  'event',
  ...MAJOR_CALENDAR_EVENT_TYPES,
];

// Event types that should show CP (raids and max battles).
const CP_SUPPORTED_EVENT_TYPES: readonly string[] = [
  'raid-battles',
  'raid-day',
  'raid-weekend',
  'raid-hour',
  'max-battles',
  'max-mondays',
  'event',
  ...MAJOR_CALENDAR_EVENT_TYPES,
];

/**
 * Ported from pogo-cal's PokemonImage.vue, folding in PokemonCPBadge.vue's
 * logic directly (no separate component — it has no template/state of its
 * own worth splitting out here). Drops FloatingVue tooltips entirely (this
 * port is touch-first with no hover interaction, and the Pokemon name is
 * already visible elsewhere on the card) and the `useAnimated` prop/overlay
 * animations (static-only scope — the Dynamax cloud/Shadow aura overlay
 * images are still rendered, just without the CSS keyframe animation).
 */
@Component({
  selector: 'app-pokemon-image',
  imports: [IonIcon],
  templateUrl: './pokemon-image.component.html',
  styleUrl: './pokemon-image.component.scss',
})
export class PokemonImageComponent implements OnInit, OnChanges {
  private readonly pokemonStatsService = inject(PokemonStatsService);

  @Input() pokemonData: PokemonImageData | undefined = undefined;
  @Input() height = 18;
  @Input() showCP = false;
  @Input({ required: true }) eventType!: string;
  @Input() isRaidHourSubEvent = false;
  @Input() isSpotlightSubEvent = false;
  /**
   * Overlay for this sprite. `pokemonData.effect` (per-sprite, from the
   * resolver) takes precedence; this input is the event-level fallback for
   * callers whose image data doesn't carry one (raid tier groups, placeholder).
   */
  @Input() effect: SpriteEffect | undefined = undefined;
  @Input() isPlaceholder = false;

  private errorLevel = 0;
  private lastImageSourcesKey = '';

  // Memoized on ngOnChanges/stats-load rather than recomputed on every
  // template read — with dozens of sprites visible at once on a raid-heavy
  // Timeline, re-running getPokemonSpriteUrl/searchCatchablePokemon's
  // linear scans on every change-detection pass was a real, measurable
  // main-thread cost (confirmed via a live trace: the tab went unresponsive
  // for several seconds right as Pokemon stats data arrived).
  private cachedImageSources: string[] = [];
  private cachedCpData: CPResult | null = null;

  constructor() {
    addIcons({ 'help-circle-outline': helpCircleOutline, 'help-outline': helpOutline });
  }

  ngOnInit(): void {
    this.pokemonStatsService.loadPokemonData().subscribe(() => {
      // Stats may finish loading after this component's own inputs have
      // already settled (ngOnChanges already ran) — recompute once more so
      // the CP badge appears once the data actually arrives.
      this.cachedCpData = this.computeCpData();
    });
  }

  ngOnChanges(): void {
    this.cachedImageSources = this.computeImageSources();
    const key = this.cachedImageSources.join('|');
    if (key !== this.lastImageSourcesKey) {
      this.lastImageSourcesKey = key;
      this.errorLevel = 0;
    }
    this.cachedCpData = this.computeCpData();
  }

  get resolvedEffect(): SpriteEffect | undefined {
    return this.pokemonData?.effect ?? this.effect;
  }

  get shieldCount(): number | undefined {
    return this.pokemonData?.shieldCount;
  }

  private computeImageSources(): string[] {
    const sources: string[] = [];
    const primary = this.pokemonData?.imageUrl;
    const altFolder = primary ? getSprite256FallbackUrl(primary) : null;
    const hub = primary ? getSpriteFallbackUrl(primary) : null;
    const jsonFallback = this.pokemonData?.fallbackImageUrl;

    if (primary) {
      sources.push(primary);
    }
    if (altFolder && !sources.includes(altFolder)) {
      sources.push(altFolder);
    }
    if (hub && !sources.includes(hub)) {
      sources.push(hub);
    }
    if (jsonFallback && !sources.includes(jsonFallback)) {
      sources.push(jsonFallback);
    }

    return sources;
  }

  get currentImageSrc(): string | null {
    return this.cachedImageSources[this.errorLevel] ?? null;
  }

  get hasError(): boolean {
    return this.errorLevel >= this.cachedImageSources.length;
  }

  onImageError(): void {
    this.errorLevel++;
  }

  private get shouldShowWeatherBoost(): boolean {
    // Only ever consulted from formattedCP, which already short-circuits via
    // shouldShowCP's own isSpotlightSubEvent check — this branch can't
    // trigger in practice, kept for structural parity with source.
    if (this.isSpotlightSubEvent) return false;
    if (this.isRaidHourSubEvent) return true;
    return WEATHER_BOOST_EVENT_TYPES.includes(this.eventType);
  }

  private get shouldShowCP(): boolean {
    if (this.isSpotlightSubEvent) return false;
    if (this.isRaidHourSubEvent) return true;
    return CP_SUPPORTED_EVENT_TYPES.includes(this.eventType);
  }

  private computeCpData(): CPResult | null {
    if (!this.showCP || !this.shouldShowCP || this.isPlaceholder || !this.pokemonData) {
      return null;
    }

    const pokemon = this.pokemonStatsService.searchCatchablePokemon(this.pokemonData.name);
    if (!pokemon) {
      return null;
    }

    return calculateRaidCP(pokemon.stats);
  }

  get formattedCP(): string {
    if (!this.cachedCpData) return '';
    return formatCPDisplay(
      this.cachedCpData.level20Max,
      this.cachedCpData.level25Max,
      this.shouldShowWeatherBoost
    );
  }
}
