import { Component, OnInit, inject } from '@angular/core';
import { forkJoin, tap } from 'rxjs';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonAccordionGroup,
  IonButtons,
  IonButton,
  IonMenuButton,
  ToastController,
} from '@ionic/angular/standalone';
import { ExportBundle, UserSettings } from '@go-gather/shared';
import { PokeDataService } from '../core/services/poke-data.service';
import { UserDataService } from '../core/services/user-data.service';
import { FilterService, Generation } from '../core/services/filter.service';
import { SearchConfigService } from '../core/services/search-config.service';
import { PokeGroupComponent } from '../features/poke-group/poke-group.component';
import { presentShareFile } from '../core/utils/share-file.util';
import { pickJsonTextFile } from '../core/utils/pick-file.util';

@Component({
  selector: 'app-gather',
  templateUrl: 'gather.page.html',
  styleUrls: ['gather.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonAccordionGroup,
    IonButtons,
    IonButton,
    IonMenuButton,
    PokeGroupComponent,
  ],
})
export class GatherPage implements OnInit {
  private readonly pokeDataService = inject(PokeDataService);
  private readonly userDataService = inject(UserDataService);
  private readonly filterService = inject(FilterService);
  private readonly searchConfigService = inject(SearchConfigService);
  private readonly toastController = inject(ToastController);

  generationToPokemonMap: Generation[] = [];
  userSettings!: UserSettings;
  headerText = '';

  ngOnInit(): void {
    this.userSettings = this.userDataService.getUserSettings();

    forkJoin([
      this.pokeDataService.loadCatalog(),
      this.userDataService.loadProgress(),
      this.searchConfigService.loadConfig(),
    ]).subscribe(() => {
      this.generationToPokemonMap = this.filterService.groupPokemonByGeneration(
        this.userDataService.getUserSettings()
      );
      this.updateHeaderText();
    });

    this.userDataService
      .listenForUserSettingsChanges()
      .pipe(tap((newUserSettings) => (this.userSettings = newUserSettings)))
      .subscribe((userSettings) => {
        this.generationToPokemonMap = this.filterService.groupPokemonByGeneration(userSettings);
        this.updateHeaderText();
      });

    // Only "Uncaught Only" makes catch/uncatch actions change what's
    // visible, so re-filtering on every progress change elsewhere would be
    // wasted work — skip it unless that setting is actually in effect.
    this.userDataService.listenForProgressChanges().subscribe(() => {
      if (this.userSettings.showUncaughtOnly) {
        this.generationToPokemonMap = this.filterService.groupPokemonByGeneration(
          this.userSettings
        );
      }
      this.updateHeaderText();
    });
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
          this.userSettings = this.userDataService.getUserSettings();
          this.generationToPokemonMap = this.filterService.groupPokemonByGeneration(
            this.userSettings
          );
          this.updateHeaderText();
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

  private updateHeaderText(): void {
    const entries = this.generationToPokemonMap.flatMap((generation) =>
      generation.speciesList.flatMap((group) => group.entries)
    );
    const total = entries.length;
    const caught = entries.filter((entry) => this.userDataService.getItemState(entry.id)).length;

    this.headerText = `GO Gather (${String(caught)}/${String(total)})`;
  }
}
