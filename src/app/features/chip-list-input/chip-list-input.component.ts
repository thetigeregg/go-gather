import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

/**
 * Free-text add/remove list — used for the settings page's excluded
 * patterns/dex numbers/tags fields, which all share the same add-on-enter-
 * or-blur shape. Current entries render as items in a pre-expanded
 * accordion, each removable via a confirmation alert. No validation here
 * (e.g. numeric-only filtering for dex number fields) — that stays at the
 * point of use, so this component works for any string list; `labelFn` lets
 * the caller format how each stored value is displayed.
 */
@Component({
  selector: 'app-chip-list-input',
  standalone: true,
  imports: [
    FormsModule,
    IonAccordionGroup,
    IonAccordion,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonIcon,
  ],
  templateUrl: './chip-list-input.component.html',
  styleUrl: './chip-list-input.component.scss',
})
export class ChipListInputComponent {
  private readonly alertController = inject(AlertController);

  @Input() values: string[] = [];
  @Input() placeholder = '';
  @Input() listLabel = 'Current entries';
  @Input() labelFn: (value: string) => string = (value) => value;
  @Output() valuesChange = new EventEmitter<string[]>();

  draft = '';

  constructor() {
    addIcons({ close });
  }

  addFromDraft(): void {
    const trimmed = this.draft.trim();
    this.draft = '';

    if (trimmed.length === 0) {
      return;
    }

    this.valuesChange.emit([...this.values, trimmed]);
  }

  async confirmRemove(index: number): Promise<void> {
    // Capture the entry itself (and which duplicate it is), not just the
    // index: presenting the alert moves focus off the input, and the blur's
    // addFromDraft() may emit a reordered list (e.g. sorted dex numbers)
    // before the user confirms, shifting the rows.
    const value = this.values[index];
    const occurrence = this.values.slice(0, index).filter((v) => v === value).length;

    const alert = await this.alertController.create({
      header: 'Remove entry',
      message: `Remove "${this.labelFn(value)}"?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => {
            const currentIndex = this.findOccurrenceIndex(value, occurrence);
            if (currentIndex !== -1) {
              this.removeAt(currentIndex);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  /** Bound to the remove buttons' mousedown so pressing one doesn't take
   * focus from the input. Otherwise the input blurs before the click lands,
   * addFromDraft() can reorder the list and re-render the rows, and the
   * click then resolves its index against the new list, picking a
   * different entry than the one the user pressed. */
  keepInputFocus(event: Event): void {
    event.preventDefault();
  }

  removeAt(index: number): void {
    this.valuesChange.emit(this.values.filter((_, i) => i !== index));
  }

  private findOccurrenceIndex(value: string, occurrence: number): number {
    let seen = 0;
    return this.values.findIndex((v) => v === value && seen++ === occurrence);
  }
}
