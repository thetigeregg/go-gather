import { PogoEvent } from '@go-gather/shared';

/**
 * Ported from pogo-cal's src/utils/eventSubtype.ts (getRaidSubType()/
 * getRaidSubTypePriority() only — hasEventExtras() belongs to event-detail
 * rendering, Phase 5). Needed for correct multi-day slot-sharing between
 * raid-battles events; unrelated to the deferred raid-boss-art decision.
 */
export const EVENTS_WITH_SUBTYPE = ['raid-battles', 'raid-weekend', 'raid-day'] as const;
export type EventWithSubtype = (typeof EVENTS_WITH_SUBTYPE)[number];

const EVENTS_WITH_SUBTYPE_SET: readonly string[] = EVENTS_WITH_SUBTYPE;

export function isEventWithSubtype(eventType: string): boolean {
  return EVENTS_WITH_SUBTYPE_SET.includes(eventType);
}

export function getRaidSubType(event: PogoEvent): string {
  const isRaidHourSubEvent = event.extraData?.isRaidHourSubEvent === true;

  if (!isEventWithSubtype(event.eventType) && !isRaidHourSubEvent) {
    return '';
  }

  const eventName = event.name.toLowerCase();

  if (eventName.includes('shadow')) {
    return 'shadow-raids';
  } else if (eventName.includes('super mega')) {
    return 'super-mega-raids';
  } else if (eventName.includes('primal')) {
    return 'primal-raids';
  } else if (eventName.includes('mega')) {
    return 'mega-raids';
  } else if (eventName.includes('raid battles') || eventName.includes('raid weekend')) {
    return 'raid-battles';
  }
  return '';
}

/** Higher number = higher priority for raid sub-type sorting. */
export function getRaidSubTypePriority(event: PogoEvent): number {
  if (!isEventWithSubtype(event.eventType)) {
    return 0;
  }

  switch (getRaidSubType(event)) {
    case 'super-mega-raids':
      return 4;
    case 'shadow-raids':
      return 3;
    case 'raid-battles':
      return 2;
    case 'mega-raids':
    case 'primal-raids':
      return 1;
    default:
      return 0;
  }
}
