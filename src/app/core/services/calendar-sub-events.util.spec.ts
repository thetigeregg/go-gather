import { vi } from 'vitest';
import type { PogoEvent, RaidScheduleEntry, SpotlightScheduleEntry } from '@go-gather/shared';
import {
  generateEventRaidHourSubEvents,
  generateEventSpotlightSubEvents,
} from './calendar-sub-events.util';

function makeParentEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'raid-weekend-january-2026',
    name: 'Raid Weekend: January 2026',
    eventType: 'event',
    heading: 'Event',
    link: 'https://leekduck.com/events/raid-weekend-january-2026/',
    image: 'https://example.com/raid-weekend.png',
    start: '2026-01-10T00:00:00.000Z',
    end: '2026-01-12T23:59:59.000Z',
    ...overrides,
  };
}

describe('generateEventRaidHourSubEvents', () => {
  it('returns no sub-events for a non-"event" eventType', () => {
    const raidSchedule: RaidScheduleEntry[] = [
      {
        date: 'Monday, January 12',
        bosses: [],
        raidHours: [
          {
            time: '6:00 p.m. to 7:00 p.m. local time',
            bosses: [{ name: 'Lugia', image: 'lugia.png', canBeShiny: true }],
          },
        ],
      },
    ];

    const result = generateEventRaidHourSubEvents(
      makeParentEvent({ eventType: 'raid-weekend', extraData: { raidSchedule } })
    );

    expect(result).toEqual([]);
  });

  it('returns no sub-events when there is no raid schedule', () => {
    expect(generateEventRaidHourSubEvents(makeParentEvent())).toEqual([]);
  });

  it('resolves a bare day-of-week schedule date to the matching day within the parent event range', () => {
    const raidSchedule: RaidScheduleEntry[] = [
      {
        date: 'Monday',
        bosses: [],
        raidHours: [
          {
            time: '6:00 p.m. to 7:00 p.m. local time',
            bosses: [{ name: 'Lugia', image: 'lugia.png', canBeShiny: true }],
          },
        ],
      },
    ];

    const result = generateEventRaidHourSubEvents(makeParentEvent({ extraData: { raidSchedule } }));

    expect(result).toHaveLength(1);
    // 2026-01-12 is the Monday within the Jan 10-12 parent event range.
    expect(result[0].start.startsWith('2026-01-12T18:00:00')).toBe(true);
    expect(result[0].end.startsWith('2026-01-12T19:00:00')).toBe(true);
  });

  it('generates one sub-event per raid hour, named after the boss list', () => {
    const raidSchedule: RaidScheduleEntry[] = [
      {
        date: 'Monday, January 12',
        bosses: [],
        raidHours: [
          {
            time: '6:00 p.m. to 7:00 p.m. local time',
            bosses: [{ name: 'Lugia', image: 'lugia.png', canBeShiny: true }],
          },
          {
            time: '7:00 p.m. to 8:00 p.m. local time',
            bosses: [
              { name: 'Lugia', image: 'lugia.png', canBeShiny: true },
              { name: 'Ho-Oh', image: 'ho-oh.png', canBeShiny: true },
            ],
          },
        ],
      },
    ];

    const result = generateEventRaidHourSubEvents(makeParentEvent({ extraData: { raidSchedule } }));

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Lugia Raid Hour');
    expect(result[1].name).toBe('Lugia and Ho-Oh Raid Hour');
    expect(result[0].extraData?.isRaidHourSubEvent).toBe(true);
    expect(result[0].extraData?.parentEventId).toBe('raid-weekend-january-2026');
  });

  it('skips a raid hour entry with no bosses', () => {
    const raidSchedule: RaidScheduleEntry[] = [
      {
        date: 'Monday, January 12',
        bosses: [],
        raidHours: [{ time: '6:00 p.m. to 7:00 p.m. local time', bosses: [] }],
      },
    ];

    expect(
      generateEventRaidHourSubEvents(makeParentEvent({ extraData: { raidSchedule } }))
    ).toEqual([]);
  });

  it('resolves a bare month+day schedule date (year inferred from the parent event)', () => {
    const raidSchedule: RaidScheduleEntry[] = [
      {
        date: 'January 12',
        bosses: [],
        raidHours: [
          {
            time: '6:00 p.m. to 7:00 p.m. local time',
            bosses: [{ name: 'Lugia', image: 'lugia.png', canBeShiny: true }],
          },
        ],
      },
    ];

    const result = generateEventRaidHourSubEvents(makeParentEvent({ extraData: { raidSchedule } }));

    expect(result).toHaveLength(1);
    expect(result[0].start.startsWith('2026-01-12T18:00:00')).toBe(true);
  });

  it('rolls a month+day schedule date over to the next year when it falls before the parent event starts', () => {
    // Parent event spans a year boundary (Dec 30 2026 -> Jan 2 2027); a
    // schedule date of "January 1" must resolve to 2027, not 2026 (which
    // would fall before the parent start).
    const raidSchedule: RaidScheduleEntry[] = [
      {
        date: 'January 1',
        bosses: [],
        raidHours: [
          {
            time: '6:00 p.m. to 7:00 p.m. local time',
            bosses: [{ name: 'Lugia', image: 'lugia.png', canBeShiny: true }],
          },
        ],
      },
    ];

    const result = generateEventRaidHourSubEvents(
      makeParentEvent({
        start: '2026-12-30T00:00:00.000Z',
        end: '2027-01-02T23:59:59.000Z',
        extraData: { raidSchedule },
      })
    );

    expect(result).toHaveLength(1);
    expect(result[0].start.startsWith('2027-01-01T18:00:00')).toBe(true);
  });

  it('skips a schedule entry whose date matches none of the known formats', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const raidSchedule: RaidScheduleEntry[] = [
      {
        date: 'TBD',
        bosses: [],
        raidHours: [
          {
            time: '6:00 p.m. to 7:00 p.m. local time',
            bosses: [{ name: 'Lugia', image: 'lugia.png', canBeShiny: true }],
          },
        ],
      },
    ];

    const result = generateEventRaidHourSubEvents(makeParentEvent({ extraData: { raidSchedule } }));

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('names a raid hour with 3-6 bosses as a comma-separated list, and 7+ bosses generically', () => {
    const boss = (name: string) => ({ name, image: `${name}.png`, canBeShiny: true });
    const raidSchedule: RaidScheduleEntry[] = [
      {
        date: 'Monday, January 12',
        bosses: [],
        raidHours: [
          {
            time: '6:00 p.m. to 7:00 p.m. local time',
            bosses: [boss('A'), boss('B'), boss('C')],
          },
          {
            time: '7:00 p.m. to 8:00 p.m. local time',
            bosses: [boss('A'), boss('B'), boss('C'), boss('D'), boss('E'), boss('F'), boss('G')],
          },
        ],
      },
    ];

    const result = generateEventRaidHourSubEvents(makeParentEvent({ extraData: { raidSchedule } }));

    expect(result[0].name).toBe('A, B, and C Raid Hour');
    expect(result[1].name).toBe('7 Bosses Raid Hour');
  });

  it('defaults to 6-7pm when a raid hour time string is empty or unparseable', () => {
    const raidSchedule: RaidScheduleEntry[] = [
      {
        date: 'Monday, January 12',
        bosses: [],
        raidHours: [
          { time: '', bosses: [{ name: 'Lugia', image: 'lugia.png', canBeShiny: true }] },
          {
            time: 'sometime in the evening',
            bosses: [{ name: 'Lugia', image: 'lugia.png', canBeShiny: true }],
          },
        ],
      },
    ];

    const result = generateEventRaidHourSubEvents(makeParentEvent({ extraData: { raidSchedule } }));

    expect(result[0].start.startsWith('2026-01-12T18:00:00')).toBe(true);
    expect(result[0].end.startsWith('2026-01-12T19:00:00')).toBe(true);
    expect(result[1].start.startsWith('2026-01-12T18:00:00')).toBe(true);
  });

  it('converts 12 a.m./12 p.m. hour boundaries correctly (not treated as +12/-12)', () => {
    const raidSchedule: RaidScheduleEntry[] = [
      {
        date: 'Monday, January 12',
        bosses: [],
        raidHours: [
          {
            time: '12:00 a.m. to 1:00 a.m. local time',
            bosses: [{ name: 'Lugia', image: 'lugia.png', canBeShiny: true }],
          },
          {
            time: '11:00 p.m. to 12:00 a.m. local time',
            bosses: [{ name: 'Lugia', image: 'lugia.png', canBeShiny: true }],
          },
        ],
      },
    ];

    const result = generateEventRaidHourSubEvents(makeParentEvent({ extraData: { raidSchedule } }));

    expect(result[0].start.startsWith('2026-01-12T00:00:00')).toBe(true);
    expect(result[1].end.startsWith('2026-01-12T00:00:00')).toBe(true);
  });

  it('skips a schedule entry with an empty raidHours list, but still processes sibling entries', () => {
    const raidSchedule: RaidScheduleEntry[] = [
      { date: 'Monday, January 12', bosses: [], raidHours: [] },
      {
        date: 'Tuesday, January 13',
        bosses: [],
        raidHours: [
          {
            time: '6:00 p.m. to 7:00 p.m. local time',
            bosses: [{ name: 'Lugia', image: 'lugia.png', canBeShiny: true }],
          },
        ],
      },
    ];

    const result = generateEventRaidHourSubEvents(makeParentEvent({ extraData: { raidSchedule } }));

    expect(result).toHaveLength(1);
    expect(result[0].start.startsWith('2026-01-13T18:00:00')).toBe(true);
  });

  it('rolls a full-date ("Weekday, Month Day") schedule date over to the next year when it falls before the parent event starts', () => {
    const raidSchedule: RaidScheduleEntry[] = [
      {
        date: 'Friday, January 1',
        bosses: [],
        raidHours: [
          {
            time: '6:00 p.m. to 7:00 p.m. local time',
            bosses: [{ name: 'Lugia', image: 'lugia.png', canBeShiny: true }],
          },
        ],
      },
    ];

    const result = generateEventRaidHourSubEvents(
      makeParentEvent({
        start: '2026-12-30T00:00:00.000Z',
        end: '2027-01-02T23:59:59.000Z',
        extraData: { raidSchedule },
      })
    );

    expect(result).toHaveLength(1);
    expect(result[0].start.startsWith('2027-01-01T18:00:00')).toBe(true);
  });
});

describe('generateEventSpotlightSubEvents', () => {
  it('returns no sub-events for a non-"event" eventType', () => {
    const spotlightSchedule: SpotlightScheduleEntry[] = [
      {
        date: 'Tuesday, January 13',
        time: '6:00 p.m. to 7:00 p.m. local time',
        pokemon: { name: 'Eevee', image: 'eevee.png', canBeShiny: true },
      },
    ];

    const result = generateEventSpotlightSubEvents(
      makeParentEvent({ eventType: 'pokemon-spotlight-hour', extraData: { spotlightSchedule } })
    );

    expect(result).toEqual([]);
  });

  it('generates one sub-event per spotlight schedule entry, named after the pokemon', () => {
    const spotlightSchedule: SpotlightScheduleEntry[] = [
      {
        date: 'Tuesday, January 13',
        time: '6:00 p.m. to 7:00 p.m. local time',
        pokemon: { name: 'Eevee', image: 'eevee.png', canBeShiny: true },
      },
    ];

    const result = generateEventSpotlightSubEvents(
      makeParentEvent({ extraData: { spotlightSchedule } })
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Eevee Spotlight Hour');
    expect(result[0].extraData?.isSpotlightSubEvent).toBe(true);
    expect(result[0].extraData?.parentEventId).toBe('raid-weekend-january-2026');
  });

  it('returns no sub-events when there is no spotlight schedule', () => {
    expect(generateEventSpotlightSubEvents(makeParentEvent())).toEqual([]);
  });

  it('skips a spotlight schedule entry with no pokemon name', () => {
    const spotlightSchedule: SpotlightScheduleEntry[] = [
      {
        date: 'Tuesday, January 13',
        time: '6:00 p.m. to 7:00 p.m. local time',
        pokemon: { name: '', image: 'eevee.png', canBeShiny: true },
      },
    ];

    expect(
      generateEventSpotlightSubEvents(makeParentEvent({ extraData: { spotlightSchedule } }))
    ).toEqual([]);
  });

  it('skips a spotlight schedule entry whose date matches none of the known formats', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const spotlightSchedule: SpotlightScheduleEntry[] = [
      {
        date: 'TBD',
        time: '6:00 p.m. to 7:00 p.m. local time',
        pokemon: { name: 'Eevee', image: 'eevee.png', canBeShiny: true },
      },
    ];

    const result = generateEventSpotlightSubEvents(
      makeParentEvent({ extraData: { spotlightSchedule } })
    );

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
