import { PogoEvent, PokemonBoss, RaidScheduleEntry } from '@go-gather/shared';
import {
  buildCollapsedScheduleDayGroups,
  buildTimelineScheduleDaySectionsWithTierGroups,
} from './timeline-schedule.util';

function makeBoss(overrides: Partial<PokemonBoss> = {}): PokemonBoss {
  return {
    name: 'Machamp',
    image: 'https://example.com/machamp.png',
    canBeShiny: false,
    ...overrides,
  };
}

function makeScheduleEntry(overrides: Partial<RaidScheduleEntry> = {}): RaidScheduleEntry {
  return {
    date: 'July 22',
    bosses: [],
    raidHours: [],
    ...overrides,
  };
}

function makeEvent(raidSchedule?: RaidScheduleEntry[]): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Raid Weekend',
    eventType: 'raid-weekend',
    heading: 'Event',
    link: 'https://leekduck.com/events/test/',
    image: 'image.png',
    start: '2026-07-22T00:00:00.000',
    end: '2026-07-23T00:00:00.000',
    extraData: raidSchedule ? { raidSchedule } : undefined,
  };
}

describe('buildTimelineScheduleDaySectionsWithTierGroups', () => {
  it('returns undefined when there is no raidSchedule', () => {
    expect(buildTimelineScheduleDaySectionsWithTierGroups(makeEvent())).toBeUndefined();
  });

  it('returns undefined for an empty raidSchedule array', () => {
    expect(buildTimelineScheduleDaySectionsWithTierGroups(makeEvent([]))).toBeUndefined();
  });

  it('returns undefined when the only schedule entries have no bosses or raid hours', () => {
    const event = makeEvent([makeScheduleEntry()]);
    expect(buildTimelineScheduleDaySectionsWithTierGroups(event)).toBeUndefined();
  });

  it('builds a day section from a flat, all-day schedule entry', () => {
    const event = makeEvent([makeScheduleEntry({ bosses: [makeBoss()] })]);
    const result = buildTimelineScheduleDaySectionsWithTierGroups(event);
    expect(result).toHaveLength(1);
    expect(result?.[0].date).toBe('July 22');
    expect(result?.[0].sections).toHaveLength(1);
    expect(result?.[0].sections[0].isAllDay).toBe(true);
    expect(result?.[0].sections[0].labelText).toBe('All Day');
  });

  it('labels a timed schedule entry using its own label', () => {
    const event = makeEvent([
      makeScheduleEntry({
        time: '2:00 p.m. - 5:00 p.m.',
        label: 'Afternoon',
        bosses: [makeBoss()],
      }),
    ]);
    const result = buildTimelineScheduleDaySectionsWithTierGroups(event);
    expect(result?.[0].sections[0].labelText).toBe('Afternoon');
    expect(result?.[0].sections[0].isAllDay).toBe(false);
  });

  it('falls back to "Scheduled" when a timed entry has no label', () => {
    const event = makeEvent([
      makeScheduleEntry({ time: '2:00 p.m. - 5:00 p.m.', bosses: [makeBoss()] }),
    ]);
    const result = buildTimelineScheduleDaySectionsWithTierGroups(event);
    expect(result?.[0].sections[0].labelText).toBe('Scheduled');
  });

  it('appends a section for each raid hour with bosses', () => {
    const event = makeEvent([
      makeScheduleEntry({
        raidHours: [
          {
            time: '6:00 p.m. - 7:00 p.m.',
            label: 'Raid Hour',
            bosses: [makeBoss({ name: 'Tyranitar' })],
          },
          { time: '8:00 p.m. - 9:00 p.m.', bosses: [] },
        ],
      }),
    ]);
    const result = buildTimelineScheduleDaySectionsWithTierGroups(event);
    expect(result?.[0].sections).toHaveLength(1);
    expect(result?.[0].sections[0].labelText).toBe('Raid Hour');
    expect(result?.[0].sections[0].isAllDay).toBe(false);
  });

  it('sorts all-day sections before timed sections', () => {
    const event = makeEvent([
      makeScheduleEntry({
        time: '2:00 p.m.',
        label: 'Afternoon',
        bosses: [makeBoss()],
        raidHours: [
          { time: '6:00 p.m.', label: 'Evening', bosses: [makeBoss({ name: 'Snorlax' })] },
        ],
      }),
    ]);
    const result = buildTimelineScheduleDaySectionsWithTierGroups(event);
    expect(result?.[0].sections.map((s) => s.labelText)).toEqual(['Afternoon', 'Evening']);
  });

  it('sorts timed sections ascending by parsed start time', () => {
    const event = makeEvent([
      makeScheduleEntry({
        raidHours: [
          { time: '8:00 p.m. - 9:00 p.m.', label: 'Late', bosses: [makeBoss({ name: 'Snorlax' })] },
          {
            time: '6:00 p.m. - 7:00 p.m.',
            label: 'Early',
            bosses: [makeBoss({ name: 'Tyranitar' })],
          },
        ],
      }),
    ]);
    const result = buildTimelineScheduleDaySectionsWithTierGroups(event);
    expect(result?.[0].sections.map((s) => s.labelText)).toEqual(['Early', 'Late']);
  });

  it('breaks a same-sortKey tie alphabetically by label', () => {
    const event = makeEvent([
      makeScheduleEntry({
        raidHours: [
          { time: '6:00 p.m.', label: 'Zebra', bosses: [makeBoss({ name: 'Snorlax' })] },
          { time: '6:00 p.m.', label: 'Alpha', bosses: [makeBoss({ name: 'Tyranitar' })] },
        ],
      }),
    ]);
    const result = buildTimelineScheduleDaySectionsWithTierGroups(event);
    expect(result?.[0].sections.map((s) => s.labelText)).toEqual(['Alpha', 'Zebra']);
  });

  it('groups multiple schedule entries sharing the same date into one day section', () => {
    const event = makeEvent([
      makeScheduleEntry({ date: 'July 22', bosses: [makeBoss()] }),
      makeScheduleEntry({
        date: 'July 22',
        time: '6:00 p.m.',
        bosses: [makeBoss({ name: 'Snorlax' })],
      }),
    ]);
    const result = buildTimelineScheduleDaySectionsWithTierGroups(event);
    expect(result).toHaveLength(1);
    expect(result?.[0].sections).toHaveLength(2);
  });

  it('preserves the order dates first appear across multiple days', () => {
    const event = makeEvent([
      makeScheduleEntry({ date: 'July 23', bosses: [makeBoss()] }),
      makeScheduleEntry({ date: 'July 22', bosses: [makeBoss({ name: 'Snorlax' })] }),
    ]);
    const result = buildTimelineScheduleDaySectionsWithTierGroups(event);
    expect(result?.map((d) => d.date)).toEqual(['July 23', 'July 22']);
  });

  it('sorts a malformed/unparseable time string last among timed sections', () => {
    const event = makeEvent([
      makeScheduleEntry({
        raidHours: [
          { time: 'Anytime', label: 'Unparseable', bosses: [makeBoss({ name: 'Snorlax' })] },
          { time: '6:00 p.m.', label: 'Evening', bosses: [makeBoss({ name: 'Tyranitar' })] },
        ],
      }),
    ]);
    const result = buildTimelineScheduleDaySectionsWithTierGroups(event);
    expect(result?.[0].sections.map((s) => s.labelText)).toEqual(['Evening', 'Unparseable']);
  });

  it('normalizes 12:00 a.m. to midnight (sort key 0), sorting before any p.m. time', () => {
    const event = makeEvent([
      makeScheduleEntry({
        raidHours: [
          { time: '6:00 p.m.', label: 'Evening', bosses: [makeBoss({ name: 'Tyranitar' })] },
          { time: '12:00 a.m.', label: 'Midnight', bosses: [makeBoss({ name: 'Snorlax' })] },
        ],
      }),
    ]);
    const result = buildTimelineScheduleDaySectionsWithTierGroups(event);
    expect(result?.[0].sections.map((s) => s.labelText)).toEqual(['Midnight', 'Evening']);
  });

  it('normalizes a blank date to "Scheduled Day"', () => {
    const event = makeEvent([makeScheduleEntry({ date: '   ', bosses: [makeBoss()] })]);
    const result = buildTimelineScheduleDaySectionsWithTierGroups(event);
    expect(result?.[0].date).toBe('Scheduled Day');
  });
});

