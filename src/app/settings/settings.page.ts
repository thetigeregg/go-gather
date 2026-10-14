import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Subscription } from 'rxjs';
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
  IonItem,
  IonLabel,
  IonInput,
  IonToggle,
  IonDatetime,
  IonDatetimeButton,
  IonModal,
  IonNote,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { download, share } from 'ionicons/icons';
import { AvailabilityStatus, DEFAULT_SETTINGS, ExportBundle } from '@go-gather/shared';
import { AvailabilityStatusService } from '../core/services/availability-status.service';
import { NotificationService } from '../core/services/notification.service';
import { UserDataService } from '../core/services/user-data.service';
import { getPokemonId, getPokemonName } from '../core/services/pokemon-sprite-mapper.util';
import { ChipListInputComponent } from '../features/chip-list-input/chip-list-input.component';
import { presentShareFile } from '../core/utils/share-file.util';
import { pickJsonTextFile } from '../core/utils/pick-file.util';

/** ion-datetime works with ISO 8601 strings, not bare "HH:mm" — this
 * arbitrary fixed date is only ever used as a wrapper so the time picker has
 * a full ISO value to bind to; only the "HH:mm" substring is ever persisted. */
const ALL_DAY_TIME_PICKER_DATE = '2000-01-01';

/** Display names for the server's Bulbapedia datasets (see
 * server/src/bulbapedia.ts's AVAILABILITY_DATASETS). A dataset added later
 * that isn't listed here is shown by its raw name. */
const DATASET_LABELS: Partial<Record<string, string>> = {
  dynamax: 'Dynamax',
  gigantamax: 'Gigantamax',
  species: 'Released Pokémon',
  mega: 'Mega & Primal forms',
  shiny: 'Shinies',
  unreleasedForms: 'Unreleased forms',
};

/** Dex exclusion lists are shown in ascending dex order — including lists
 * saved before sorting existed, hence also applied on hydration. */
function sortedDexNumberStrings(dexNumbers: readonly number[]): string[] {
  return [...dexNumbers].sort((a, b) => a - b).map(String);
}

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
    IonItem,
    IonLabel,
    IonInput,
    IonToggle,
    IonDatetime,
    IonDatetimeButton,
    IonModal,
    IonNote,
    DatePipe,
    ChipListInputComponent,
  ],
})
export class SettingsPage implements ViewWillEnter {
  private readonly userDataService = inject(UserDataService);
  private readonly notificationService = inject(NotificationService);
  private readonly availabilityStatusService = inject(AvailabilityStatusService);
  private readonly toastController = inject(ToastController);

  patterns: string[] = [];
  dexNumbers: string[] = [];
  shinyDexNumbers: string[] = [];
  shinyPatterns: string[] = [];
  userTags: string[] = [];

  availabilityStatus: AvailabilityStatus[] | null = null;
  readonly bulbapediaUrl = 'https://bulbapedia.bulbagarden.net/';
  readonly licenseUrl = 'https://creativecommons.org/licenses/by-nc-sa/2.5/';

  /** The latest request failed; any status shown is from an earlier visit. */
  availabilityStatusUnavailable = false;
  private availabilityStatusRequest?: Subscription;

  notificationsSupported = false;
  notificationsEnabled = false;
  notificationTimedEventOffsetMinutes = 0;
  notificationAllDayEventTime = '09:00';

  constructor() {
    addIcons({ download, share });
    this.notificationsSupported = this.notificationService.isPushSupported();
  }

  ionViewWillEnter(): void {
    this.refreshFromUserSettings();
    this.loadAvailabilityStatus();
  }

  /** Display name for a Bulbapedia dataset in the status card. */
  datasetLabel(dataset: string): string {
    return DATASET_LABELS[dataset] ?? dataset;
  }

  /** Re-read on every visit, since it reflects the server's latest syncs.
   * A newer visit cancels an older request still in flight, so a slow
   * response can't overwrite a newer one. A failed request (offline, server
   * down) keeps the status from an earlier visit and only affects this card. */
  private loadAvailabilityStatus(): void {
    this.availabilityStatusRequest?.unsubscribe();
    this.availabilityStatusRequest = this.availabilityStatusService.loadStatus().subscribe({
      next: (status) => {
        this.availabilityStatus = status;
        this.availabilityStatusUnavailable = false;
      },
      error: () => {
        this.availabilityStatusUnavailable = true;
      },
    });
  }

  async notificationsEnabledChanged(event: CustomEvent<{ checked: boolean }>): Promise<void> {
    const enabled = event.detail.checked;

    if (!enabled) {
      this.notificationsEnabled = false;
      this.userDataService.updateUserSettings({ notificationsEnabled: false });
      await this.notificationService.unregisterCurrentDevice();
      return;
    }

    const result = await this.notificationService.requestPermissionAndRegister();
    if (!result.ok) {
      this.notificationsEnabled = false;
      await this.showToast(result.message);
      return;
    }

    this.notificationsEnabled = true;
    this.userDataService.updateUserSettings({ notificationsEnabled: true });
  }

