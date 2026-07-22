import dayjs, { Dayjs } from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { EventMetadata, PogoEvent } from '@go-gather/shared';
import { isMajorCalendarEventType } from './calendar-event-major.util';
import { EventSlot } from './calendar-grid-slots.util';

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

/** Was calendarSettings.eventBarHeight/eventBarFontSize in the source —
 * display-preference settings resolved dropped entirely for this port. */
export const MULTI_DAY_EVENT_BAR_HEIGHT = 20;
const MULTI_DAY_EVENT_BAR_MARGIN = 1;

interface CompactSlot extends EventSlot {
  compactSlotIndex: number;
}

export interface EventBarPosition {
  left: string;
  width: string;
}

/**
 * Ported from pogo-cal's src/composables/useCalendarDayLayout.ts. A Vue
 * composable captures its arguments in a closure across many returned
 * functions — the natural Angular-side shape for that is a plain class
 * instantiated once per day cell (by calendar-day.component.ts) rather than
 * a set of functions threading the same parameters through every call.
 */
export class CalendarDayLayout {
  private readonly weekCompactSlots: Map<string, CompactSlot>;

  constructor(
    private readonly dayInstance: Dayjs,
    private readonly eventSlots: readonly EventSlot[],
    private readonly eventMetadata: Readonly<Record<string, EventMetadata>>,
    private readonly firstDayIndex: number,
    private readonly barHeight: number = MULTI_DAY_EVENT_BAR_HEIGHT
  ) {
    this.weekCompactSlots = this.buildWeekCompactSlots();
  }

  /** Events rendering as bars in this cell's week, sorted by compact slot
   * index. Major calendar events never render as bars — see calendar-grid-
   * slots.util.ts's note on why they still consume a slot index anyway. */
  getMultiDayEvents(): PogoEvent[] {
    const eventsOnThisDay = this.eventSlots.filter(
      (slot) =>
        slot.shouldRenderOnDay(this.dayInstance) && !isMajorCalendarEventType(slot.event.eventType)
    );

    return eventsOnThisDay
      .map((slot) => ({
        event: slot.event,
        compactIndex: this.weekCompactSlots.get(slot.event.eventID)?.compactSlotIndex ?? 999,
      }))
      .sort((a, b) => a.compactIndex - b.compactIndex)
      .map((item) => item.event);
  }

  /** Pixel height of the multi-day-bar region for this cell's week. */
  getMultiDayEventsHeight(): number {
    const compactSlots = Array.from(this.weekCompactSlots.values());
    if (compactSlots.length === 0) {
      return 0;
    }
    const maxCompactIndex = Math.max(...compactSlots.map((slot) => slot.compactSlotIndex));
    return (maxCompactIndex + 1) * (this.barHeight + MULTI_DAY_EVENT_BAR_MARGIN);
  }

  getEventSlotTop(event: PogoEvent): number {
    const compactSlot = this.weekCompactSlots.get(event.eventID);
    if (!compactSlot) {
      return 0;
    }
    return compactSlot.compactSlotIndex * (this.barHeight + MULTI_DAY_EVENT_BAR_MARGIN);
  }

  getMultiDayEventBarClass(event: PogoEvent, currentDay: Dayjs): string {
    const slotData = this.getEventSlotData(event);
    if (!slotData || !slotData.shouldRenderOnDay(currentDay)) {
      return '';
    }

    const today = currentDay.startOf('day');
    const { weekEnd } = this.getWeekBoundaries(this.dayInstance);
    const weekEndDay = weekEnd.endOf('day');

    const metadata = this.eventMetadata[event.eventID];
    const eventStartDay = metadata.startDate.startOf('day');
    const eventEndDay = metadata.endDate.startOf('day');

    const isStartDay = today.isSame(eventStartDay, 'day');
    const isFirstDayOfWeek = today.day() === this.firstDayIndex;
    const eventEndsThisWeek = eventEndDay.isSameOrBefore(weekEndDay, 'day');

    if (isStartDay && eventEndsThisWeek && today.isSame(eventEndDay, 'day')) {
      return 'single-day-span';
    }

    const classes: string[] = [];
    if (isStartDay) {
      classes.push('start-cap');
    } else if (isFirstDayOfWeek) {
      classes.push('week-continue');
    } else {
      // Unreachable under the current shouldRenderOnDay semantics (a bar
      // only ever renders on its start day or a week's first day) — kept
      // for parity/future-proofing, matching source.
      classes.push('middle-continue');
    }

    if (eventEndsThisWeek) {
      classes.push('end-cap');
    }

    return classes.join(' ');
  }