describe('buildCollapsedScheduleDayGroups', () => {
  it('returns undefined when there is no schedule', () => {
    expect(buildCollapsedScheduleDayGroups(makeEvent())).toBeUndefined();
  });

  it('flattens a single day into one deduped image list', () => {
    const event = makeEvent([
      makeScheduleEntry({
        bosses: [makeBoss({ name: 'Machamp', raidType: 'Tier 3' })],
        raidHours: [
          { time: '6:00 p.m.', bosses: [makeBoss({ name: 'Snorlax', raidType: 'Tier 3' })] },
        ],
      }),
    ]);
    const result = buildCollapsedScheduleDayGroups(event);
    expect(result).toHaveLength(1);
    expect(result?.[0].images.map((i) => i.name)).toEqual(
      expect.arrayContaining(['Machamp', 'Snorlax'])
    );
  });

  it('dedupes a boss appearing in multiple sections, keeping the higher-priority tier label', () => {
    const event = makeEvent([
      makeScheduleEntry({
        bosses: [makeBoss({ name: 'Machamp', image: 'a.png', raidType: 'Tier 3' })],
        raidHours: [
          {
            time: '6:00 p.m.',
            bosses: [makeBoss({ name: 'Machamp', image: 'a.png', raidType: 'Super Mega' })],
          },
        ],
      }),
    ]);
    const result = buildCollapsedScheduleDayGroups(event);
    expect(result?.[0].images).toHaveLength(1);
  });

  it('drops a day whose sections produce no images', () => {
    const event = makeEvent([makeScheduleEntry({ date: 'July 22', bosses: [makeBoss()] })]);
    const result = buildCollapsedScheduleDayGroups(event);
    expect(result?.every((d) => d.images.length > 0)).toBe(true);
  });
});
