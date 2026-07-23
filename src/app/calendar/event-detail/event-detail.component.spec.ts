import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular/standalone';
import dayjs from 'dayjs';
import { EventMetadata, EventTypeInfoWithoutColor, PogoEvent } from '@go-gather/shared';
import { CalendarFilterService } from '../../core/services/calendar-filter.service';
import { EventDetailComponent } from './event-detail.component';

interface ToastButtonConfig {
  text?: string;
  handler?: () => unknown;
}

function makeFakeToastController() {
  const present = vi.fn().mockResolvedValue(undefined);
  let lastOptions: { message?: string; buttons?: ToastButtonConfig[] } | undefined;
  return {
    create: vi
      .fn()
      .mockImplementation((options: { message?: string; buttons?: ToastButtonConfig[] }) => {
        lastOptions = options;
        return Promise.resolve({ present });
      }),
    get present() {
      return present;
    },
    get lastOptions() {
      return lastOptions;
    },
  };
}

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
    name: 'Raid Day',
    priority: 78,
    category: 'community-and-raids',
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

describe('EventDetailComponent', () => {
  let fixture: ComponentFixture<EventDetailComponent>;
  let component: EventDetailComponent;
  let fakeCalendarFilterService: {
    hideEventById: ReturnType<typeof vi.fn>;
    showEventById: ReturnType<typeof vi.fn>;
  };
  let fakeToastController: ReturnType<typeof makeFakeToastController>;

  beforeEach(async () => {
    fakeCalendarFilterService = {
      hideEventById: vi.fn(),
      showEventById: vi.fn(),
    };
    fakeToastController = makeFakeToastController();

    TestBed.configureTestingModule({
      providers: [
        { provide: CalendarFilterService, useValue: fakeCalendarFilterService },
        { provide: ToastController, useValue: fakeToastController },
      ],
    });
    TestBed.overrideComponent(EventDetailComponent, {
      set: { template: '<div></div>', styleUrl: undefined, imports: [] },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(EventDetailComponent);
    component = fixture.componentInstance;
    component.event = makeEvent();
    component.metadata = makeMetadata();
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

  it('emits closed when the close button is clicked', () => {
    const emitSpy = vi.spyOn(component.closed, 'emit');

    component.onCloseClick();

    expect(emitSpy).toHaveBeenCalled();
  });

  describe('sourceEventID', () => {
    it('is the event ID directly for a normal event', () => {
      expect(component.sourceEventID).toBe('event-1');
    });

    it('resolves to the real source ID for a major-event daily projection', () => {
      component.event = {
        ...makeEvent({ eventID: 'go-fest-2026-daily-2026-07-08' }),
        _isMajorDailyDisplay: true,
        _sourceEventID: 'go-fest-2026',
      } as PogoEvent;

      expect(component.sourceEventID).toBe('go-fest-2026');
    });
  });

  describe('onHideClick', () => {
    it('hides by the source event ID, shows a toast, and closes the modal', async () => {
      const emitSpy = vi.spyOn(component.closed, 'emit');

      await component.onHideClick();

      expect(fakeCalendarFilterService.hideEventById).toHaveBeenCalledWith('event-1');
      expect(fakeToastController.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Hid "Test & Event"' })
      );
      expect(fakeToastController.present).toHaveBeenCalled();
      expect(emitSpy).toHaveBeenCalled();
    });

    it('hides a major-event daily projection by its real source ID, not the synthetic one', async () => {
      component.event = {
        ...makeEvent({ eventID: 'go-fest-2026-daily-2026-07-08' }),
        _isMajorDailyDisplay: true,
        _sourceEventID: 'go-fest-2026',
      } as PogoEvent;

      await component.onHideClick();

      expect(fakeCalendarFilterService.hideEventById).toHaveBeenCalledWith('go-fest-2026');
    });

    it("wires the toast's Undo button to restore the same event ID", async () => {
      await component.onHideClick();

      const undoButton = fakeToastController.lastOptions?.buttons?.[0];
      expect(undoButton?.text).toBe('Undo');

      undoButton?.handler?.();

      expect(fakeCalendarFilterService.showEventById).toHaveBeenCalledWith('event-1');
    });
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

    it('hasPokemon is true when pokemonCount is positive, false otherwise', () => {
      expect(component.hasPokemon).toBe(false);

      component.event = makeEvent({
        eventType: 'raid-battles',
        extraData: {
          raidbattles: { bosses: [{ name: 'Machamp', image: 'machamp.png', canBeShiny: false }] },
        },
      });
      expect(component.hasPokemon).toBe(true);
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

    it('hasExpandedRaidSections is false for a single tier group holding a single Pokemon', () => {
      component.metadata = makeMetadata({
        raidBossTierGroups: [
          { label: 'Tier 5', bosses: [{ name: 'Mewtwo', image: 'x.png', canBeShiny: false }] },
        ],
      });
      expect(component.hasExpandedRaidSections).toBe(false);
    });

    it('showPokemonRow requires hasPokemon and no expanded raid sections', () => {
      expect(component.showPokemonRow).toBe(false);

      component.event = makeEvent({
        eventType: 'raid-battles',
        extraData: {
          raidbattles: { bosses: [{ name: 'Machamp', image: 'machamp.png', canBeShiny: false }] },
        },
      });
      expect(component.showPokemonRow).toBe(true);
    });

    it('showPokemonRow is false once raid sections are expanded, even with Pokemon to show', () => {
      component.event = makeEvent({
        eventType: 'raid-battles',
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
      expect(component.showPokemonRow).toBe(false);
    });
  });
});
