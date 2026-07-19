import { Component, Input } from '@angular/core';
import { IonCard, IonCardHeader, IonCardTitle, IonList } from '@ionic/angular/standalone';
import { SpeciesGroup } from '../../core/services/filter.service';
import { GatherEntryComponent } from '../gather-entry/gather-entry.component';

@Component({
  selector: 'app-gather-pokemon',
  standalone: true,
  imports: [IonCard, IonCardHeader, IonCardTitle, IonList, GatherEntryComponent],
  templateUrl: './gather-pokemon.component.html',
  styleUrl: './gather-pokemon.component.scss',
})
export class GatherPokemonComponent {
  @Input() speciesGroup!: SpeciesGroup;
}
