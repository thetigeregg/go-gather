import { Component, Input } from '@angular/core';
import {
  SearchStringComponent,
  SearchStringConfig,
} from '../search-string/search-string.component';

@Component({
  selector: 'app-multi-search-string',
  standalone: true,
  imports: [SearchStringComponent],
  templateUrl: './multi-search-string.component.html',
  styleUrl: './multi-search-string.component.scss',
})
export class MultiSearchStringComponent {
  @Input() configs!: SearchStringConfig[];
  @Input() groupName!: string;
}
