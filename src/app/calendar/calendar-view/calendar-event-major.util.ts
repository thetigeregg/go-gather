import { PogoEvent } from '@go-gather/shared';

/** Ported from pogo-cal's src/utils/eventMajor.ts. */
export const MAJOR_CALENDAR_EVENT_TYPES = [
  'pokemon-go-fest',
  'pokemon-go-tour',
  'wild-area',
] as const;
export type MajorCalendarEventType = (typeof MAJOR_CALENDAR_EVENT_TYPES)[number];
export type MajorCalendarEventVariant = 'global' | 'location-specific';

const MAJOR_CALENDAR_EVENT_TYPE_SET: readonly string[] = MAJOR_CALENDAR_EVENT_TYPES;

export function isMajorCalendarEventType(eventType: string): eventType is MajorCalendarEventType {
  return MAJOR_CALENDAR_EVENT_TYPE_SET.includes(eventType);
}

function getMajorEventSearchText(event: PogoEvent): string {
  return [event.eventID, event.name, event.link].join(' ').toLowerCase();
}

/**
 * Global-vs-location-specific classification is a crude substring heuristic
 * in the source, not a structured field — ported verbatim, including its
 * known imprecision (e.g. a location-specific event whose link happens to
 * contain "global" would misclassify). Not a bug to silently fix here.
 */
export function getMajorCalendarEventVariant(event: PogoEvent): MajorCalendarEventVariant {
  if (!isMajorCalendarEventType(event.eventType)) {
    return 'location-specific';
  }

  return getMajorEventSearchText(event).includes('global') ? 'global' : 'location-specific';
}