  getEventPosition(event: PogoEvent, currentDay: Dayjs): EventBarPosition {
    const slotData = this.getEventSlotData(event);
    if (!slotData || !slotData.shouldRenderOnDay(currentDay)) {
      return { left: '0%', width: '100%' };
    }

    const today = currentDay.startOf('day');
    const metadata = this.eventMetadata[event.eventID];
    const eventStart = metadata.startDate;
    const eventEnd = metadata.endDate;

    const eventStartDay = eventStart.startOf('day');
    const { weekEnd } = this.getWeekBoundaries(this.dayInstance);
    const weekEndDay = weekEnd.endOf('day');
    const eventEndDay = eventEnd.startOf('day');
    const actualEndDay = eventEndDay.isBefore(weekEndDay) ? eventEndDay : weekEndDay;

    let leftPercentage: number;
    if (today.isSame(eventStartDay, 'day')) {
      const startHours = eventStart.diff(today, 'hour', true);
      leftPercentage = (startHours / 24) * 100;
    } else {
      leftPercentage = 0;
    }

    let endPositionPercentage: number;
    const spanDays = actualEndDay.diff(today, 'day') + 1;

    if (eventEndDay.isSame(actualEndDay, 'day') && eventEndDay.isSameOrBefore(weekEndDay, 'day')) {
      // Calendar-day diff (not hour-based) to dodge DST arithmetic issues.
      const daysDiff = eventEndDay.diff(today, 'day');
      const hoursIntoFinalDay = eventEnd.hour() + eventEnd.minute() / 60;
      endPositionPercentage = (daysDiff + hoursIntoFinalDay / 24) * 100;
    } else {
      endPositionPercentage = spanDays * 100;
    }

    const widthPercentage = endPositionPercentage - leftPercentage;

    const hasFollowingEvent = this.eventSlots.some((slot) => {
      if (
        slot.slotIndex !== slotData.slotIndex ||
        slot.event.eventID === event.eventID ||
        slot.event.eventType !== event.eventType
      ) {
        return false;
      }

      const otherStart = this.eventMetadata[slot.event.eventID].startDate;
      return (
        otherStart.isSameOrAfter(eventEnd) &&
        otherStart.diff(eventEnd, 'hour') <= 2 &&
        otherStart.isSameOrBefore(weekEndDay)
      );
    });

    const gapAdjustment = hasFollowingEvent ? ' - 1px' : '';

    return {
      left: `${String(leftPercentage)}%`,
      width: `calc(${String(Math.max(widthPercentage, 5))}% + 0px${gapAdjustment})`,
    };
  }

  private getWeekBoundaries(referenceDay: Dayjs): { weekStart: Dayjs; weekEnd: Dayjs } {
    let weekStart = referenceDay.clone();
    while (weekStart.day() !== this.firstDayIndex) {
      weekStart = weekStart.subtract(1, 'day');
    }
    return { weekStart, weekEnd: weekStart.add(6, 'day') };
  }

  private buildWeekCompactSlots(): Map<string, CompactSlot> {
    const { weekStart, weekEnd } = this.getWeekBoundaries(this.dayInstance);

    const eventsRenderingInThisWeek = this.eventSlots.filter((slot) => {
      if (isMajorCalendarEventType(slot.event.eventType)) {
        return false;
      }

      for (let day = weekStart.clone(); day.isSameOrBefore(weekEnd); day = day.add(1, 'day')) {
        if (slot.shouldRenderOnDay(day)) {
          return true;
        }
      }
      return false;
    });

    const eventsBySlotIndex = new Map<number, EventSlot[]>();
    eventsRenderingInThisWeek.forEach((slot) => {
      const list = eventsBySlotIndex.get(slot.slotIndex) ?? [];
      list.push(slot);
      eventsBySlotIndex.set(slot.slotIndex, list);
    });

    const sortedSlotIndexes = Array.from(eventsBySlotIndex.keys()).sort((a, b) => a - b);
    const compactSlots = new Map<string, CompactSlot>();

    sortedSlotIndexes.forEach((slotIndex, compactIndex) => {
      const eventsInSlot = eventsBySlotIndex.get(slotIndex) ?? [];
      eventsInSlot.forEach((slot) => {
        compactSlots.set(slot.event.eventID, { ...slot, compactSlotIndex: compactIndex });
      });
    });

    return compactSlots;
  }

  private getEventSlotData(event: PogoEvent): EventSlot | undefined {
    return this.eventSlots.find((slot) => slot.event.eventID === event.eventID);
  }
}
