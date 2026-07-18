import { Component, Input, inject } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, female, sparkles } from 'ionicons/icons';
import { CatalogEntry, UserSettings } from '@go-gather/shared';
import { UserDataService } from '../../core/services/user-data.service';

const SPRITE_PLACEHOLDER_URL = '/assets/sprite-placeholder.png';

@Component({
  selector: 'app-gather-entry',
  standalone: true,
  imports: [IonButton, IonIcon],
  templateUrl: './gather-entry.component.html',
  styleUrl: './gather-entry.component.scss',
})
export class GatherEntryComponent {
  private readonly userDataService = inject(UserDataService);

  @Input() userSettings!: UserSettings;
  @Input() speciesName!: string;
  /** Whether any sibling in this card's row has a distinct form name — if
   * none do, the header can collapse instead of reserving blank space for
   * text that will never appear in this row. */
  @Input() reserveNameSpace = true;

  _entry!: CatalogEntry;
  caught = false;
  spriteSrc = SPRITE_PLACEHOLDER_URL;
  caughtButtonIcon = 'checkmark-circle';

  constructor() {
    addIcons({ sparkles, female, checkmarkCircle });
  }

  @Input()
  set entry(value: CatalogEntry) {
    this._entry = value;
    this.spriteSrc = value.imgUrl || SPRITE_PLACEHOLDER_URL;
    this.caughtButtonIcon = this.getCaughtButtonIcon();
    this.caught = this.userDataService.getItemState(this._entry.id);
  }

  get entry(): CatalogEntry {
    return this._entry;
  }

  onSpriteError(): void {
    this.spriteSrc = SPRITE_PLACEHOLDER_URL;
  }

  onCaughtButtonClick(event: Event): void {
    event.stopPropagation();

    const newCaughtState = !this.caught;
    this.caught = newCaughtState;

    this.userDataService.setEntryState(this._entry.id, newCaughtState);
  }

  entryCardClicked(): void {
    const newCaughtState = !this.caught;
    this.caught = newCaughtState;

    this.userDataService.setEntryState(this._entry.id, newCaughtState);
  }

  getCaughtButtonIcon(): string {
    if (this._entry.isShiny) {
      return 'sparkles';
    }

    if (this._entry.isFemale) {
      return 'female';
    }

    return 'checkmark-circle';
  }
}
