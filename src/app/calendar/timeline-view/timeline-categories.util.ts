import { Dayjs } from 'dayjs';
import { EventMetadata, PogoEvent } from '@go-gather/shared';
import { getEventTypeInfo } from '../../core/services/calendar-event-type-info.util';

/** Ported from pogo-cal's src/utils/eventTypes.ts's TimelineCategory. */
export const TIMELINE_CATEGORIES = [
  { key: 'today', title: 'Today Only' },
  { key: 'ongoing', title: 'Ongoing Events' },
  { key: 'upcoming', title: 'Upcoming Events (Next 2 Weeks)' },
  { key: 'future', title: 'Future Events (Beyond 2 Weeks)' },
] as const;

export type TimelineCategoryKey = (typeof TIMELINE_CATEGORIES)[number]['key'];

export interface TimelineDateGroup {
  dateKey: string;
  dayOfWeek: string;
  dateStr: string;
  events: PogoEvent[];
}

export interface TimelineData {
  categorizedEvents: Record<TimelineCategoryKey, PogoEvent[]>;
  totalEventsCounts: Record<TimelineCategoryKey, number>;
  hiddenEventsCounts: Record<TimelineCategoryKey, number>;
  groupedByDate: Partial<Record<TimelineCategoryKey, TimelineDateGroup[]>>;
  hasAnyEvents: boolean;
}

function emptyCategoryRecord<T>(fill: () => T): Record<TimelineCategoryKey, T> {
  return {
    today: fill(),
    ongoing: fill(),
    upcoming: fill(),
    future: fill(),
  };
}

/**
 * Ported from pogo-cal's src/utils/eventSort.ts. Deliberately distinct from
 * calendar-grid-slots.util.ts's sortEventsByPriority() (priority-only) — the
 * timeline sorts by timing first, priority only as a tiebreaker. Do not
 * consolidate these two functions.
 */
export function sortEventsByTimingAndPriority(
  events: readonly PogoEvent[],
  eventMetadata: Readonly<Record<string, EventMetadata>>
): PogoEvent[] {
  return [...events].sort((a, b) => {
    const aMetadata = eventMetadata[a.eventID];
    const bMetadata = eventMetadata[b.eventID];

    const aIsHappening = !aMetadata.isPastEvent && !aMetadata.isFutureEvent;
    const bIsHappening = !bMetadata.isPastEvent && !bMetadata.isFutureEvent;

    if (aIsHappening && !bIsHappening) {
      return -1;
    }
    if (!aIsHappening && bIsHappening) {
      return 1;
    }

    if (aIsHappening && bIsHappening) {
      const endTimeDiff = aMetadata.endDate.diff(bMetadata.endDate);
      if (endTimeDiff !== 0) {
        return endTimeDiff;
      }
      return getEventTypeInfo(b.eventType).priority - getEventTypeInfo(a.eventType).priority;
    }

    const startTimeDiff = aMetadata.startDate.diff(bMetadata.startDate);
    if (startTimeDiff !== 0) {
      return startTimeDiff;
    }
    return getEventTypeInfo(b.eventType).priority - getEventTypeInfo(a.eventType).priority;
  });
}

/**
 * Ported from pogo-cal's src/composables/useTimelineCategories.ts, minus the
 * manual clock offset ("now" is a plain snapshot passed in by the caller,
 * not a live-ticking ref) — see calendar-view.component.ts's precedent for
 * the same non-ticking "now" pattern.
 *
 * The `!filtersApplyToTimeline || isEventVisible(...)` gate is ported
 * verbatim, including its quirk: when the toggle is off, ALL events are
 * visible on the timeline — even individually-hidden ones, not just
 * type-disabled ones. This was a deliberate decision (not an oversight) to
 * match the source exactly rather than the docs' looser prose description.
 */
