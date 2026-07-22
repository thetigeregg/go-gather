import { ComponentFixture, TestBed } from '@angular/core/testing';
import dayjs from 'dayjs';
import { EventMetadata, EventTypeInfoWithoutColor, PogoEvent } from '@go-gather/shared';
import { PokemonEventImagesComponent } from './pokemon-event-images.component';
import { PokemonImageComponent } from './pokemon-image.component';
import { RaidTierGroupImagesComponent } from './raid-tier-group-images.component';
import { TimelineCollapsedScheduleComponent } from './timeline-collapsed-schedule.component';
import { TimelineEventComponent } from './timeline-event.component';
import { TimelineRaidScheduleComponent } from './timeline-raid-schedule.component';

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Test &amp; Event',
    eventType: 'raid-day',
    heading: 'Event',
    link: 'https://leekduck.com/events/test/',
    image: 'image.png',
    start: '2026-07-08T10:00:00.000',
    end: '2026-07-08T20:00:00.000',
    ...overrides,
  };
}

function makeMetadata(overrides: Partial<EventMetadata> = {}): EventMetadata {
  const typeInfo: EventTypeInfoWithoutColor = {
    name: 'Test',
    priority: 50,
    category: 'events-and-misc',
  };
  return {
    startDate: dayjs('2026-07-08T10:00:00.000'),
    endDate: dayjs('2026-07-08T20:00:00.000'),
    isMultiDayEvent: false,
    isSingleDayEvent: true,
    isPastEvent: false,
    isFutureEvent: false,
    typeInfo,
    color: '#123456',
    formattedStartTime: '10am',
    displayName: 'Test Event',
    ...overrides,
  };
}

