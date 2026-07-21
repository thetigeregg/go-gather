import { AfterViewInit, Component, OnInit, ViewChild, inject } from '@angular/core';
import { forkJoin, tap } from 'rxjs';
import {
  CdkVirtualScrollViewport,
  ScrollingModule,
  VIRTUAL_SCROLL_STRATEGY,
} from '@angular/cdk/scrolling';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonMenuButton,
  IonIcon,
  IonSearchbar,
  IonFab,
  IonFabButton,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { menu, filter, search } from 'ionicons/icons';
import { UserSettings } from '@go-gather/shared';
import { PokeDataService } from '../core/services/poke-data.service';
import { UserDataService } from '../core/services/user-data.service';
import { FilterService, Generation } from '../core/services/filter.service';
import { SearchConfigService } from '../core/services/search-config.service';
import { SyncService } from '../core/services/sync.service';
import { GenerationHeaderRowComponent } from '../features/generation-header-row/generation-header-row.component';
import { GatherPokemonComponent } from '../features/gather-pokemon/gather-pokemon.component';
import { GatherRow, flattenGenerations, trackGatherRow } from './gather-row.model';
import { PrecomputedSizeVirtualScrollStrategy } from './precomputed-size-virtual-scroll-strategy';
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
    IonButtons,
    IonMenuButton,
    IonIcon,
    IonSearchbar,
    IonFab,
    IonFabButton,
    ScrollingModule,
    GenerationHeaderRowComponent,
    GatherPokemonComponent,
  ],
  providers: [
    PrecomputedSizeVirtualScrollStrategy,
    { provide: VIRTUAL_SCROLL_STRATEGY, useExisting: PrecomputedSizeVirtualScrollStrategy },
  ],
})
export class GatherPage implements OnInit, AfterViewInit {
  private readonly pokeDataService = inject(PokeDataService);
  private readonly userDataService = inject(UserDataService);
  private readonly filterService = inject(FilterService);
  private readonly searchConfigService = inject(SearchConfigService);
  private readonly syncService = inject(SyncService);
  private readonly virtualScrollStrategy = inject(PrecomputedSizeVirtualScrollStrategy);

  @ViewChild('searchbar') searchbarRef?: IonSearchbar;
  @ViewChild(CdkVirtualScrollViewport) viewportRef?: CdkVirtualScrollViewport;

  generationToPokemonMap: Generation[] = [];
  visibleGenerations: Generation[] = [];
  userSettings!: UserSettings;
  headerText = '';
  searchTerm = '';

  flatRows: GatherRow[] = [];
  generationHeaderIndexByRow: number[] = [];
  readonly trackGatherRow = trackGatherRow;

  stickyGenerationName = '';
  stickyGenerationCaught = 0;
  stickyGenerationTotal = 0;
  showStickyBar = false;

  constructor() {
    addIcons({ menu, filter, search });
  }

  ngOnInit(): void {
    this.userSettings = this.userDataService.getUserSettings();

    forkJoin([
      this.pokeDataService.loadCatalog(),
      this.userDataService.loadProgress(),
      this.searchConfigService.loadConfig(),
    ]).subscribe(() => {
      this.setGenerations(
        this.filterService.groupPokemonByGeneration(this.userDataService.getUserSettings())
      );
      this.updateHeaderText();
    });

    this.userDataService
      .listenForUserSettingsChanges()
      .pipe(tap((newUserSettings) => (this.userSettings = newUserSettings)))
      .subscribe((userSettings) => {
        this.setGenerations(this.filterService.groupPokemonByGeneration(userSettings));
        this.updateHeaderText();
      });

    // Only "Uncaught Only" makes catch/uncatch actions change what's
    // visible, so re-filtering on every progress change elsewhere would be
    // wasted work — skip it unless that setting is actually in effect.
    this.userDataService.listenForProgressChanges().subscribe(() => {
      if (this.userSettings.showUncaughtOnly) {
        this.setGenerations(this.filterService.groupPokemonByGeneration(this.userSettings));
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
        this.setGenerations(
          this.filterService.groupPokemonByGeneration(this.userDataService.getUserSettings())
        );
        this.updateHeaderText();
      });
    });
  }

  /** Ionic's `ion-content` finishes sizing itself asynchronously (custom
   * element upgrade + `--offset-top`/`--offset-bottom` calculation), which
   * can happen after the CDK viewport's own ResizeObserver has already
   * taken its first (too-small) measurement — leaving it rendering far
   * fewer rows than the real viewport height needs. `checkViewportSize()`
   * forces a re-measure once layout has actually settled. */
  ngAfterViewInit(): void {
    requestAnimationFrame(() => this.viewportRef?.checkViewportSize());
  }

  onSearchChange(term: string): void {
    this.searchTerm = term;
    this.applySearchFilter();
  }

  focusSearch(): void {
    void this.searchbarRef?.setFocus();
  }

  /** Updates the sticky "you are here" bar from the CDK viewport's currently
   * scrolled-to row index, since a `position: sticky` header inside the
   * virtualized list would get recycled away after a few rows of scroll. */
  onScrolledIndexChange(index: number): void {
    if (this.flatRows.length === 0) {
      this.stickyGenerationName = '';
      this.stickyGenerationCaught = 0;
      this.stickyGenerationTotal = 0;
      this.showStickyBar = false;
      return;
    }

    const clampedIndex = Math.min(Math.max(index, 0), this.flatRows.length - 1);
    const headerRow = this.flatRows[this.generationHeaderIndexByRow[clampedIndex]];

    if (headerRow.kind === 'generation-header') {
      const entries = headerRow.generation.speciesList.flatMap((group) => group.entries);
      this.stickyGenerationName = headerRow.generation.generationName;
      this.stickyGenerationTotal = entries.length;
      this.stickyGenerationCaught = entries.filter((entry) =>
        this.userDataService.getItemState(entry.id)
      ).length;
    }

    // The generation-header row itself is already visible at the top of the
    // list once scrolled to it, so showing the sticky bar there too would
    // just duplicate the same generation name/count redundantly.
    this.showStickyBar = this.flatRows[clampedIndex].kind !== 'generation-header';
  }

  private setGenerations(generations: Generation[]): void {
    this.generationToPokemonMap = generations;
    this.applySearchFilter();
  }

  /** Narrows the display to species matching the search term without
   * affecting the header's caught/total counts, which stay scoped to the
   * full pokedex-and-filters selection regardless of search. */
  private applySearchFilter(): void {
    const term = this.searchTerm.trim().toLowerCase();

    this.visibleGenerations = term
      ? this.generationToPokemonMap
          .map((generation) => ({
            ...generation,
            speciesList: generation.speciesList.filter((group) =>
              group.speciesName.toLowerCase().includes(term)
            ),
          }))
          .filter((generation) => generation.speciesList.length > 0)
      : this.generationToPokemonMap;

    const flattened = flattenGenerations(this.visibleGenerations);
    this.flatRows = flattened.rows;
    this.generationHeaderIndexByRow = flattened.generationHeaderIndexByRow;
    this.virtualScrollStrategy.setItemSizes(flattened.rowSizes);
    this.onScrolledIndexChange(0);
    this.viewportRef?.scrollToIndex(0);
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
