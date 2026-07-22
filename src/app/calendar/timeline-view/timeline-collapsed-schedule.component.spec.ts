import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CollapsedScheduleDayGroup } from '../../core/services/timeline-schedule.util';
import { PokemonImageComponent } from './pokemon-image.component';
import { TimelineCollapsedScheduleComponent } from './timeline-collapsed-schedule.component';

function makeDayGroup(
  overrides: Partial<CollapsedScheduleDayGroup> = {}
): CollapsedScheduleDayGroup {
  return {
    id: 'schedule-day-0-July 22',
    date: 'July 22',
    images: [{ name: 'Machamp', imageUrl: 'machamp.png' }],
    ...overrides,
  };
}

describe('TimelineCollapsedScheduleComponent', () => {
  let fixture: ComponentFixture<TimelineCollapsedScheduleComponent>;
  let component: TimelineCollapsedScheduleComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    // Real templateUrl/styleUrl aren't resolved under vitest without extra
    // setup, so the exact real template is inlined here instead of relying
    // on templateUrl — see raid-tier-group-images.component.spec.ts for the
    // same convention/rationale.
    TestBed.overrideComponent(TimelineCollapsedScheduleComponent, {
      set: {
        template: `
          <div class="collapsed-schedule-days">
            @for (dayGroup of dayGroups; track dayGroup.id) {
              <div class="collapsed-day-group">
                <div class="collapsed-day-name">{{ dayGroup.date }}</div>
                <div class="tier-images">
                  @for (boss of dayGroup.images; track boss.name) {
                    <app-pokemon-image [pokemonData]="boss" [height]="imageHeight" [showCP]="false" [eventType]="eventType" [effect]="effect"></app-pokemon-image>
                  }
                </div>
              </div>
            }
          </div>
        `,
        styleUrl: undefined,
      },
    });
    TestBed.overrideComponent(PokemonImageComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(TimelineCollapsedScheduleComponent);
    component = fixture.componentInstance;
    component.eventType = 'raid-battles';
  });

  function nativeElement(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders no day-group elements when dayGroups is undefined', () => {
    component.dayGroups = undefined;
    fixture.detectChanges();
    expect(nativeElement().querySelectorAll('.collapsed-day-group').length).toBe(0);
  });

  it('renders one day-group per entry, in order, with its date label', () => {
    component.dayGroups = [
      makeDayGroup({ id: 'a', date: 'July 22' }),
      makeDayGroup({ id: 'b', date: 'July 23' }),
    ];
    fixture.detectChanges();
    const labels = Array.from(nativeElement().querySelectorAll('.collapsed-day-name')).map((el) =>
      el.textContent.trim()
    );
    expect(labels).toEqual(['July 22', 'July 23']);
  });

  it('renders one app-pokemon-image per boss in the day group', () => {
    component.dayGroups = [
      makeDayGroup({
        images: [
          { name: 'Machamp', imageUrl: 'machamp.png' },
          { name: 'Snorlax', imageUrl: 'snorlax.png' },
        ],
      }),
    ];
    fixture.detectChanges();
    expect(nativeElement().querySelectorAll('app-pokemon-image').length).toBe(2);
  });

  it('passes a fixed height, showCP=false, eventType, and effect down to each app-pokemon-image', () => {
    component.dayGroups = [makeDayGroup()];
    component.effect = 'dynamax';
    fixture.detectChanges();

    const pokemonImageDebugEl = fixture.debugElement.query(
      (debugElement) => debugElement.componentInstance instanceof PokemonImageComponent
    );
    const pokemonImage = pokemonImageDebugEl.componentInstance as PokemonImageComponent;

    expect(pokemonImage.height).toBe(34);
    expect(pokemonImage.showCP).toBe(false);
    expect(pokemonImage.eventType).toBe('raid-battles');
    expect(pokemonImage.effect).toBe('dynamax');
  });
});