describe('TimelineEventComponent', () => {
  let fixture: ComponentFixture<TimelineEventComponent>;
  let component: TimelineEventComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    TestBed.overrideComponent(TimelineEventComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(PokemonEventImagesComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(TimelineCollapsedScheduleComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(TimelineRaidScheduleComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(RaidTierGroupImagesComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(PokemonImageComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(TimelineEventComponent);
    component = fixture.componentInstance;
    component.event = makeEvent();
    component.metadata = makeMetadata();
    component.isActive = false;
    component.now = dayjs('2026-07-08T12:00:00.000');
  });

  it('formats the display name by decoding HTML entities', () => {
    expect(component.displayName).toBe('Test & Event');
  });

  it('computes timeDisplayParts from the event metadata and now', () => {
    expect(component.timeDisplayParts.startTime).toBeDefined();
    expect(component.timeDisplayParts.focusEnd).toBe(true); // live event: end time focused
  });

  it('computes statusInfo from the event metadata and now', () => {
    expect(component.statusInfo?.type).toBe('urgent'); // ends today, live
  });

  it('returns extras when the event has bonus data, null otherwise', () => {
    expect(component.extras).toBeNull();

    component.event = makeEvent({
      eventType: 'pokemon-spotlight-hour',
      extraData: { spotlight: { name: 'Bulbasaur', canBeShiny: true, bonus: '2x Catch XP' } },
    });
    expect(component.extras?.spotlightBonus).toBe('2x Catch XP');
  });

  it('reports isMajorTimelineEvent/majorTimelineVariant for a major calendar event type', () => {
    component.event = makeEvent({
      eventType: 'pokemon-go-fest',
      name: 'GO Fest: Global',
      link: 'https://leekduck.com/events/gofest/',
    });

    expect(component.isMajorTimelineEvent).toBe(true);
    expect(component.majorTimelineVariant).toBe('global');
  });

  it('reports isMajorTimelineEvent false for a non-major event type', () => {
    expect(component.isMajorTimelineEvent).toBe(false);
    expect(component.majorTimelineVariant).toBe('location-specific');
  });

  it('emits activate with the eventID on header click', () => {
    const emitSpy = vi.spyOn(component.activate, 'emit');

    component.onClick();

    expect(emitSpy).toHaveBeenCalledWith('event-1');
  });

  describe('pokemon sprite/schedule chain', () => {
    it('pokemonCount reflects the resolved Pokemon images for the event', () => {
      component.event = makeEvent({
        eventType: 'raid-battles',
        extraData: {
          raidbattles: { bosses: [{ name: 'Machamp', image: 'machamp.png', canBeShiny: false }] },
        },
      });
      expect(component.pokemonCount).toBe(1);
    });

    it('pokemonCount is 0 for an event with no resolvable Pokemon', () => {
      expect(component.pokemonCount).toBe(0);
    });

    it('collapsedScheduleDayGroups is undefined while active', () => {
      component.isActive = true;
      component.event = makeEvent({
        extraData: {
          raidSchedule: [
            {
              date: 'July 8',
              bosses: [{ name: 'Machamp', image: 'x.png', canBeShiny: false }],
              raidHours: [],
            },
          ],
        },
      });
      expect(component.collapsedScheduleDayGroups).toBeUndefined();
    });

    it('collapsedScheduleDayGroups builds from the raid schedule while inactive', () => {
      component.isActive = false;
      component.event = makeEvent({
        extraData: {
          raidSchedule: [
            {
              date: 'July 8',
              bosses: [{ name: 'Machamp', image: 'x.png', canBeShiny: false }],
              raidHours: [],
            },
          ],
        },
      });
      expect(component.collapsedScheduleDayGroups).toHaveLength(1);
    });

    it('hasPokemon is true when pokemonCount is positive', () => {
      component.event = makeEvent({
        eventType: 'raid-battles',
        extraData: {
          raidbattles: { bosses: [{ name: 'Machamp', image: 'machamp.png', canBeShiny: false }] },
        },
      });
      expect(component.hasPokemon).toBe(true);
    });

    it('hasPokemon is true when there are collapsed schedule day groups, even with pokemonCount 0', () => {
      component.isActive = false;
      component.event = makeEvent({
        eventType: 'raid-weekend',
        extraData: {
          raidSchedule: [
            {
              date: 'July 8',
              bosses: [{ name: 'Machamp', image: 'x.png', canBeShiny: false }],
              raidHours: [],
            },
          ],
        },
      });
      expect(component.hasPokemon).toBe(true);
    });

    it('hasPokemon is false for an event with neither', () => {
      expect(component.hasPokemon).toBe(false);
    });

    it('spriteEffect reflects the event-level sprite effect', () => {
      component.event = makeEvent({ eventType: 'max-mondays' });
      expect(component.spriteEffect).toBe('dynamax');
    });

    it('defaultTierGroupsWithImages builds from metadata.raidBossTierGroups', () => {
      component.metadata = makeMetadata({
        raidBossTierGroups: [
          { label: 'Tier 3', bosses: [{ name: 'Machamp', image: 'x.png', canBeShiny: false }] },
        ],
      });
      expect(component.defaultTierGroupsWithImages).toEqual([
        {
          label: 'Tier 3',
          showLabel: true,
          images: [
            {
              name: 'Machamp',
              imageUrl: 'x.png',
              fallbackImageUrl: 'x.png',
              shieldCount: undefined,
            },
          ],
        },
      ]);
    });

    it('defaultTierGroupsWithImages is null when metadata has no raidBossTierGroups', () => {
      expect(component.defaultTierGroupsWithImages).toBeNull();
    });

    it('timelineScheduleDaySectionsWithTierGroups builds from the event raid schedule', () => {
      component.event = makeEvent({
        extraData: {
          raidSchedule: [
            {
              date: 'July 8',
              bosses: [{ name: 'Machamp', image: 'x.png', canBeShiny: false }],
              raidHours: [],
            },
          ],
        },
      });
      expect(component.timelineScheduleDaySectionsWithTierGroups).toHaveLength(1);
    });

    it('hasExpandedRaidSections is true when there are day sections', () => {
      component.event = makeEvent({
        extraData: {
          raidSchedule: [
            {
              date: 'July 8',
              bosses: [{ name: 'Machamp', image: 'x.png', canBeShiny: false }],
              raidHours: [],
            },
          ],
        },
      });
      expect(component.hasExpandedRaidSections).toBe(true);
    });

    it('hasExpandedRaidSections is true when there are default tier groups, with no day sections', () => {
      component.metadata = makeMetadata({
        raidBossTierGroups: [
          { label: 'Tier 3', bosses: [{ name: 'Machamp', image: 'x.png', canBeShiny: false }] },
        ],
      });
      expect(component.hasExpandedRaidSections).toBe(true);
    });

    it('hasExpandedRaidSections is false for neither', () => {
      expect(component.hasExpandedRaidSections).toBe(false);
    });

    it('showCollapsedScheduleDays is true only while inactive with collapsed day groups', () => {
      component.isActive = false;
      component.event = makeEvent({
        extraData: {
          raidSchedule: [
            {
              date: 'July 8',
              bosses: [{ name: 'Machamp', image: 'x.png', canBeShiny: false }],
              raidHours: [],
            },
          ],
        },
      });
      expect(component.showCollapsedScheduleDays).toBe(true);

      component.isActive = true;
      expect(component.showCollapsedScheduleDays).toBe(false);
    });

    it('showInlinePokemonImages is the negation of hasExpandedRaidSections while active', () => {
      component.isActive = true;
      component.event = makeEvent({
        extraData: {
          raidSchedule: [
            {
              date: 'July 8',
              bosses: [{ name: 'Machamp', image: 'x.png', canBeShiny: false }],
              raidHours: [],
            },
          ],
        },
      });
      expect(component.showInlinePokemonImages).toBe(false);
    });

    it('showInlinePokemonImages is true while active with no expanded raid sections', () => {
      component.isActive = true;
      expect(component.showInlinePokemonImages).toBe(true);
    });

    it('showInlinePokemonImages is the negation of having collapsed schedule days while inactive', () => {
      component.isActive = false;
      component.event = makeEvent({
        extraData: {
          raidSchedule: [
            {
              date: 'July 8',
              bosses: [{ name: 'Machamp', image: 'x.png', canBeShiny: false }],
              raidHours: [],
            },
          ],
        },
      });
      expect(component.showInlinePokemonImages).toBe(false);
    });

    it('showPokemonRow requires hasPokemon plus one of the two display modes', () => {
      component.event = makeEvent({
        eventType: 'raid-battles',
        extraData: {
          raidbattles: { bosses: [{ name: 'Machamp', image: 'machamp.png', canBeShiny: false }] },
        },
      });
      expect(component.showPokemonRow).toBe(true);
    });

    it('showPokemonRow is false when there is no Pokemon to show', () => {
      expect(component.showPokemonRow).toBe(false);
    });

    it('inlineImagesExcludeTiers is empty while active', () => {
      component.isActive = true;
      expect(component.inlineImagesExcludeTiers).toEqual([]);
    });

    it('inlineImagesExcludeTiers hides Tier 1 and Tier 3 while inactive', () => {
      component.isActive = false;
      expect(component.inlineImagesExcludeTiers).toEqual(['Tier 1', 'Tier 3']);
    });

    it('useStackedContentLayout is true while active', () => {
      component.isActive = true;
      expect(component.useStackedContentLayout).toBe(true);
    });

    it('useStackedContentLayout is true when pokemonCount exceeds 6, even while inactive', () => {
      component.isActive = false;
      component.event = makeEvent({
        eventType: 'raid-battles',
        extraData: {
          raidbattles: {
            bosses: Array.from({ length: 7 }, (_, i) => ({
              name: `Boss${String(i)}`,
              image: 'x.png',
              canBeShiny: false,
            })),
          },
        },
      });
      expect(component.useStackedContentLayout).toBe(true);
    });

    it('useStackedContentLayout is true when there are collapsed schedule day groups', () => {
      component.isActive = false;
      component.event = makeEvent({
        extraData: {
          raidSchedule: [
            {
              date: 'July 8',
              bosses: [{ name: 'Machamp', image: 'x.png', canBeShiny: false }],
              raidHours: [],
            },
          ],
        },
      });
      expect(component.useStackedContentLayout).toBe(true);
    });

    it('useStackedContentLayout is false while inactive with few Pokemon and no schedule days', () => {
      component.isActive = false;
      component.event = makeEvent({
        eventType: 'raid-battles',
        extraData: {
          raidbattles: { bosses: [{ name: 'Machamp', image: 'machamp.png', canBeShiny: false }] },
        },
      });
      expect(component.useStackedContentLayout).toBe(false);
    });
  });
});
