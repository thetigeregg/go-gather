import { Component, Input, inject } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
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

/** Lists the availability changes the app picked up (see
 * AvailabilityChangesService). Opened by AppComponent through
 * ModalController. */
@Component({
  selector: 'app-availability-changes-modal',
  templateUrl: './availability-changes-modal.component.html',
  styleUrl: './availability-changes-modal.component.scss',
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonItem,
    IonItemDivider,
    IonLabel,
    IonList,
    IonListHeader,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
})
export class AvailabilityChangesModalComponent {
  private readonly modalController = inject(ModalController);

  @Input() sections: AvailabilitySection[] = [];

  constructor() {
    addIcons({ close });
  }

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

  dismiss(): void {
    void this.modalController.dismiss();
  }
}
