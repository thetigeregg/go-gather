import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { GatherRow } from '../../gather/gather-row.model';
import { GATHER_ROW_GAP_PX, GATHER_ROW_HEADER_PX } from '../../gather/gather-row-sizing';
import { GatherEntryComponent } from '../gather-entry/gather-entry.component';

type EntryGatherRow = Extract<GatherRow, { kind: 'entry' }>;

@Component({
  selector: 'app-gather-entry-row',
  standalone: true,
  imports: [GatherEntryComponent],
  templateUrl: './gather-entry-row.component.html',
  styleUrl: './gather-entry-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GatherEntryRowComponent {
  @Input() row!: EntryGatherRow;

  // Every row (gap slots + header slot + entry) must add up to exactly
  // GATHER_ROW_ITEM_SIZE_PX regardless of isFirstInSpecies/isLastInSpecies,
  // since CdkFixedSizeVirtualScroll positions rows by index * itemSize
  // without measuring the DOM. Only background/border/radius vary by row
  // position to fake a continuous card across a species' entry rows.
  @HostBinding('style.--gather-row-gap-px') readonly gapPx = `${String(GATHER_ROW_GAP_PX)}px`;
  @HostBinding('style.--gather-row-header-px') readonly headerPx =
    `${String(GATHER_ROW_HEADER_PX)}px`;
}
