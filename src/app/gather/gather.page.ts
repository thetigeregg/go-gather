import { Component, OnInit, inject } from '@angular/core';
import { forkJoin, tap } from 'rxjs';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonAccordionGroup,
} from '@ionic/angular/standalone';
import { UserSettings } from '@go-gather/shared';
import { PokeDataService } from '../core/services/poke-data.service';
import { UserDataService } from '../core/services/user-data.service';
import { FilterService, Generation } from '../core/services/filter.service';
import { SearchConfigService } from '../core/services/search-config.service';
import { PokeGroupComponent } from '../features/poke-group/poke-group.component';

@Component({
  selector: 'app-gather',
  templateUrl: 'gather.page.html',
  styleUrls: ['gather.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonAccordionGroup, PokeGroupComponent],
})
export class GatherPage implements OnInit {
  private readonly pokeDataService = inject(PokeDataService);
  private readonly userDataService = inject(UserDataService);
  private readonly filterService = inject(FilterService);
  private readonly searchConfigService = inject(SearchConfigService);

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

  private updateHeaderText(): void {
    const entries = this.generationToPokemonMap.flatMap((generation) =>
      generation.speciesList.flatMap((group) => group.entries)
    );
    const total = entries.length;
    const caught = entries.filter((entry) => this.userDataService.getItemState(entry.id)).length;

    this.headerText = `GO Gather (${String(caught)}/${String(total)})`;
  }
}
