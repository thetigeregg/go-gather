import { Dayjs } from 'dayjs';
import { EventMetadata, PogoEvent } from '@go-gather/shared';
import { getEventTypeInfo } from '../../core/services/calendar-event-type-info.util';
import { CalendarDayCell } from './calendar-grid.util';
import { getRaidSubType, getRaidSubTypePriority } from './calendar-event-subtype.util';

/**
 * Ported from pogo-cal's src/composables/useCalendarGridSlots.ts (multi-day
 * event "slot packing") and the sortEventsByPriority() half of
 * src/utils/eventSort.ts (sortEventsByTimingAndPriority() is timeline-only,
 * Phase 4). Unlike the source, `eventMetadata` here is guaranteed present for
 * every event by construction (CalendarEventsService computes it
 * synchronously alongside the event list, not via a possibly-stale reactive
 * cache) — so this port has no `?? parseEventDate(...)` fallback chains.
 *
 * "Group similar events" is resolved deferred, so the grouped-vs-individual
 * branches in shouldShareSlot()/the sort comparator are dropped entirely —
 * no event will ever have _isGrouped set.
 */
export interface EventSlot {
  event: PogoEvent;
  slotIndex: number;
  startDay: Dayjs;
  endDay: Dayjs;
  shouldRenderOnDay: (day: Dayjs) => boolean;
}

export function sortEventsByPriority(events: readonly PogoEvent[]): PogoEvent[] {
  return [...events].sort(
    (a, b) => getEventTypeInfo(b.eventType).priority - getEventTypeInfo(a.eventType).priority
  );
}

/**
 * Two events can share a lane if they're the same event type — and, for
 * individual (ungrouped) raid-battles events specifically, only if their
 * raid sub-type also matches (shadow/mega/regular raids never stack).
 */
export function shouldShareSlot(eventA: PogoEvent, eventB: PogoEvent): boolean {
  if (eventA.eventType !== eventB.eventType) {
    return false;
  }
  if (eventA.eventType === 'raid-battles') {
    return getRaidSubType(eventA) === getRaidSubType(eventB);
  }
  return true;
}

export function hasConflictInSlot(
  event: PogoEvent,
  slotIndex: number,
  existingSlots: readonly EventSlot[],
  eventMetadata: Readonly<Record<string, EventMetadata>>
): boolean {
  const eventMeta = eventMetadata[event.eventID];
  const slotsInThisIndex = existingSlots.filter((slot) => slot.slotIndex === slotIndex);

  return slotsInThisIndex.some((slot) => {
    const slotMeta = eventMetadata[slot.event.eventID];
    const hasTimeOverlap =
      eventMeta.startDate.isBefore(slotMeta.endDate) &&
      eventMeta.endDate.isAfter(slotMeta.startDate);

    if (shouldShareSlot(event, slot.event) && !hasTimeOverlap) {
      return false;
    }
    return hasTimeOverlap;
  });
}

function findAvailableSlotForEventType(
  event: PogoEvent,
  existingSlots: readonly EventSlot[],
  eventMetadata: Readonly<Record<string, EventMetadata>>
): number {
  const slotsByIndex = new Map<number, EventSlot[]>();
  existingSlots.forEach((slot) => {
    const list = slotsByIndex.get(slot.slotIndex) ?? [];
    list.push(slot);
    slotsByIndex.set(slot.slotIndex, list);
  });

  for (const [slotIndex, slotsInIndex] of slotsByIndex) {
    const allCompatible = slotsInIndex.every((slot) => shouldShareSlot(event, slot.event));
    if (allCompatible && !hasConflictInSlot(event, slotIndex, existingSlots, eventMetadata)) {
      return slotIndex;
    }
  }

  return -1;
}

function findNextAvailableSlot(
  event: PogoEvent,
  existingSlots: readonly EventSlot[],
  eventMetadata: Readonly<Record<string, EventMetadata>>
): number {
  for (let slotIndex = 0; ; slotIndex++) {
    if (!hasConflictInSlot(event, slotIndex, existingSlots, eventMetadata)) {
      const slotsInThisIndex = existingSlots.filter((slot) => slot.slotIndex === slotIndex);
      const hasIncompatibleTypes = slotsInThisIndex.some(
        (slot) => !shouldShareSlot(event, slot.event)
      );
      if (!hasIncompatibleTypes) {
        return slotIndex;
      }
    }
  }
}

