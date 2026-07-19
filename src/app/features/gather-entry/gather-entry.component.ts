import { Component, Input, inject } from '@angular/core';
import { IonIcon, IonItem, IonLabel, IonThumbnail } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, sparkles } from 'ionicons/icons';
import { CatalogEntry } from '@go-gather/shared';
import { UserDataService } from '../../core/services/user-data.service';

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
    this.spriteSrc = value.imgUrl || SPRITE_PLACEHOLDER_URL;
    this.caughtButtonIcon = value.isShiny ? 'sparkles' : 'checkmark-circle';
    this.caught = this.userDataService.getItemState(this._entry.id);
  }

  get entry(): CatalogEntry {
    return this._entry;
  }

  onSpriteError(): void {
    this.spriteSrc = SPRITE_PLACEHOLDER_URL;
  }

  entryCardClicked(): void {
    const newCaughtState = !this.caught;
    this.caught = newCaughtState;

    this.userDataService.setEntryState(this._entry.id, newCaughtState);
  }
}
