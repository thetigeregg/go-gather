import { PogoEvent } from '@go-gather/shared';
import {
  getRaidSubType,
  getRaidSubTypePriority,
  isEventWithSubtype,
} from './calendar-event-subtype.util';

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Raid Battles',
    eventType: 'raid-battles',
    heading: 'Event',
    link: 'https://leekduck.com/events/raid-battles/',
    image: 'image.png',
    start: '2026-07-01T00:00:00.000Z',
    end: '2026-07-01T01:00:00.000Z',
    ...overrides,
  };
}

describe('isEventWithSubtype', () => {
  it('recognizes raid-battles/raid-weekend/raid-day', () => {
    expect(isEventWithSubtype('raid-battles')).toBe(true);
    expect(isEventWithSubtype('raid-weekend')).toBe(true);
    expect(isEventWithSubtype('raid-day')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isEventWithSubtype('community-day')).toBe(false);
  });
});

describe('getRaidSubType', () => {
  it('returns empty for a non-subtype event that is not a raid-hour sub-event', () => {
    expect(
      getRaidSubType(makeEvent({ eventType: 'community-day', name: 'Shadow raid weekend' }))
    ).toBe('');
  });

  it('classifies by name substring, checked in shadow > super mega > primal > mega > raid battles/weekend order', () => {
    expect(getRaidSubType(makeEvent({ name: 'Shadow Raid Weekend' }))).toBe('shadow-raids');
    expect(getRaidSubType(makeEvent({ name: 'Super Mega Raid Weekend' }))).toBe('super-mega-raids');
    expect(getRaidSubType(makeEvent({ name: 'Primal Raid Weekend' }))).toBe('primal-raids');
    expect(getRaidSubType(makeEvent({ name: 'Mega Raid Weekend' }))).toBe('mega-raids');
    expect(getRaidSubType(makeEvent({ name: 'Raid Battles Weekend' }))).toBe('raid-battles');
    expect(getRaidSubType(makeEvent({ name: 'Something Else Entirely' }))).toBe('');
  });

  it('applies to raid-hour sub-events even though their eventType is "event", not a subtype-bearing type', () => {
    expect(
      getRaidSubType(
        makeEvent({
          eventType: 'event',
          name: 'Shadow Mewtwo Raid Hour',
          extraData: { isRaidHourSubEvent: true },
        })
      )
    ).toBe('shadow-raids');
  });
});

describe('getRaidSubTypePriority', () => {
  it('returns 0 for a non-subtype event type', () => {
    expect(getRaidSubTypePriority(makeEvent({ eventType: 'community-day' }))).toBe(0);
  });

  it('ranks super-mega > shadow > raid-battles > mega/primal > unmatched', () => {
    expect(getRaidSubTypePriority(makeEvent({ name: 'Super Mega Raid Weekend' }))).toBe(4);
    expect(getRaidSubTypePriority(makeEvent({ name: 'Shadow Raid Weekend' }))).toBe(3);
    expect(getRaidSubTypePriority(makeEvent({ name: 'Raid Battles Weekend' }))).toBe(2);
    expect(getRaidSubTypePriority(makeEvent({ name: 'Mega Raid Weekend' }))).toBe(1);
    expect(getRaidSubTypePriority(makeEvent({ name: 'Primal Raid Weekend' }))).toBe(1);
    expect(getRaidSubTypePriority(makeEvent({ name: 'Something Else' }))).toBe(0);
  });
});
