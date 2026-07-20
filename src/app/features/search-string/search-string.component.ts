import { Component, Input, inject } from '@angular/core';
import {
  IonAccordion,
  IonItem,
  IonLabel,
  IonButton,
  IonIcon,
  IonTextarea,
  ToastController,
} from '@ionic/angular/standalone';
import { Clipboard } from '@capacitor/clipboard';
import { addIcons } from 'ionicons';
import { copyOutline } from 'ionicons/icons';

export interface SearchStringConfig {
  name: string;
  value: string;
}

@Component({
  selector: 'app-search-string',
  standalone: true,
  imports: [IonAccordion, IonItem, IonLabel, IonButton, IonIcon, IonTextarea],
  templateUrl: './search-string.component.html',
  styleUrl: './search-string.component.scss',
})
export class SearchStringComponent {
  private readonly toastController = inject(ToastController);

  @Input() config!: SearchStringConfig;

  constructor() {
    addIcons({ copyOutline });
  }

  // Stops the click from bubbling to the accordion header, which would
  // otherwise toggle expand/collapse at the same time as copying.
  async copy(event: Event): Promise<void> {
    event.stopPropagation();
    await Clipboard.write({ string: this.config.value });
    await this.showCopyToast();
  }

  private async showCopyToast(): Promise<void> {
    const toast = await this.toastController.create({
      message: 'Copied!',
      duration: 1000,
      position: 'middle',
    });

    await toast.present();
  }
}
