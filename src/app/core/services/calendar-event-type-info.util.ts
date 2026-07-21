import { EVENT_TYPES, EventTypeInfo, EventTypeInfoWithoutColor } from '@go-gather/shared';

/** Color shown for an event type the app doesn't recognize yet (see getEventTypeInfo() below). */
const FALLBACK_EVENT_TYPE_COLOR = '#666666';

/**
 * EVENT_TYPES is declared as Record<string, EventTypeInfo>, which tells
 * TypeScript indexing it always succeeds — untrue for the whole point of
 * this lookup (an unrecognized eventType key). Re-typed here as a partial
 * map so both functions below get honest `| undefined` results instead of
 * a false guarantee.
 */
const EVENT_TYPES_LOOKUP: Partial<Record<string, EventTypeInfo>> = EVENT_TYPES;

/**
 * Ported from pogo-cal's src/utils/eventTypes.ts. The feed can introduce new
 * event types before this app knows about them — falls back to a generated
 * name/priority/category rather than erroring or dropping the event. See
 * DOMAIN-MODEL.md's note on this being a preserve-exactly requirement.
 */
export function getEventTypeInfo(eventType: string): EventTypeInfoWithoutColor {
  const info = EVENT_TYPES_LOOKUP[eventType];
  if (info) {
    return { name: info.name, priority: info.priority, category: info.category };
  }

  return {
    name: eventType.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    priority: 5,
    category: 'events-and-misc',
  };
}

/**
 * Ported color-lookup half of pogo-cal's design (there, split out via a
 * separate custom-event-type-colors store — resolved dropped for this port,
 * see OPEN-DECISIONS.md's display-preference-settings decision). Falls back
 * to a neutral color for the same unrecognized-type case getEventTypeInfo()
 * handles.
 */
export function getEventTypeColor(eventType: string): string {
  return EVENT_TYPES_LOOKUP[eventType]?.color ?? FALLBACK_EVENT_TYPE_COLOR;
}
