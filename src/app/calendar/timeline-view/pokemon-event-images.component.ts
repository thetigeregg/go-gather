import { Component, Input } from '@angular/core';
import { PogoEvent } from '@go-gather/shared';
import {
  getEventPokemonImages,
  getEventSpriteEffect,
} from '../../core/services/event-pokemon-images.util';
import { PokemonImageData } from '../../core/services/event-sprite-url.util';
import { PokemonImageComponent } from './pokemon-image.component';

const MAX_DISPLAYED_IMAGES = 3;

// Event types where a missing sprite warrants a placeholder (a Pokemon is expected).
const PLACEHOLDER_EVENT_TYPES: readonly string[] = [
  'raid-day',
  'raid-battles',
  'raid-weekend',
  'raid-hour',
  'max-mondays',
  'pokemon-spotlight-hour',
  'community-day',
  'pokestop-showcase',
];

/**
 * Ported from pogo-cal's PokemonEventImages.vue, minus `useAnimated` (static-
 * only scope) and `showTooltips` (tooltips dropped entirely — touch-first,
 * see pokemon-image.component.ts). The source's mobile-only overflow-badge
 * gate (`useBreakpoints().smaller('md')`) is dropped too: go-gather is a
 * native single-layout mobile app with no responsive breakpoint switching,
 * so that condition is always true here.
 */
@Component({
  selector: 'app-pokemon-event-images',
  imports: [PokemonImageComponent],
  templateUrl: './pokemon-event-images.component.html',
  styleUrl: './pokemon-event-images.component.scss',
})
export class PokemonEventImagesComponent {
  @Input({ required: true }) event!: PogoEvent;
  @Input() height = 18;
  @Input() showPlaceholder = false;
  @Input() showCP = false;
  @Input() showOverflowCounter = false;
  @Input() overflowBadgeAlign: 'left' | 'right' = 'left';
  @Input() excludeTiers: string[] | undefined = undefined;
  @Input() wrap = false;

  private get pokemonImages(): PokemonImageData[] {
    return getEventPokemonImages(this.event, { excludeTiers: this.excludeTiers });
  }

  get displayedImages(): PokemonImageData[] {
    return this.pokemonImages.slice(0, MAX_DISPLAYED_IMAGES);
  }

  get isRaidHourSubEvent(): boolean {
    return this.event.extraData?.isRaidHourSubEvent === true;
  }

  get isSpotlightSubEvent(): boolean {
    return this.event.extraData?.isSpotlightSubEvent === true;
  }

  get shouldShowPlaceholder(): boolean {
    if (!this.showPlaceholder) return false;
    return (
      this.pokemonImages.length === 0 && PLACEHOLDER_EVENT_TYPES.includes(this.event.eventType)
    );
  }

  get placeholderEffect(): PokemonImageData['effect'] {
    return getEventSpriteEffect(this.event);
  }

  private get totalRaidBossCount(): number {
    return this.event.extraData?.raidbattles?.bosses.length ?? 0;
  }

  /** True when tier exclusions are actively hiding raid bosses from the rendered set. */
  private get hasTierExclusionOverflow(): boolean {
    return (
      this.totalRaidBossCount > this.pokemonImages.length &&
      Boolean(this.excludeTiers && this.excludeTiers.length > 0) &&
      this.pokemonImages.length > 0
    );
  }

  /** True when there are more Pokemon than the display cap can show. */
  private get hasCapOverflow(): boolean {
    return this.pokemonImages.length > MAX_DISPLAYED_IMAGES;
  }

  get showOverflowBadge(): boolean {
    if (this.hasCapOverflow || this.hasTierExclusionOverflow) return true;
    if (!this.showOverflowCounter) return false;
    return this.displayedImages.length >= 2;
  }

  get overflowBadgeCount(): number {
    if (this.hasTierExclusionOverflow) {
      return this.totalRaidBossCount;
    }
    if (this.hasCapOverflow) {
      return this.pokemonImages.length;
    }
    return this.displayedImages.length;
  }

  get showContainer(): boolean {
    return this.displayedImages.length > 0 || this.shouldShowPlaceholder;
  }

  trackByImage(index: number, image: PokemonImageData): string {
    return `pokemon-${image.name}-${image.imageUrl ?? 'none'}-${image.fallbackImageUrl ?? 'none'}-${String(index)}`;
  }
}
