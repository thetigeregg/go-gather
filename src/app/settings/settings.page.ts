import { Component, inject } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { UserDataService } from '../core/services/user-data.service';
import { ChipListInputComponent } from '../features/chip-list-input/chip-list-input.component';

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
    ChipListInputComponent,
  ],
})
export class SettingsPage implements ViewWillEnter {
  private readonly userDataService = inject(UserDataService);

  patterns: string[] = [];
  dexNumbers: string[] = [];
  shinyDexNumbers: string[] = [];
  shinyPatterns: string[] = [];
  userTags: string[] = [];

  ionViewWillEnter(): void {
    const userSettings = this.userDataService.getUserSettings();
    this.patterns = [...userSettings.excludedNamePatterns];
    this.dexNumbers = userSettings.excludedDexNumbers.map(String);
    this.shinyDexNumbers = userSettings.excludedShinyDexNumbers.map(String);
    this.shinyPatterns = [...userSettings.excludedShinyNamePatterns];
    this.userTags = [...userSettings.userTags];
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
}
