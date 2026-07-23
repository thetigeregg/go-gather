import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonChip,
  IonIcon,
  IonInput,
  IonItem,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeCircle } from 'ionicons/icons';
import { ExcludedSearchTerm } from '@go-gather/shared';
import { SIMPLE_KEYWORDS, SIZES } from '../../core/search-engine/search-term-catalog';
import { SimpleKeyword, Size } from '../../core/search-engine/search-query.model';

/**
 * Kind+value add/remove list for `UserSettings.excludedSearchTermsByPokedex`
 * — like `ChipListInputComponent`, but each entry needs a `kind`
 * ('tag'/'keyword'/'size') alongside its value rather than being a bare
 * string, since `keyword`/`size` values must come from a closed, valid set
 * for the generated search string to actually work (only `tag` accepts free
 * text, via the game's `#tagname` syntax).
 */
@Component({
  selector: 'app-excluded-search-term-input',
  standalone: true,
  imports: [
    FormsModule,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonChip,
    IonIcon,
  ],
  templateUrl: './excluded-search-term-input.component.html',
  styleUrl: './excluded-search-term-input.component.scss',
})
export class ExcludedSearchTermInputComponent {
  @Input() values: ExcludedSearchTerm[] = [];
  @Output() valuesChange = new EventEmitter<ExcludedSearchTerm[]>();

  readonly simpleKeywords = SIMPLE_KEYWORDS;
  readonly sizes = SIZES;

  draftKind: ExcludedSearchTerm['kind'] = 'tag';
  draftTagValue = '';
  draftKeywordValue: SimpleKeyword = SIMPLE_KEYWORDS[0];
  draftSizeValue: Size = SIZES[0];

  constructor() {
    addIcons({ closeCircle });
  }

  addFromDraft(): void {
    const entry = this.buildDraftEntry();

    if (!entry) {
      return;
    }

    const alreadyPresent = this.values.some(
      (value) => value.kind === entry.kind && value.value === entry.value
    );

    if (alreadyPresent) {
      return;
    }

    this.valuesChange.emit([...this.values, entry]);
    this.draftTagValue = '';
  }

  removeAt(index: number): void {
    this.valuesChange.emit(this.values.filter((_, i) => i !== index));
  }

  private buildDraftEntry(): ExcludedSearchTerm | null {
    switch (this.draftKind) {
      case 'tag': {
        const trimmed = this.draftTagValue.trim();
        return trimmed.length === 0 ? null : { kind: 'tag', value: trimmed };
      }
      case 'keyword':
        return { kind: 'keyword', value: this.draftKeywordValue };
      case 'size':
        return { kind: 'size', value: this.draftSizeValue };
    }
  }
}
