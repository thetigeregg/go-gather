import { Component, Input, inject } from '@angular/core';
import { IonIcon, IonItem, IonLabel, IonThumbnail } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, sparkles } from 'ionicons/icons';
import { CatalogEntry } from '@go-gather/shared';
import { UserDataService } from '../../core/services/user-data.service';
import { ImageCacheService } from '../../core/services/image-cache.service';

const SPRITE_PLACEHOLDER_URL = '/assets/sprite-placeholder.png';

@Component({
  selector: 'app-gather-entry',
  standalone: true,
  imports: [IonItem, IonThumbnail, IonLabel, IonIcon],
  templateUrl: './gather-entry.component.html',
  styleUrl: './gather-entry.component.scss',
})
export class GatherEntryComponent {
  private readonly userDataService = inject(UserDataService);
  private readonly imageCacheService = inject(ImageCacheService);

  _entry!: CatalogEntry;
  caught = false;
  spriteSrc = SPRITE_PLACEHOLDER_URL;
  caughtButtonIcon = 'checkmark-circle';

  constructor() {
    addIcons({ sparkles, checkmarkCircle });
  }

  @Input()
  set entry(value: CatalogEntry) {
    this._entry = value;
    this.spriteSrc = SPRITE_PLACEHOLDER_URL;
    this.caughtButtonIcon = value.isShiny ? 'sparkles' : 'checkmark-circle';
    this.caught = this.userDataService.getItemState(this._entry.id);
    this.resolveSprite(value);
  }

  get entry(): CatalogEntry {
    return this._entry;
  }

  onSpriteError(): void {
    this.spriteSrc = SPRITE_PLACEHOLDER_URL;
  }

  /**
   * Resolves the cached (or freshly fetched-and-cached) sprite URL. Left on
   * the placeholder if resolution fails — e.g. offline with nothing cached
   * yet for this entry.
   */
  private resolveSprite(entry: CatalogEntry): void {
    if (!entry.imgUrl) {
      return;
    }

    this.imageCacheService
      .resolveImageUrl(entry.id, entry.imgUrl)
      .then((url) => {
        if (this._entry === entry) {
          this.spriteSrc = url;
        }
      })
      .catch(() => {
        // Offline and never cached: leave the placeholder in place.
      });
  }

  entryCardClicked(): void {
    const newCaughtState = !this.caught;
    this.caught = newCaughtState;

    this.userDataService.setEntryState(this._entry.id, newCaughtState);
  }
}
