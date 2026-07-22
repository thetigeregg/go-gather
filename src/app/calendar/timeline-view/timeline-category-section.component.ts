import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Dayjs } from 'dayjs';
import { IonAccordion, IonItem, IonLabel } from '@ionic/angular/standalone';
import { EventMetadata, PogoEvent } from '@go-gather/shared';
import { TimelineCategoryKey, TimelineDateGroup } from './timeline-categories.util';
import { TimelineEventComponent } from './timeline-event.component';

/**
 * Ported from pogo-cal's TimelineCategorySection.vue. TODAY/ONGOING render a
 * flat event list; UPCOMING/FUTURE render date-grouped lists (dateGroups
 * input is undefined for the flat categories, matching
 * timeline-categories.util.ts's Partial<Record<...>> groupedByDate shape).
 * Expand/collapse is an `ion-accordion` (parent timeline-view.component.html
 * hosts the `ion-accordion-group`), matching this repo's existing
 * search-string.component.ts convention rather than a hand-rolled toggle.
 * Expand state is local-only, not persisted (see the plan's simplification
 * note) — default expanded, set via the group's `value`.
 */
@Component({
  selector: 'app-timeline-category-section',
  imports: [IonAccordion, IonItem, IonLabel, TimelineEventComponent],
  templateUrl: './timeline-category-section.component.html',
  styleUrl: './timeline-category-section.component.scss',
})
export class TimelineCategorySectionComponent {
  @Input({ required: true }) categoryKey!: TimelineCategoryKey;
  @Input({ required: true }) title!: string;
  @Input({ required: true }) events: readonly PogoEvent[] = [];
  @Input() dateGroups: readonly TimelineDateGroup[] | undefined;
  @Input({ required: true }) totalCount = 0;
  @Input({ required: true }) hiddenCount = 0;
  @Input({ required: true }) eventMetadata: Readonly<Record<string, EventMetadata>> = {};
  @Input({ required: true }) activeEventId: string | null = null;
  @Input({ required: true }) now!: Dayjs;

  @Output() activate = new EventEmitter<string>();

  get isFlatCategory(): boolean {
    return this.categoryKey === 'today' || this.categoryKey === 'ongoing';
  }

  get hiddenCountText(): string {
    return `${String(this.hiddenCount)} event${this.hiddenCount === 1 ? '' : 's'} hidden by filters`;
  }

  onActivate(eventId: string): void {
    this.activate.emit(eventId);
  }
}
