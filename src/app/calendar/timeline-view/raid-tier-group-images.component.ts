import { Component, Input } from '@angular/core';
import { SpriteEffect } from '../../core/services/event-sprite-url.util';
import { RaidTierGroupWithImages } from '../../core/services/raid-tier-groups.util';
import { PokemonImageComponent } from './pokemon-image.component';

/**
 * Ported from pogo-cal's RaidTierGroupImages.vue, minus `useAnimated` (static-
 * only scope) and the `showTooltip` input (tooltips dropped entirely — see
 * pokemon-image.component.ts). Source always shows CP for these groups
 * (a raid schedule/tier breakdown, always CP-eligible), so that's hardcoded
 * true here too, not exposed as an input.
 */
@Component({
  selector: 'app-raid-tier-group-images',
  imports: [PokemonImageComponent],
  templateUrl: './raid-tier-group-images.component.html',
  styleUrl: './raid-tier-group-images.component.scss',
})
export class RaidTierGroupImagesComponent {
  @Input() groups: RaidTierGroupWithImages[] | null | undefined = undefined;
  @Input({ required: true }) height!: number;
  @Input({ required: true }) eventType!: string;
  @Input() effect: SpriteEffect | undefined = undefined;
}
