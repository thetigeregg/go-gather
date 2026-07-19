import { Component, Input, OnChanges, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { IonAccordion, IonItem, IonLabel } from '@ionic/angular/standalone';
import { Generation } from '../../core/services/filter.service';
import { UserDataService } from '../../core/services/user-data.service';
import { GatherPokemonComponent } from '../gather-pokemon/gather-pokemon.component';

@Component({
  selector: 'app-poke-group',
  standalone: true,
  imports: [IonAccordion, IonItem, IonLabel, GatherPokemonComponent],
  templateUrl: './poke-group.component.html',
  styleUrl: './poke-group.component.scss',
})
export class PokeGroupComponent implements OnInit, OnChanges, OnDestroy {
  private readonly userDataService = inject(UserDataService);

  @Input() generation!: Generation;

  countText = '';

  private progressChangeSubscription?: Subscription;

  ngOnInit(): void {
    this.progressChangeSubscription = this.userDataService
      .listenForProgressChanges()
      .subscribe(() => {
        this.updateHeaderText();
      });
  }

  ngOnChanges(): void {
    this.updateHeaderText();
  }

  ngOnDestroy(): void {
    this.progressChangeSubscription?.unsubscribe();
  }

  private updateHeaderText(): void {
    const entries = this.generation.speciesList.flatMap((group) => group.entries);
    const total = entries.length;
    const caught = entries.filter((entry) => this.userDataService.getItemState(entry.id)).length;

    this.countText = `${String(caught)}/${String(total)}`;
  }
}
