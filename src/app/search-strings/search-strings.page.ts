import { Component, inject } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonAccordionGroup,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { ExcludedSearchTerm, PokedexType } from '@go-gather/shared';
import { SearchStringService } from '../core/services/search-string.service';
import { UserDataService } from '../core/services/user-data.service';
import { SearchConfigService } from '../core/services/search-config.service';
import { GeneralUtil } from '../core/utils/general.util';
import {
  SearchStringComponent,
  SearchStringConfig,
} from '../features/search-string/search-string.component';
import { MultiSearchStringComponent } from '../features/multi-search-string/multi-search-string.component';
import { ExcludedSearchTermInputComponent } from '../features/excluded-search-term-input/excluded-search-term-input.component';

const DEFAULT_LABELS: Record<PokedexType, string> = {
  regular: 'Default (Non-Shiny)',
  mega: 'Mega',
  max: 'GMax',
  dmax: 'DMax',
  xxl: 'XXL',
  xxs: 'XXS',
  costume: 'Costume (Non-Shiny)',
};

const SHINY_LABELS: Record<PokedexType, string> = {
  regular: 'Shiny',
  mega: 'Mega Shiny',
  max: 'GMax Shiny',
  dmax: 'DMax Shiny',
  xxl: 'XXL Shiny',
  xxs: 'XXS Shiny',
  costume: 'Costume Shiny',
};

@Component({
  selector: 'app-search-strings',
  templateUrl: 'search-strings.page.html',
  styleUrls: ['search-strings.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonAccordionGroup,
    SearchStringComponent,
    MultiSearchStringComponent,
    ExcludedSearchTermInputComponent,
  ],
})
export class SearchStringsPage implements ViewWillEnter {
  private readonly searchStringService = inject(SearchStringService);
  private readonly userDataService = inject(UserDataService);
  private readonly searchConfigService = inject(SearchConfigService);

  defaultConfig: SearchStringConfig | null = null;
  shinyConfig: SearchStringConfig | null = null;
  genderConfigs: SearchStringConfig[] | null = null;
  altRegionConfigs: SearchStringConfig[] | null = null;
  excludedSearchTerms: ExcludedSearchTerm[] = [];

  ionViewWillEnter(): void {
    this.defaultConfig = null;
    this.shinyConfig = null;
    this.genderConfigs = null;
    this.altRegionConfigs = null;

    const { pokedexType, excludedSearchTermsByPokedex } = this.userDataService.getUserSettings();
    this.excludedSearchTerms = excludedSearchTermsByPokedex[pokedexType];

    this.searchStringService.init();
    this.createConfigs();
  }

  excludedSearchTermsChanged(entries: ExcludedSearchTerm[]): void {
    const { pokedexType, excludedSearchTermsByPokedex } = this.userDataService.getUserSettings();
    this.excludedSearchTerms = entries;
    this.userDataService.updateUserSettings({
      excludedSearchTermsByPokedex: { ...excludedSearchTermsByPokedex, [pokedexType]: entries },
    });
    this.searchStringService.init();
    this.createConfigs();
  }

  /**
   * Every category is always attempted regardless of the main grid's own
   * Shiny Filter/Regional Forms/Gender Forms settings — Search Strings is a
   * separate, deliberately exhaustive tool for finding what's uncaught, not
   * a mirror of the current view. Each section still only renders if it
   * actually has matching uncaught entries (the null/empty checks below).
   *
   * The Default/Shiny section labels are chosen from whichever pokedex type
   * is currently selected (Regular/Mega/Max) — SearchStringService.init()
   * already scopes `missingEntries` to that same pokedex type, so "Default"
   * wouldn't read correctly once it's actually a list of Mega/Gigantamax
   * species names rather than regular-dex ones.
   */
  private createConfigs(): void {
    const { pokedexType } = this.userDataService.getUserSettings();

    const defaultSearchString = this.searchStringService.getDefaultSearchString();

    if (defaultSearchString) {
      this.defaultConfig = {
        name: DEFAULT_LABELS[pokedexType],
        value: defaultSearchString,
      };
    }

    const shinySearchString = this.searchStringService.getShinySearchString();

    if (shinySearchString) {
      this.shinyConfig = {
        name: SHINY_LABELS[pokedexType],
        value: shinySearchString,
      };
    }

    // Mega/GMax/DMax/XXL/XXS entries have no gender or regional-form
    // dimension in this app's data model — the sections would otherwise
    // render as a bare group header with nothing underneath (an empty
    // configs array is truthy, so `@if (genderConfigs)`/`@if
    // (altRegionConfigs)` in the template can't tell "no matches" apart from
    // "not applicable" on their own). Leaving these `null` hides the section
    // entirely, same as if there were never a category to compute in the
    // first place. Costume entries DO have a gender dimension (some costumes
    // come in real male/female pairs), so Gender Search Strings is also
    // computed for them — gated by costumeGenderEnabled since it's opt-out
    // config rather than structurally guaranteed. Alt-Region stays
    // Regular-only: costume entries have no independent region field.
    const showGenderConfigs =
      pokedexType === 'regular' ||
      (pokedexType === 'costume' && this.searchConfigService.costumeGenderEnabled);

    if (showGenderConfigs) {
      const genderConfigs: SearchStringConfig[] = [];

      const defaultMaleSearchString = this.searchStringService.getDefaultMaleSearchString();

      if (defaultMaleSearchString) {
        genderConfigs.push({
          name: 'Male (Non-Shiny)',
          value: defaultMaleSearchString,
        });
      }

      const defaultFemaleSearchString = this.searchStringService.getDefaultFemaleSearchString();

      if (defaultFemaleSearchString) {
        genderConfigs.push({
          name: 'Female (Non-Shiny)',
          value: defaultFemaleSearchString,
        });
      }

      const shinyMaleSearchString = this.searchStringService.getShinyMaleSearchString();

      if (shinyMaleSearchString) {
        genderConfigs.push({
          name: 'Male (Shiny)',
          value: shinyMaleSearchString,
        });
      }

      const shinyFemaleSearchString = this.searchStringService.getShinyFemaleSearchString();

      if (shinyFemaleSearchString) {
        genderConfigs.push({
          name: 'Female (Shiny)',
          value: shinyFemaleSearchString,
        });
      }

      this.genderConfigs = genderConfigs;
    }

    if (pokedexType === 'regular') {
      const defaultAltRegionConfigs = this.searchStringService.getAltRegionSearchStrings();
      const shinyAltRegionConfigs = this.searchStringService.getAltRegionSearchStrings('shiny');

      // Both maps are keyed by the same region names (e.g. "alola"), so
      // merging them directly into one Map would let the shiny entry
      // silently overwrite the non-shiny one for every region that has both
      // — losing the non-shiny alt-region string entirely. Building the
      // config list from each map separately (with a distinguishing label)
      // keeps both.
      this.altRegionConfigs = [
        ...Array.from(defaultAltRegionConfigs.entries()).map(([regionName, regionString]) => ({
          name: GeneralUtil.capitalizeFirstLetter(regionName),
          value: regionString,
        })),
        ...Array.from(shinyAltRegionConfigs.entries()).map(([regionName, regionString]) => ({
          name: `${GeneralUtil.capitalizeFirstLetter(regionName)} (Shiny)`,
          value: regionString,
        })),
      ];
    }
  }
}
