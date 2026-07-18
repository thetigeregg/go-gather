import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonMenu,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonAccordionGroup,
  IonAccordion,
  IonItem,
  IonLabel,
  IonList,
  IonRadioGroup,
  IonRadio,
  IonToggle,
} from '@ionic/angular/standalone';
import { PokedexType, RegionFilter, ShinyFilter, UserSettings } from '@go-gather/shared';
import { UserDataService } from '../../core/services/user-data.service';
import { PreferenceStorageService } from '../../core/storage/preference-storage.service';

const POKEDEX_TYPE_LABELS: Record<PokedexType, string> = {
  regular: 'Regular Pokedex',
  mega: 'Mega Pokedex',
  max: 'GMax Pokedex',
  dmax: 'DMax Pokedex',
  xxl: 'XXL Pokedex',
  xxs: 'XXS Pokedex',
  costume: 'Costume Pokedex',
};

const SHINY_FILTER_LABELS: Record<ShinyFilter, string> = {
  all: 'All Forms',
  shiny: 'Shiny Only',
  'non-shiny': 'Non-Shiny Only',
};

const REGION_FILTER_LABELS: Record<RegionFilter, string> = {
  all: 'All Regions',
  kanto: 'Kanto',
  johto: 'Johto',
  hoenn: 'Hoenn',
  sinnoh: 'Sinnoh',
  unova: 'Unova',
  kalos: 'Kalos',
  alola: 'Alola',
  galar: 'Galar',
  hisui: 'Hisui',
  paldea: 'Paldea',
};

const REGION_FILTER_OPTIONS: RegionFilter[] = [
  'all',
  'kanto',
  'johto',
  'hoenn',
  'sinnoh',
  'unova',
  'kalos',
  'alola',
  'galar',
  'hisui',
  'paldea',
];

const POKEDEX_TYPE_OPTIONS: PokedexType[] = [
  'regular',
  'mega',
  'max',
  'dmax',
  'xxl',
  'xxs',
  'costume',
];
const SHINY_FILTER_OPTIONS: ShinyFilter[] = ['all', 'shiny', 'non-shiny'];

/** Which sidebar accordion sections are expanded — purely UI-chrome state
 * (not a filter), so it's kept in its own PreferenceStorageService key
 * rather than bloating `UserSettings`. */
const ACCORDION_STATE_KEY = 'sidebarAccordionState';

interface SelectOption<T> {
  value: T;
  label: string;
}

interface ToggleOption {
  label: string;
  tooltip: string;
  isOn: boolean;
  command: () => void;
}

@Component({
  selector: 'app-side-menu',
  standalone: true,
  imports: [
    RouterLink,
    IonMenu,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonAccordionGroup,
    IonAccordion,
    IonItem,
    IonLabel,
    IonList,
    IonRadioGroup,
    IonRadio,
    IonToggle,
  ],
  templateUrl: './side-menu.component.html',
  styleUrl: './side-menu.component.scss',
})
export class SideMenuComponent implements OnInit {
  private readonly userDataService = inject(UserDataService);
  private readonly preferenceStorageService = inject(PreferenceStorageService);

  readonly pokedexTypeOptions: SelectOption<PokedexType>[] = POKEDEX_TYPE_OPTIONS.map(
    (pokedexType) => ({ value: pokedexType, label: POKEDEX_TYPE_LABELS[pokedexType] })
  );
  readonly shinyFilterOptions: SelectOption<ShinyFilter>[] = SHINY_FILTER_OPTIONS.map(
    (shinyFilter) => ({ value: shinyFilter, label: SHINY_FILTER_LABELS[shinyFilter] })
  );
  readonly regionFilterOptions: SelectOption<RegionFilter>[] = REGION_FILTER_OPTIONS.map(
    (regionFilter) => ({ value: regionFilter, label: REGION_FILTER_LABELS[regionFilter] })
  );

  toggleOptions: ToggleOption[] = [];

  pokedexTypeHeader = '';
  shinyFilterHeader = '';
  regionFilterHeader = '';

  openSections: string[] = [];

  ngOnInit(): void {
    this.refresh(this.userDataService.getUserSettings());

    this.preferenceStorageService
      .getItem(ACCORDION_STATE_KEY)
      .then((raw) => {
        this.openSections = this.parseAccordionState(raw);
      })
      .catch((err: unknown) => {
        console.error('Failed to load sidebar accordion state', err);
      });
  }

  get userSettings(): UserSettings {
    return this.userDataService.getUserSettings();
  }

  onAccordionChange(value: unknown): void {
    const list = Array.isArray(value)
      ? value
      : value === undefined || value === null
        ? []
        : [value];
    const normalized = list.filter((entry): entry is string => typeof entry === 'string');

    this.openSections = normalized;
    this.preferenceStorageService
      .setItem(ACCORDION_STATE_KEY, JSON.stringify(normalized))
      .catch((err: unknown) => {
        console.error('Failed to save sidebar accordion state', err);
      });
  }

  onPokedexTypeChange(value: unknown): void {
    this.updateSettings({ pokedexType: value as PokedexType });
  }

  onShinyFilterChange(value: unknown): void {
    this.updateSettings({ shinyFilter: value as ShinyFilter });
  }

  onRegionFilterChange(value: unknown): void {
    this.updateSettings({ regionFilter: value as RegionFilter });
  }

  private refresh(userSettings: UserSettings): void {
    this.pokedexTypeHeader = `Pokedex: ${POKEDEX_TYPE_LABELS[userSettings.pokedexType]}`;
    this.shinyFilterHeader = `Shiny Filter: ${SHINY_FILTER_LABELS[userSettings.shinyFilter]}`;
    this.regionFilterHeader = `Region: ${REGION_FILTER_LABELS[userSettings.regionFilter]}`;

    this.toggleOptions = [
      this.buildToggleOption(
        'Uncaught Only',
        'showUncaughtOnly',
        'Hide Pokemon already marked caught',
        userSettings
      ),
      this.buildToggleOption(
        'Alternate Forms',
        'showAlternate',
        'Castform, Vivillon, etc',
        userSettings
      ),
      this.buildToggleOption(
        'Regional Forms',
        'showRegional',
        'Galarian, Alolan, etc',
        userSettings
      ),
      this.buildToggleOption(
        'Gender Forms',
        'showGender',
        'Forms with gender differences',
        userSettings
      ),
    ];
  }

  private buildToggleOption(
    label: string,
    settingKey: 'showUncaughtOnly' | 'showAlternate' | 'showRegional' | 'showGender',
    tooltip: string,
    userSettings: UserSettings
  ): ToggleOption {
    return {
      label,
      tooltip,
      isOn: userSettings[settingKey],
      command: () => {
        this.toggleSetting(settingKey);
      },
    };
  }

  private updateSettings(partialSettings: Partial<UserSettings>): void {
    const userSettings = this.userDataService.getUserSettings();
    const updatedSettings = { ...userSettings, ...partialSettings };

    this.userDataService.updateUserSettings(updatedSettings);
    this.refresh(updatedSettings);
  }

  private toggleSetting(
    settingKey: 'showUncaughtOnly' | 'showAlternate' | 'showRegional' | 'showGender'
  ): void {
    const userSettings = this.userDataService.getUserSettings();
    this.updateSettings({ [settingKey]: !userSettings[settingKey] });
  }

  private parseAccordionState(raw: string | null): string[] {
    if (!raw) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : [];
    } catch {
      return [];
    }
  }
}
