import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { IonItem, IonLabel } from '@ionic/angular/standalone';
import { Generation } from '../../core/services/filter.service';
import { UserDataService } from '../../core/services/user-data.service';
import { GATHER_ROW_ITEM_SIZE_PX } from '../../gather/gather-row-sizing';

@Component({
  selector: 'app-generation-header-row',
  standalone: true,
  imports: [IonItem, IonLabel],
  templateUrl: './generation-header-row.component.html',
  styleUrl: './generation-header-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerationHeaderRowComponent implements OnInit, OnChanges, OnDestroy {
  private readonly userDataService = inject(UserDataService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  @Input() generation!: Generation;

  readonly rowHeightPx = GATHER_ROW_ITEM_SIZE_PX;
  countText = '';

  private progressChangeSubscription?: Subscription;

  ngOnInit(): void {
    this.progressChangeSubscription = this.userDataService
      .listenForProgressChanges()
      .subscribe(() => {
        this.updateCountText();
        this.changeDetectorRef.markForCheck();
      });
  }

  ngOnChanges(): void {
    this.updateCountText();
  }

  ngOnDestroy(): void {
    this.progressChangeSubscription?.unsubscribe();
  }

  private updateCountText(): void {
    const entries = this.generation.speciesList.flatMap((group) => group.entries);
    const total = entries.length;
    const caught = entries.filter((entry) => this.userDataService.getItemState(entry.id)).length;

    this.countText = `${String(caught)}/${String(total)}`;
  }
}
