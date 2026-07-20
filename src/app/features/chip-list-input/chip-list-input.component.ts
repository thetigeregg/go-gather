import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonChip, IonIcon, IonInput, IonItem } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeCircle } from 'ionicons/icons';

/**
 * Free-text add/remove chip list — used for the settings page's excluded
 * patterns/dex numbers/tags fields, which all share the same add-on-enter-
 * or-blur, remove-by-click shape. No validation here (e.g. numeric-only
 * filtering for dex number fields) — that stays at the point of use, so this
 * component works for any string list.
 */
@Component({
  selector: 'app-chip-list-input',
  standalone: true,
  imports: [FormsModule, IonItem, IonInput, IonChip, IonIcon],
  templateUrl: './chip-list-input.component.html',
  styleUrl: './chip-list-input.component.scss',
})
export class ChipListInputComponent {
  @Input() values: string[] = [];
  @Input() placeholder = '';
  @Output() valuesChange = new EventEmitter<string[]>();

  draft = '';

  constructor() {
    addIcons({ closeCircle });
  }

  addFromDraft(): void {
    const trimmed = this.draft.trim();
    this.draft = '';

    if (trimmed.length === 0) {
      return;
    }

    this.valuesChange.emit([...this.values, trimmed]);
  }

  removeAt(index: number): void {
    this.valuesChange.emit(this.values.filter((_, i) => i !== index));
  }
}