export function buildTimelineData(
  events: readonly PogoEvent[],
  eventMetadata: Readonly<Record<string, EventMetadata>>,
  now: Dayjs,
  isEventVisible: (eventType: string, eventId: string) => boolean,
  filtersApplyToTimeline: boolean
): TimelineData {
  const windowStart = now.subtract(1, 'day');
  const windowEnd = now.add(60, 'day');

  const filteredEvents = events
    .filter((event) => {
      const metadata = eventMetadata[event.eventID];
      return metadata.startDate.isBefore(windowEnd) && metadata.endDate.isAfter(windowStart);
    })
    .sort((a, b) => eventMetadata[a.eventID].startDate.diff(eventMetadata[b.eventID].startDate));

  const today = now.startOf('day');
  const twoWeeksFromNow = now.add(2, 'week');

  const categorizedEvents = emptyCategoryRecord<PogoEvent[]>(() => []);
  const totalEventsCounts = emptyCategoryRecord<number>(() => 0);
  const hiddenEventsCounts = emptyCategoryRecord<number>(() => 0);

  for (const event of filteredEvents) {
    const metadata = eventMetadata[event.eventID];
    const eventStartDay = metadata.startDate.startOf('day');

    let categoryKey: TimelineCategoryKey;
    if (eventStartDay.isSame(today) && metadata.endDate.isSame(today, 'day')) {
      categoryKey = 'today';
    } else if (eventStartDay.isSame(today) && metadata.endDate.isAfter(today, 'day')) {
      categoryKey = 'ongoing';
    } else if (now.isAfter(metadata.startDate) && now.isBefore(metadata.endDate)) {
      categoryKey = 'ongoing';
    } else if (metadata.startDate.isAfter(now) && metadata.startDate.isBefore(twoWeeksFromNow)) {
      categoryKey = 'upcoming';
    } else if (metadata.startDate.isAfter(now)) {
      categoryKey = 'future';
    } else {
      continue;
    }

    totalEventsCounts[categoryKey]++;

    const isVisible = !filtersApplyToTimeline || isEventVisible(event.eventType, event.eventID);
    if (isVisible) {
      categorizedEvents[categoryKey].push(event);
    } else {
      hiddenEventsCounts[categoryKey]++;
    }
  }

  for (const key of Object.keys(categorizedEvents) as TimelineCategoryKey[]) {
    categorizedEvents[key] = sortEventsByTimingAndPriority(categorizedEvents[key], eventMetadata);
  }

  const hasAnyEvents = Object.values(totalEventsCounts).some((count) => count > 0);

  const groupedByDate: Partial<Record<TimelineCategoryKey, TimelineDateGroup[]>> = {};
  for (const categoryKey of ['upcoming', 'future'] as const) {
    const dateGroups = new Map<string, PogoEvent[]>();

    for (const event of categorizedEvents[categoryKey]) {
      const metadata = eventMetadata[event.eventID];
      const dateKey = metadata.startDate.format('YYYY-MM-DD');
      const existing = dateGroups.get(dateKey);
      if (existing) {
        existing.push(event);
      } else {
        dateGroups.set(dateKey, [event]);
      }
    }

    // categorizedEvents[categoryKey] is already sorted ascending by start
    // time (sortEventsByTimingAndPriority, above) before this loop runs, so
    // the Map's insertion order is already ascending by date — no separate
    // sort of the date keys is needed.
    groupedByDate[categoryKey] = Array.from(dateGroups.entries()).map(
      ([dateKey, dateGroupEvents]) => {
        const firstEventMetadata = eventMetadata[dateGroupEvents[0].eventID];
        return {
          dateKey,
          dayOfWeek: firstEventMetadata.startDate.format('dddd').toUpperCase(),
          dateStr: firstEventMetadata.startDate.format('MMM D, YYYY'),
          events: dateGroupEvents,
        };
      }
    );
  }

  return { categorizedEvents, totalEventsCounts, hiddenEventsCounts, groupedByDate, hasAnyEvents };
}
