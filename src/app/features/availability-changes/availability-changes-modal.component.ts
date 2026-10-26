import { Component, Input, inject } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
import { AvailabilitySection } from '../../core/services/availability-changes.util';
import { AvailabilitySectionsComponent } from './availability-sections.component';

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
    IonTitle,
    IonToolbar,
    AvailabilitySectionsComponent,
  ],
})
export class AvailabilityChangesModalComponent {
  private readonly modalController = inject(ModalController);

  @Input() sections: AvailabilitySection[] = [];

  constructor() {
    addIcons({ close });
  }

  dismiss(): void {
    void this.modalController.dismiss();
  }
}
