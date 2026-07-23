import { Component, OnInit, inject } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuToggle,
  IonNote,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
import { EVENT_TYPES, EventMetadata, EventTypeInfo } from '@go-gather/shared';
import { CalendarEventsService } from '../../core/services/calendar-events.service';
import { CalendarFilterService } from '../../core/services/calendar-filter.service';
import { formatEventName } from '../../core/services/calendar-event-name.util';

/** Display order matches pogo-cal's EventTypeFilterGrid.vue — not alphabetical. */
const CATEGORY_ORDER: EventTypeInfo['category'][] = [
  'seasonal-and-premium',
  'research',
  'community-and-raids',
  'events-and-misc',
];

const CATEGORY_LABELS: Record<EventTypeInfo['category'], string> = {
  'seasonal-and-premium': 'Seasonal & Premium',
  research: 'Research',
  'community-and-raids': 'Community & Raids',
  'events-and-misc': 'Events & Misc',
};

interface EventTypeToggleOption {
  eventType: string;
  label: string;
  isOn: boolean;
}

interface EventTypeCategoryGroup {
  category: EventTypeInfo['category'];
  label: string;
  options: EventTypeToggleOption[];
}

interface HiddenEventOption {
  eventId: string;
  displayName: string;
}

interface DailyBonusDayOption {
  dayOfWeek: number;
  label: string;
  isOn: boolean;
}

/**
 * Ported from pogo-cal's EventFilterOptions.vue (+ its HiddenEventsList.vue
 * and the "Apply filters to Timeline" switch from CalendarOptions.vue),
 * rendered as a single-column list with a divider per category rather than
 * pogo-cal's 4-column grid — this app's target is phone-width, not a
 * desktop-oriented offcanvas. Wiring mirrors SideMenuComponent exactly:
 * reads/writes through CalendarFilterService, rebuilding a plain toggle-array
 * on init and after every write rather than subscribing to change events.
 */
@Component({
  selector: 'app-calendar-filter-menu',
  imports: [
    IonMenu,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonItemDivider,
    IonLabel,
    IonToggle,
    IonButton,
    IonIcon,
    IonNote,
    IonFooter,
    IonMenuToggle,
  ],
  templateUrl: './calendar-filter-menu.component.html',
  styleUrl: './calendar-filter-menu.component.scss',
})
export class CalendarFilterMenuComponent implements OnInit {
  private readonly calendarFilterService = inject(CalendarFilterService);
  private readonly calendarEventsService = inject(CalendarEventsService);

  categoryGroups: EventTypeCategoryGroup[] = [];
  hiddenEvents: HiddenEventOption[] = [];
  dailyBonusDayOptions: DailyBonusDayOption[] = [];
  filtersApplyToTimeline = false;
  enabledCount = 0;
  totalCount = 0;

  constructor() {
    addIcons({ close });
  }

  ngOnInit(): void {
    this.refresh();
  }

  /** Mounted once for the app's lifetime (a persistent side menu, not
   * recreated per open) — re-syncing here, not just in ngOnInit, keeps the
   * hidden-events list (names, counts) current with calendar data that may
   * have finished loading, or filter state that may have changed elsewhere,
   * since this menu was first constructed. */
  onWillOpen(): void {
    this.refresh();
  }

  onFiltersApplyToTimelineChange(value: boolean): void {
    this.calendarFilterService.setFiltersApplyToTimeline(value);
    this.refresh();
  }

  onToggleEventType(eventType: string): void {
    this.calendarFilterService.toggleEventType(eventType);
    this.refresh();
  }

  toggleDailyBonusDay(dayOfWeek: number): void {
    this.calendarFilterService.toggleDailyBonusDay(dayOfWeek);
    this.refresh();
  }

  enableAll(): void {
    this.calendarFilterService.enableAllEventTypes();
    this.refresh();
  }

  disableAll(): void {
    this.calendarFilterService.disableAllEventTypes();
    this.refresh();
  }

  restoreHiddenEvent(eventId: string): void {
    this.calendarFilterService.showEventById(eventId);
    this.refresh();
  }

  private refresh(): void {
    const state = this.calendarFilterService.getFilterState();
    const entries = Object.entries(EVENT_TYPES);

    this.categoryGroups = CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      options: entries
        .filter(([, info]) => info.category === category)
        .sort(([, a], [, b]) => a.name.localeCompare(b.name))
        .map(([eventType, info]) => ({
          eventType,
          label: info.name,
          isOn: !state.disabledEventTypes.includes(eventType),
        })),
    }));

    // eventMetadata is declared Readonly<Record<string, EventMetadata>>, which
    // tells TypeScript indexing always succeeds — untrue for a hidden event
    // whose data hasn't loaded (e.g. this menu opened before the Calendar tab
    // ever has). Re-typed as partial so the ?? fallback is honestly typed.
    const eventMetadata: Partial<Record<string, EventMetadata>> =
      this.calendarEventsService.eventMetadata;
    const events = this.calendarEventsService.events;
    this.hiddenEvents = state.hiddenEventIds.map((eventId) => {
      const rawName = events.find((event) => event.eventID === eventId)?.name;
      return {
        eventId,
        displayName:
          eventMetadata[eventId]?.displayName ?? (rawName ? formatEventName(rawName) : eventId),
      };
    });

    const dailyBonuses = this.calendarEventsService.season?.dailyBonuses ?? [];
    const seenDaysOfWeek = new Set<number>();
    this.dailyBonusDayOptions = dailyBonuses
      .filter((dailyBonus) => {
        if (seenDaysOfWeek.has(dailyBonus.dayOfWeek)) {
          return false;
        }
        seenDaysOfWeek.add(dailyBonus.dayOfWeek);
        return true;
      })
      .map((dailyBonus) => ({
        dayOfWeek: dailyBonus.dayOfWeek,
        label: dailyBonus.bonuses.find((group) => group.title)?.title ?? `${dailyBonus.day} Bonus`,
        isOn: !state.disabledSeasonDailyBonusDays.includes(dailyBonus.dayOfWeek),
      }))
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);

    this.filtersApplyToTimeline = state.filtersApplyToTimeline;
    this.totalCount = entries.length;
    this.enabledCount = entries.filter(
      ([eventType]) => !state.disabledEventTypes.includes(eventType)
    ).length;
  }
}
