import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonAccordionGroup,
  AlertController,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add } from 'ionicons/icons';
import { PresetQuery } from '@go-gather/shared';
import { compilePresetQuery } from '../core/search-engine/preset-query.compiler';
import { UserDataService } from '../core/services/user-data.service';
import {
  SearchStringComponent,
  SearchStringConfig,
} from '../features/search-string/search-string.component';

interface PresetQueryRow {
  preset: PresetQuery;
  config: SearchStringConfig;
}

@Component({
  selector: 'app-preset-queries',
  templateUrl: 'preset-queries.page.html',
  styleUrls: ['preset-queries.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonAccordionGroup,
    SearchStringComponent,
  ],
})
export class PresetQueriesPage implements ViewWillEnter {
  private readonly userDataService = inject(UserDataService);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);

  rows: PresetQueryRow[] = [];

  constructor() {
    addIcons({ add });
  }

  ionViewWillEnter(): void {
    this.refreshRows();
  }

  newPreset(): void {
    void this.router.navigate(['/preset-queries', 'new', 'edit']);
  }

  editPreset(preset: PresetQuery): void {
    void this.router.navigate(['/preset-queries', preset.id, 'edit']);
  }

  async deletePreset(preset: PresetQuery): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Delete preset',
      message: `Delete preset "${preset.name}"?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.confirmDelete(preset);
          },
        },
      ],
    });

    await alert.present();
  }

  private confirmDelete(preset: PresetQuery): void {
    const userSettings = this.userDataService.getUserSettings();
    const presetQueries = userSettings.presetQueries.filter(
      (candidate) => candidate.id !== preset.id
    );

    this.userDataService.updateUserSettings({ presetQueries });
    this.refreshRows();
  }

  private refreshRows(): void {
    this.rows = this.userDataService.getUserSettings().presetQueries.map((preset) => ({
      preset,
      config: {
        name: preset.name,
        value: this.compileForDisplay(preset),
      },
    }));
  }

  // A preset saved mid-edit with an incomplete numeric-range rule (e.g.
  // "Range" checked but no min/max entered) compiles to an invalid query —
  // compilePresetQuery throws rather than returning a meaningless string.
  // The list must still render that row instead of crashing the whole page.
  private compileForDisplay(preset: PresetQuery): string {
    try {
      return compilePresetQuery(preset) ?? '(no rules yet)';
    } catch {
      return '(invalid preset — edit to fix)';
    }
  }
}
