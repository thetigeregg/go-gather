import { Component, inject } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonIcon,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { download, share } from 'ionicons/icons';
import { ExportBundle } from '@go-gather/shared';
import { UserDataService } from '../core/services/user-data.service';
import { ChipListInputComponent } from '../features/chip-list-input/chip-list-input.component';
import { presentShareFile } from '../core/utils/share-file.util';
import { pickJsonTextFile } from '../core/utils/pick-file.util';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton,
    IonButton,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonIcon,
    ChipListInputComponent,
  ],
})
export class SettingsPage implements ViewWillEnter {
  private readonly userDataService = inject(UserDataService);
  private readonly toastController = inject(ToastController);

  patterns: string[] = [];
  dexNumbers: string[] = [];
  shinyDexNumbers: string[] = [];
  shinyPatterns: string[] = [];
  userTags: string[] = [];

  constructor() {
    addIcons({ download, share });
  }

  ionViewWillEnter(): void {
    this.refreshFromUserSettings();
  }

  patternsChanged(patterns: string[]): void {
    this.patterns = patterns;
    this.userDataService.updateUserSettings({ excludedNamePatterns: patterns });
  }

  dexNumbersChanged(dexNumbers: string[]): void {
    // Non-numeric entries (e.g. a stray typo) are dropped rather than
    // stored, so the exclusion filter never has to guard against them.
    this.dexNumbers = dexNumbers.filter((value) => /^\d+$/.test(value.trim()));
    const excludedDexNumbers = this.dexNumbers.map(Number);
    this.userDataService.updateUserSettings({ excludedDexNumbers });
  }

  shinyDexNumbersChanged(shinyDexNumbers: string[]): void {
    this.shinyDexNumbers = shinyDexNumbers.filter((value) => /^\d+$/.test(value.trim()));
    const excludedShinyDexNumbers = this.shinyDexNumbers.map(Number);
    this.userDataService.updateUserSettings({ excludedShinyDexNumbers });
  }

  shinyPatternsChanged(shinyPatterns: string[]): void {
    this.shinyPatterns = shinyPatterns;
    this.userDataService.updateUserSettings({ excludedShinyNamePatterns: shinyPatterns });
  }

  userTagsChanged(userTags: string[]): void {
    this.userTags = userTags;
    this.userDataService.updateUserSettings({ userTags });
  }

  async exportBundle(): Promise<void> {
    const bundle = this.userDataService.exportBundle();

    // Includes time-of-day (not just the date) so multiple exports taken
    // the same day don't overwrite each other / are easy to tell apart.
    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, '-')
      .replace(/\.\d+Z$/, '');

    await presentShareFile({
      content: JSON.stringify(bundle, null, 2),
      filename: `go-gather-backup-${timestamp}.json`,
      mimeType: 'application/json',
    });
  }

  async triggerImport(): Promise<void> {
    const outcome = await pickJsonTextFile();

    if (outcome.status === 'cancelled') {
      return;
    }

    try {
      const bundle = this.parseExportBundle(JSON.parse(outcome.text));

      this.userDataService.importBundle(bundle).subscribe({
        next: () => {
          this.refreshFromUserSettings();
          void this.showToast('Import complete.');
        },
        error: (err: unknown) => {
          console.error('Failed to import data', err);
          void this.showToast('Failed to import data.');
        },
      });
    } catch (err) {
      console.error('Failed to read import file', err);
      await this.showToast('Failed to read import file.');
    }
  }

  /** Accepts either the current bundle format or a bare progress-entry array
   * from before excluded patterns were included in exports, so an older
   * backup file can still be imported. */
  private parseExportBundle(parsed: unknown): ExportBundle {
    if (Array.isArray(parsed)) {
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        progress: parsed as ExportBundle['progress'],
        excludedNamePatterns: this.userDataService.getUserSettings().excludedNamePatterns,
        excludedDexNumbers: this.userDataService.getUserSettings().excludedDexNumbers,
        excludedShinyDexNumbers: this.userDataService.getUserSettings().excludedShinyDexNumbers,
        excludedShinyNamePatterns: this.userDataService.getUserSettings().excludedShinyNamePatterns,
        userTags: this.userDataService.getUserSettings().userTags,
        presetQueries: this.userDataService.getUserSettings().presetQueries,
      };
    }

    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as ExportBundle).progress)) {
      const bundle = parsed as ExportBundle;
      // The `as ExportBundle` cast above only satisfies the type checker —
      // parsed JSON from an arbitrary import file has no actual runtime
      // guarantee these fields exist, so the `??` fallbacks below are real
      // safety, not dead code, despite what the static types imply.
      /* eslint-disable @typescript-eslint/no-unnecessary-condition */
      return {
        version: 1,
        exportedAt: bundle.exportedAt ?? new Date().toISOString(),
        progress: bundle.progress,
        excludedNamePatterns: bundle.excludedNamePatterns ?? [],
        excludedDexNumbers: bundle.excludedDexNumbers ?? [],
        excludedShinyDexNumbers: bundle.excludedShinyDexNumbers ?? [],
        excludedShinyNamePatterns: bundle.excludedShinyNamePatterns ?? [],
        userTags: bundle.userTags ?? [],
        presetQueries: bundle.presetQueries ?? [],
      };
      /* eslint-enable @typescript-eslint/no-unnecessary-condition */
    }

    throw new Error('Unrecognized backup file format');
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 1500 });
    await toast.present();
  }

  private refreshFromUserSettings(): void {
    const userSettings = this.userDataService.getUserSettings();
    this.patterns = [...userSettings.excludedNamePatterns];
    this.dexNumbers = userSettings.excludedDexNumbers.map(String);
    this.shinyDexNumbers = userSettings.excludedShinyDexNumbers.map(String);
    this.shinyPatterns = [...userSettings.excludedShinyNamePatterns];
    this.userTags = [...userSettings.userTags];
  }
}
