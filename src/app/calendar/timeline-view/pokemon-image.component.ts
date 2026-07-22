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

  constructor() {
    addIcons({ 'help-circle-outline': helpCircleOutline, 'help-outline': helpOutline });
  }

  ngOnInit(): void {
    this.pokemonStatsService.loadPokemonData().subscribe();
  }

  ngOnChanges(): void {
    const key = this.imageSources.join('|');
    if (key !== this.lastImageSourcesKey) {
      this.lastImageSourcesKey = key;
      this.errorLevel = 0;
    }
  }

  get resolvedEffect(): SpriteEffect | undefined {
    return this.pokemonData?.effect ?? this.effect;
  }

  get shieldCount(): number | undefined {
    return this.pokemonData?.shieldCount;
  }

  private get imageSources(): string[] {
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
    return this.imageSources[this.errorLevel] ?? null;
  }

  get hasError(): boolean {
    return this.errorLevel >= this.imageSources.length;
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

  private get cpData(): CPResult | null {
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
    const cpData = this.cpData;
    if (!cpData) return '';
    return formatCPDisplay(cpData.level20Max, cpData.level25Max, this.shouldShowWeatherBoost);
  }
}
