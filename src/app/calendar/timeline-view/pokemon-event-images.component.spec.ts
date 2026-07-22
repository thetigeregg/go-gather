import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PogoEvent, PokemonBoss } from '@go-gather/shared';
import { PokemonEventImagesComponent } from './pokemon-event-images.component';
import { PokemonImageComponent } from './pokemon-image.component';

function makeBoss(overrides: Partial<PokemonBoss> = {}): PokemonBoss {
  return { name: 'Machamp', image: 'machamp.png', canBeShiny: false, ...overrides };
}

function makeEvent(overrides: Partial<PogoEvent> = {}): PogoEvent {
  return {
    eventID: 'event-1',
    name: 'Raid Battles',
    eventType: 'raid-battles',
    heading: 'Event',
    link: 'https://leekduck.com/events/test/',
    image: 'image.png',
    start: '2026-07-22T00:00:00.000',
    end: '2026-07-23T00:00:00.000',
    ...overrides,
  };
}

describe('PokemonEventImagesComponent', () => {
  let fixture: ComponentFixture<PokemonEventImagesComponent>;
  let component: PokemonEventImagesComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    TestBed.overrideComponent(PokemonEventImagesComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(PokemonImageComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(PokemonEventImagesComponent);
    component = fixture.componentInstance;
  });

  describe('displayedImages', () => {
    it('resolves images via getEventPokemonImages and caps to 3', () => {
      component.event = makeEvent({
        extraData: {
          raidbattles: {
            bosses: [
              makeBoss({ name: 'A' }),
              makeBoss({ name: 'B' }),
              makeBoss({ name: 'C' }),
              makeBoss({ name: 'D' }),
            ],
          },
        },
      });
      component.ngOnChanges();
      expect(component.displayedImages).toHaveLength(3);
    });

    it('is empty for an event with no resolvable Pokemon', () => {
      component.event = makeEvent({ eventType: 'community-day' });
      component.ngOnChanges();
      expect(component.displayedImages).toEqual([]);
    });

    it('passes excludeTiers through to the resolver', () => {
      component.event = makeEvent({
        extraData: {
          raidbattles: {
            bosses: [
              makeBoss({ name: 'Tier5Boss', raidType: 'Tier 5' }),
              makeBoss({ name: 'Tier3Boss', raidType: 'Tier 3' }),
            ],
          },
        },
      });
      component.excludeTiers = ['Tier 5'];
      component.ngOnChanges();
      expect(component.displayedImages.map((i) => i.name)).toEqual(['Tier3Boss']);
    });
  });

  describe('isRaidHourSubEvent / isSpotlightSubEvent', () => {
    it('reflects extraData flags', () => {
      component.event = makeEvent({
        extraData: { isRaidHourSubEvent: true, isSpotlightSubEvent: true },
      });
      expect(component.isRaidHourSubEvent).toBe(true);
      expect(component.isSpotlightSubEvent).toBe(true);
    });

    it('defaults to false when extraData is absent', () => {
      component.event = makeEvent();
      expect(component.isRaidHourSubEvent).toBe(false);
      expect(component.isSpotlightSubEvent).toBe(false);
    });
  });

  describe('shouldShowPlaceholder', () => {
    it('is false when showPlaceholder is off', () => {
      component.event = makeEvent({ eventType: 'raid-battles' });
      component.showPlaceholder = false;
      component.ngOnChanges();
      expect(component.shouldShowPlaceholder).toBe(false);
    });

    it('is true for a placeholder-eligible event type with no resolved Pokemon', () => {
      component.event = makeEvent({ eventType: 'raid-battles' });
      component.showPlaceholder = true;
      component.ngOnChanges();
      expect(component.shouldShowPlaceholder).toBe(true);
    });

    it('is false for a non-placeholder-eligible event type', () => {
      component.event = makeEvent({ eventType: 'wild-area' });
      component.showPlaceholder = true;
      component.ngOnChanges();
      expect(component.shouldShowPlaceholder).toBe(false);
    });

    it('is false when Pokemon images were actually resolved', () => {
      component.event = makeEvent({ extraData: { raidbattles: { bosses: [makeBoss()] } } });
      component.showPlaceholder = true;
      component.ngOnChanges();
      expect(component.shouldShowPlaceholder).toBe(false);
    });
  });

  describe('placeholderEffect', () => {
    it('reads the event-level sprite effect, since a placeholder has no resolved sprite of its own', () => {
      component.event = makeEvent({ eventType: 'max-mondays' });
      expect(component.placeholderEffect).toBe('dynamax');
    });
  });

  describe('overflow badges', () => {
    it('shows the overflow badge and the total count when the display cap hides Pokemon', () => {
      component.event = makeEvent({
        extraData: {
          raidbattles: {
            bosses: [
              makeBoss({ name: 'A' }),
              makeBoss({ name: 'B' }),
              makeBoss({ name: 'C' }),
              makeBoss({ name: 'D' }),
            ],
          },
        },
      });
      component.ngOnChanges();
      expect(component.showOverflowBadge).toBe(true);
      expect(component.overflowBadgeCount).toBe(4);
    });

    it('shows the overflow badge and the total raid boss count when tier exclusions hide bosses', () => {
      component.event = makeEvent({
        extraData: {
          raidbattles: {
            bosses: [
              makeBoss({ name: 'Tier5Boss', raidType: 'Tier 5' }),
              makeBoss({ name: 'Tier3Boss', raidType: 'Tier 3' }),
            ],
          },
        },
      });
      component.excludeTiers = ['Tier 5'];
      component.ngOnChanges();
      expect(component.showOverflowBadge).toBe(true);
      expect(component.overflowBadgeCount).toBe(2);
    });

    it('does not show the overflow badge when showOverflowCounter is off and there is no actual overflow', () => {
      component.event = makeEvent({
        extraData: { raidbattles: { bosses: [makeBoss(), makeBoss({ name: 'B' })] } },
      });
      component.showOverflowCounter = false;
      component.ngOnChanges();
      expect(component.showOverflowBadge).toBe(false);
    });

    it('shows the overflow badge when showOverflowCounter is on and there are at least 2 displayed images', () => {
      component.event = makeEvent({
        extraData: { raidbattles: { bosses: [makeBoss(), makeBoss({ name: 'B' })] } },
      });
      component.showOverflowCounter = true;
      component.ngOnChanges();
      expect(component.showOverflowBadge).toBe(true);
      expect(component.overflowBadgeCount).toBe(2);
    });

    it('does not show the overflow badge when showOverflowCounter is on but fewer than 2 images resolved', () => {
      component.event = makeEvent({ extraData: { raidbattles: { bosses: [makeBoss()] } } });
      component.showOverflowCounter = true;
      component.ngOnChanges();
      expect(component.showOverflowBadge).toBe(false);
    });

    it('does not treat an event with an explicitly empty raidbattles.bosses list as overflowing', () => {
      component.event = makeEvent({ extraData: { raidbattles: { bosses: [] } } });
      component.excludeTiers = ['Tier 5'];
      component.ngOnChanges();
      expect(component.showOverflowBadge).toBe(false);
      expect(component.overflowBadgeCount).toBe(0);
    });
  });

  describe('showContainer', () => {
    it('is true when there are displayed images', () => {
      component.event = makeEvent({ extraData: { raidbattles: { bosses: [makeBoss()] } } });
      component.ngOnChanges();
      expect(component.showContainer).toBe(true);
    });

    it('is true when the placeholder should show', () => {
      component.event = makeEvent({ eventType: 'raid-battles' });
      component.showPlaceholder = true;
      component.ngOnChanges();
      expect(component.showContainer).toBe(true);
    });

    it('is false when there is nothing to render', () => {
      component.event = makeEvent({ eventType: 'community-day' });
      component.ngOnChanges();
      expect(component.showContainer).toBe(false);
    });
  });

  describe('trackByImage', () => {
    it('produces a stable, unique key from name/imageUrl/fallback/index', () => {
      const key = component.trackByImage(0, {
        name: 'Machamp',
        imageUrl: 'a.png',
        fallbackImageUrl: 'b.png',
      });
      expect(key).toBe('pokemon-Machamp-a.png-b.png-0');
    });

    it('substitutes "none" for a null imageUrl/fallback', () => {
      const key = component.trackByImage(2, { name: 'Machamp', imageUrl: null });
      expect(key).toBe('pokemon-Machamp-none-none-2');
    });
  });
});
