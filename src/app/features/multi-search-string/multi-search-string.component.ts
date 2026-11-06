import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import {
  SearchStringComponent,
  SearchStringConfig,
} from '../search-string/search-string.component';

@Component({
  selector: 'app-multi-search-string',
  standalone: true,
  imports: [IonAccordionGroup, SearchStringComponent],
  templateUrl: './multi-search-string.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './multi-search-string.component.scss',
})
export class MultiSearchStringComponent {
  @Input() configs!: SearchStringConfig[];
}