function filterMultiDayEventsForCalendar(
  events: readonly PogoEvent[],
  eventMetadata: Readonly<Record<string, EventMetadata>>,
  calendarDays: readonly CalendarDayCell[],
  isEventVisible: (eventType: string, eventId: string) => boolean
): PogoEvent[] {
  if (calendarDays.length === 0) {
    return [];
  }

  const calendarStart = calendarDays[0].dayInstance.startOf('day');
  const calendarEnd = calendarDays[calendarDays.length - 1].dayInstance.startOf('day');

  return events.filter((event) => {
    const metadata = eventMetadata[event.eventID];
    if (metadata.isSingleDayEvent || !isEventVisible(event.eventType, event.eventID)) {
      return false;
    }

    const eventStart = metadata.startDate.startOf('day');
    const eventEnd = metadata.endDate.startOf('day');

    // Not a simplified [start,end] range overlap — ported verbatim as the
    // source's exact three-clause boolean. Note this only reliably excludes
    // PAST events (ended before the grid starts); an event far in the
    // future still passes clause 1 (`eventEnd.isAfter(calendarStart)` is
    // trivially true for any future date) and gets a slot assigned, it just
    // never actually renders since shouldRenderOnDay() never matches a day
    // in this grid. Confirmed against the live source, not a simplification.
    return (
      eventEnd.isAfter(calendarStart) ||
      (eventEnd.isSame(calendarStart) && eventStart.isBefore(calendarEnd)) ||
      eventStart.isSame(calendarEnd)
    );
  });
}

function sortForPacking(
  events: readonly PogoEvent[],
  eventMetadata: Readonly<Record<string, EventMetadata>>
): PogoEvent[] {
  return [...events].sort((a, b) => {
    const aPriority = getEventTypeInfo(a.eventType).priority;
    const bPriority = getEventTypeInfo(b.eventType).priority;
    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }

    if (a.eventType === 'raid-battles' && b.eventType === 'raid-battles') {
      const aSubPriority = getRaidSubTypePriority(a);
      const bSubPriority = getRaidSubTypePriority(b);
      if (aSubPriority !== bSubPriority) {
        return bSubPriority - aSubPriority;
      }
    }

    const aStart = eventMetadata[a.eventID].startDate;
    const bStart = eventMetadata[b.eventID].startDate;
    if (!aStart.isSame(bStart)) {
      return aStart.isBefore(bStart) ? -1 : 1;
    }

    return 0;
  });
}

/**
 * Builds the global (whole-visible-grid) slot assignments for every
 * multi-day event. Major calendar events (GO Fest/GO Tour/Wild Area)
 * deliberately still go through this — they consume lane indices, shifting
 * where other events land — even though calendar-day-layout.util.ts later
 * excludes them from actually rendering as bars.
 */
export function buildEventSlots(
  events: readonly PogoEvent[],
  eventMetadata: Readonly<Record<string, EventMetadata>>,
  calendarDays: readonly CalendarDayCell[],
  isEventVisible: (eventType: string, eventId: string) => boolean,
  firstDayIndex: number
): EventSlot[] {
  const multiDayEvents = filterMultiDayEventsForCalendar(
    events,
    eventMetadata,
    calendarDays,
    isEventVisible
  );
  if (multiDayEvents.length === 0) {
    return [];
  }

  const sortedEvents = sortForPacking(multiDayEvents, eventMetadata);
  const slots: EventSlot[] = [];

  for (const event of sortedEvents) {
    const metadata = eventMetadata[event.eventID];
    const eventStart = metadata.startDate.startOf('day');
    const eventEnd = metadata.endDate.startOf('day');

    let slotIndex = 0;
    if (slots.length > 0) {
      const sameTypeSlot = findAvailableSlotForEventType(event, slots, eventMetadata);
      slotIndex =
        sameTypeSlot !== -1 ? sameTypeSlot : findNextAvailableSlot(event, slots, eventMetadata);
    }

    slots.push({
      event,
      slotIndex,
      startDay: eventStart,
      endDay: eventEnd,
      shouldRenderOnDay: (day: Dayjs) => {
        const dayStart = day.startOf('day');
        const isStartDay = dayStart.isSame(eventStart, 'day');
        const isFirstDayOfWeek = dayStart.day() === firstDayIndex;
        const eventIsOngoing =
          dayStart.isAfter(eventStart) && dayStart.isBefore(eventEnd.add(1, 'day'));
        return isStartDay || (isFirstDayOfWeek && eventIsOngoing);
      },
    });
  }

  return slots;
}
