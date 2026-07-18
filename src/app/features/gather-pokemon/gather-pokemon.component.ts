import { Component, Input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular/standalone';
import { CatalogEntry, UserSettings } from '@go-gather/shared';
import { SpeciesGroup } from '../../core/services/filter.service';
import { GatherEntryComponent } from '../gather-entry/gather-entry.component';

// Entries wrap into fixed-size rows (rather than flex-wrap's fluid,
// width-dependent wrapping) so a real divider element can be rendered
// between rows — CSS can't reliably target "the boundary between wrapped
// rows" when the number of items per row changes with container width.
const ENTRIES_PER_ROW = 5;

export interface EntryRow {
  entries: CatalogEntry[];
  /** False when every entry in this row shares the species' plain name
   * (e.g. a row of just the base + shiny forms) — lets the header collapse
   * instead of reserving blank space no card in the row will ever fill. */
  hasNamedEntry: boolean;
}

@Component({
  selector: 'app-gather-pokemon',
  standalone: true,
  imports: [IonCard, IonCardHeader, IonCardTitle, IonCardContent, GatherEntryComponent],
  templateUrl: './gather-pokemon.component.html',
  styleUrl: './gather-pokemon.component.scss',
})
export class GatherPokemonComponent {
  private _speciesGroup!: SpeciesGroup;
  @Input() userSettings!: UserSettings;

  entryRows: EntryRow[] = [];

  @Input()
  set speciesGroup(value: SpeciesGroup) {
    this._speciesGroup = value;
    this.entryRows = this.chunkIntoRows(value.entries, value.speciesName, ENTRIES_PER_ROW);
  }

  get speciesGroup(): SpeciesGroup {
    return this._speciesGroup;
  }

  private chunkIntoRows(entries: CatalogEntry[], speciesName: string, rowSize: number): EntryRow[] {
    const rows: EntryRow[] = [];

    for (let i = 0; i < entries.length; i += rowSize) {
      const rowEntries = entries.slice(i, i + rowSize);
      rows.push({
        entries: rowEntries,
        hasNamedEntry: rowEntries.some((entry) => entry.name !== speciesName),
      });
    }

    return rows;
  }
}
