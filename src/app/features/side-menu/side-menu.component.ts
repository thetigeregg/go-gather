import { Component, OnInit, inject } from '@angular/core';
import {
  IonMenu,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonItem,
  IonList,
  IonSelect,
  IonSelectOption,
  IonToggle,
} from '@ionic/angular/standalone';
import { PokedexType, RegionFilter, ShinyFilter, UserSettings } from '@go-gather/shared';
import { UserDataService } from '../../core/services/user-data.service';

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
    IonMenu,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonItem,
    IonList,
    IonSelect,
    IonSelectOption,
    IonToggle,
  ],
  templateUrl: './side-menu.component.html',
  styleUrl: './side-menu.component.scss',
})
export class SideMenuComponent implements OnInit {
  private readonly userDataService = inject(UserDataService);

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

  ngOnInit(): void {
    this.refresh(this.userDataService.getUserSettings());
  }

  get userSettings(): UserSettings {
    return this.userDataService.getUserSettings();
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
}