  timedOffsetChanged(event: CustomEvent<{ value?: string | null }>): void {
    const raw = event.detail.value;
    const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
    if (!Number.isInteger(parsed) || parsed < 0) {
      return;
    }
    this.notificationTimedEventOffsetMinutes = parsed;
    this.userDataService.updateUserSettings({ notificationTimedEventOffsetMinutes: parsed });
  }

  allDayTimeChanged(event: CustomEvent<{ value?: string | string[] | null }>): void {
    const value = event.detail.value;
    if (typeof value !== 'string') {
      return;
    }
    // ion-datetime emits a full ISO string; only the "HH:mm" portion is
    // persisted, since that's all UserSettings.notificationAllDayEventTime holds.
    const time = value.slice(11, 16);
    this.notificationAllDayEventTime = time;
    this.userDataService.updateUserSettings({ notificationAllDayEventTime: time });
  }

  get notificationAllDayEventTimeIso(): string {
    return `${ALL_DAY_TIME_PICKER_DATE}T${this.notificationAllDayEventTime}:00`;
  }

  patternsChanged(patterns: string[]): void {
    this.patterns = patterns;
    this.userDataService.updateUserSettings({ excludedNamePatterns: patterns });
  }

  dexNumbersChanged(dexNumbers: string[]): void {
    this.dexNumbers = this.resolveDexNumbers(dexNumbers);
    const excludedDexNumbers = this.dexNumbers.map(Number);
    this.userDataService.updateUserSettings({ excludedDexNumbers });
  }

  shinyDexNumbersChanged(shinyDexNumbers: string[]): void {
    this.shinyDexNumbers = this.resolveDexNumbers(shinyDexNumbers);
    const excludedShinyDexNumbers = this.shinyDexNumbers.map(Number);
    this.userDataService.updateUserSettings({ excludedShinyDexNumbers });
  }

  /** Display formatter for the dex number lists — an arrow property so it
   * can be handed to `app-chip-list-input`'s `labelFn` without rebinding. */
  readonly dexNumberLabel = (value: string): string => {
    const name = getPokemonName(Number(value));
    return name ? `#${value} · ${name}` : `#${value}`;
  };

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
        excludedSearchTermsByPokedex:
          this.userDataService.getUserSettings().excludedSearchTermsByPokedex,
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
        // Not `?? {}` — a partial/empty map isn't safe for downstream code
        // (search-strings.page.ts, search-string.service.ts) that indexes
        // it by the current pokedex type without a further fallback, so an
        // older backup missing this field falls back to the full seeded
        // defaults instead.
        excludedSearchTermsByPokedex:
          bundle.excludedSearchTermsByPokedex ?? DEFAULT_SETTINGS.excludedSearchTermsByPokedex,
      };
      /* eslint-enable @typescript-eslint/no-unnecessary-condition */
    }

    throw new Error('Unrecognized backup file format');
  }

  /** Accepts each entry as either a dex number or a Pokemon name (resolved
   * via the bundled name map, e.g. "pikachu" → "25"). Entries that are
   * neither (e.g. a stray typo) are dropped rather than stored, so the
   * exclusion filter never has to guard against them, and a name that
   * resolves to an already-listed number doesn't add a duplicate. The
   * result is sorted by dex number. */
  private resolveDexNumbers(values: string[]): string[] {
    const resolved = values.map((value) => {
      const trimmed = value.trim();
      if (/^\d+$/.test(trimmed)) {
        return Number(trimmed);
      }
      return getPokemonId(trimmed);
    });
    const dexNumbers = resolved.filter((value): value is number => value !== null);
    return sortedDexNumberStrings([...new Set(dexNumbers)]);
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 1500,
      position: 'bottom',
    });
    await toast.present();
  }

  private refreshFromUserSettings(): void {
    const userSettings = this.userDataService.getUserSettings();
    this.patterns = [...userSettings.excludedNamePatterns];
    this.dexNumbers = sortedDexNumberStrings(userSettings.excludedDexNumbers);
    this.shinyDexNumbers = sortedDexNumberStrings(userSettings.excludedShinyDexNumbers);
    this.shinyPatterns = [...userSettings.excludedShinyNamePatterns];
    this.userTags = [...userSettings.userTags];
    this.notificationsEnabled = userSettings.notificationsEnabled;
    this.notificationTimedEventOffsetMinutes = userSettings.notificationTimedEventOffsetMinutes;
    this.notificationAllDayEventTime = userSettings.notificationAllDayEventTime;
  }
}
