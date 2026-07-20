import { Component, OnInit, inject } from '@angular/core';
import { forkJoin, tap } from 'rxjs';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonAccordionGroup,
  IonButtons,
  IonMenuButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { menu, filter } from 'ionicons/icons';
import { UserSettings } from '@go-gather/shared';
import { PokeDataService } from '../core/services/poke-data.service';
import { UserDataService } from '../core/services/user-data.service';
import { FilterService, Generation } from '../core/services/filter.service';
import { SearchConfigService } from '../core/services/search-config.service';
import { SyncService } from '../core/services/sync.service';
import { PokeGroupComponent } from '../features/poke-group/poke-group.component';
import { POKEDEX_TYPE_LABELS } from '../features/side-menu/side-menu.component';

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
    IonMenuButton,
    IonIcon,
    PokeGroupComponent,
  ],
})
export class GatherPage implements OnInit {
  private readonly pokeDataService = inject(PokeDataService);
  private readonly userDataService = inject(UserDataService);
  private readonly filterService = inject(FilterService);
  private readonly searchConfigService = inject(SearchConfigService);
  private readonly syncService = inject(SyncService);

  generationToPokemonMap: Generation[] = [];
  userSettings!: UserSettings;
  headerText = '';
  expandedGenerations = new Set<string>();

  constructor() {
    addIcons({ menu, filter });
  }

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

    // The app's very first load always reads the local catalog before
    // SyncService's first pull has had a chance to populate it (see
    // main.ts), so this page can render with an empty catalog. Re-fetch and
    // re-group whenever a background sync actually writes a new catalog,
    // instead of leaving the page stuck empty until a lucky reload.
    this.syncService.listenForCatalogSync().subscribe(() => {
      this.pokeDataService.loadCatalog().subscribe(() => {
        this.generationToPokemonMap = this.filterService.groupPokemonByGeneration(
          this.userDataService.getUserSettings()
        );
        this.updateHeaderText();
      });
    });
  }

  /** Ionic keeps every accordion's content in the DOM regardless of expand
   * state, and this catalog runs to ~9,000 entries across all generations —
   * rendering every generation's species/entries eagerly froze the main
   * thread for tens of seconds. Track which generations are actually
   * expanded so `app-poke-group` can render its content lazily. */
  onAccordionChange(value: unknown): void {
    const list = Array.isArray(value)
      ? value
      : value === undefined || value === null
        ? []
        : [value];
    const normalized = list.filter((entry): entry is string => typeof entry === 'string');

    this.expandedGenerations = new Set(normalized);
  }

  private updateHeaderText(): void {
    const entries = this.generationToPokemonMap.flatMap((generation) =>
      generation.speciesList.flatMap((group) => group.entries)
    );
    const total = entries.length;
    const caught = entries.filter((entry) => this.userDataService.getItemState(entry.id)).length;
    const pokedexLabel = POKEDEX_TYPE_LABELS[this.userSettings.pokedexType];

    this.headerText = `${pokedexLabel} (${String(caught)}/${String(total)})`;
  }
}
