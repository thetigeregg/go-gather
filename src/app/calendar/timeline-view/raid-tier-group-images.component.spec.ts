import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PokemonStatsService } from '../../core/services/pokemon-stats.service';
import { RaidTierGroupWithImages } from '../../core/services/raid-tier-groups.util';
import { PokemonImageComponent } from './pokemon-image.component';
import { RaidTierGroupImagesComponent } from './raid-tier-group-images.component';

function makeGroup(overrides: Partial<RaidTierGroupWithImages> = {}): RaidTierGroupWithImages {
  return {
    label: 'Tier 3',
    showLabel: true,
    images: [{ name: 'Machamp', imageUrl: 'machamp.png' }],
    ...overrides,
  };
}

describe('RaidTierGroupImagesComponent', () => {
  let fixture: ComponentFixture<RaidTierGroupImagesComponent>;
  let component: RaidTierGroupImagesComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PokemonStatsService,
          useValue: {
            loadPokemonData: () => ({ subscribe: () => undefined }),
            searchCatchablePokemon: () => null,
          },
        },
      ],
    });
    // Real templateUrl/styleUrl aren't resolved under vitest without extra
    // setup (every other component spec in this codebase sidesteps this by
    // overriding to a stub) — inline the exact real template here instead so
    // this still exercises real bindings/structure, since this component has
    // no class-level logic of its own to unit test otherwise. The child
    // app-pokemon-image is stubbed (its own spec covers its logic).
    TestBed.overrideComponent(RaidTierGroupImagesComponent, {
      set: {
        template: `
          @for (group of groups; track group.label) {
            <div class="tier-group">
              @if (group.showLabel) {
                <div class="tier-label">{{ group.label }}</div>
              }
              <div class="tier-images">
                @for (boss of group.images; track boss.name) {
                  <app-pokemon-image [pokemonData]="boss" [height]="height" [showCP]="true" [eventType]="eventType" [effect]="effect"></app-pokemon-image>
                }
              </div>
            </div>
          }
        `,
        styleUrl: undefined,
      },
    });
    TestBed.overrideComponent(PokemonImageComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(RaidTierGroupImagesComponent);
    component = fixture.componentInstance;
    component.height = 18;
    component.eventType = 'raid-battles';
  });

  function nativeElement(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders no tier-group elements when groups is undefined', () => {
    component.groups = undefined;
    fixture.detectChanges();
    expect(nativeElement().querySelectorAll('.tier-group').length).toBe(0);
  });

  it('renders one .tier-group per group, in order', () => {
    component.groups = [makeGroup({ label: 'Super Mega' }), makeGroup({ label: 'Tier 5' })];
    fixture.detectChanges();
    const labels = Array.from(nativeElement().querySelectorAll('.tier-label')).map((el) =>
      el.textContent.trim()
    );
    expect(labels).toEqual(['Super Mega', 'Tier 5']);
  });

  it('hides the .tier-label element when showLabel is false', () => {
    component.groups = [makeGroup({ showLabel: false })];
    fixture.detectChanges();
    expect(nativeElement().querySelector('.tier-label')).toBeNull();
  });

  it('renders one app-pokemon-image per boss image in the group', () => {
    component.groups = [
      makeGroup({
        images: [
          { name: 'Machamp', imageUrl: 'machamp.png' },
          { name: 'Snorlax', imageUrl: 'snorlax.png' },
        ],
      }),
    ];
    fixture.detectChanges();
    expect(nativeElement().querySelectorAll('app-pokemon-image').length).toBe(2);
  });

  it('passes height, eventType, and effect down to each app-pokemon-image', () => {
    component.groups = [makeGroup()];
    component.effect = 'shadow';
    fixture.detectChanges();

    const pokemonImageDebugEl = fixture.debugElement.query(
      (debugElement) => debugElement.componentInstance instanceof PokemonImageComponent
    );
    const pokemonImage = pokemonImageDebugEl.componentInstance as PokemonImageComponent;

    expect(pokemonImage.height).toBe(18);
    expect(pokemonImage.eventType).toBe('raid-battles');
    expect(pokemonImage.effect).toBe('shadow');
    expect(pokemonImage.showCP).toBe(true);
  });
});
