import { Component, Input } from '@angular/core';
import {
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
} from '@ionic/angular/standalone';
import { PokedexType } from '@go-gather/shared';
import {
  AvailabilityChangeKind,
  AvailabilitySection,
} from '../../core/services/availability-changes.util';
import { POKEDEX_TYPE_LABELS } from '../side-menu/side-menu.component';

const SECTION_TITLES: Record<AvailabilityChangeKind, string> = {
  available: 'Now available',
  announced: 'Announced',
  unavailable: 'No longer available',
};

/** Lists grouped availability changes (see groupAvailabilityChanges), for
 * the availability-changes sheet and the availability history page. */
@Component({
  selector: 'app-availability-sections',
  templateUrl: './availability-sections.component.html',
  styleUrl: './availability-sections.component.scss',
  imports: [IonItem, IonItemDivider, IonLabel, IonList, IonListHeader, IonNote],
})
export class AvailabilitySectionsComponent {
  @Input() sections: AvailabilitySection[] = [];

  sectionTitle(kind: AvailabilityChangeKind): string {
    return SECTION_TITLES[kind];
  }

  pokedexLabel(pokedexType: PokedexType): string {
    return POKEDEX_TYPE_LABELS[pokedexType];
  }

  /** `YYYY-MM-DD` as e.g. "Nov 6", read as a local date like the rest of
   * the release-date handling. */
  formatDate(date: string): string {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }
}
