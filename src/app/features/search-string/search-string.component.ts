import { Component, Input, inject } from '@angular/core';
import { IonButton, IonIcon, IonTextarea, ToastController } from '@ionic/angular/standalone';
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
  imports: [IonButton, IonIcon, IonTextarea],
  templateUrl: './search-string.component.html',
  styleUrl: './search-string.component.scss',
})
export class SearchStringComponent {
  private readonly toastController = inject(ToastController);

  @Input() config!: SearchStringConfig;

  expanded = false;

  constructor() {
    addIcons({ copyOutline });
  }

  async copy(): Promise<void> {
    await Clipboard.write({ string: this.config.value });
    await this.showCopyToast();
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
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
