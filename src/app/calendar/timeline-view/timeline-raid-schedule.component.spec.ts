import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RaidTierGroupWithImages } from '../../core/services/raid-tier-groups.util';
import { TimelineScheduleDaySection } from '../../core/services/timeline-schedule.util';
import { PokemonImageComponent } from './pokemon-image.component';
import { RaidTierGroupImagesComponent } from './raid-tier-group-images.component';
import { TimelineRaidScheduleComponent } from './timeline-raid-schedule.component';

function makeTierGroup(overrides: Partial<RaidTierGroupWithImages> = {}): RaidTierGroupWithImages {
  return {
    label: 'Tier 3',
    showLabel: true,
    images: [{ name: 'Machamp', imageUrl: 'machamp.png' }],
    ...overrides,
  };
}

function makeDaySection(
  overrides: Partial<TimelineScheduleDaySection> = {}
): TimelineScheduleDaySection {
  return {
    id: 'schedule-day-0-July 22',
    date: 'July 22',
    sections: [
      {
        id: 'schedule-0',
        labelText: 'All Day',
        isAllDay: true,
        sortKey: -1,
        tierGroups: [makeTierGroup()],
      },
    ],
    ...overrides,
  };
}

describe('TimelineRaidScheduleComponent', () => {
  let fixture: ComponentFixture<TimelineRaidScheduleComponent>;
  let component: TimelineRaidScheduleComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    // Real templateUrl/styleUrl aren't resolved under vitest without extra
    // setup, so the exact real template is inlined here instead of relying
    // on templateUrl — see raid-tier-group-images.component.spec.ts for the
    // same convention/rationale.
    TestBed.overrideComponent(TimelineRaidScheduleComponent, {
      set: {
        template: `
          @if (daySections?.length) {
            <div class="raid-boss-tiers">
              @for (daySection of daySections; track daySection.id) {
                <div class="schedule-day-section">
                  <div class="schedule-day-header">{{ daySection.date }}</div>

                  @for (section of daySection.sections; track section.id) {
                    <div class="schedule-section">
                      <div class="schedule-section-header" [class.is-all-day]="section.isAllDay">
                        <span class="schedule-label">{{ section.labelText }}</span>
                        @if (section.time) {
                          <span class="schedule-time">{{ section.time }}</span>
                        }
                      </div>

                      <app-raid-tier-group-images [groups]="section.tierGroups" [height]="imageHeight" [eventType]="eventType" [effect]="effect"></app-raid-tier-group-images>
                    </div>
                  }
                </div>
              }
            </div>
          } @else if (defaultTierGroups) {
            <div class="raid-boss-tiers">
              <app-raid-tier-group-images [groups]="defaultTierGroups" [height]="imageHeight" [eventType]="eventType" [effect]="effect"></app-raid-tier-group-images>
            </div>
          }
        `,
        styleUrl: undefined,
      },
    });
    TestBed.overrideComponent(RaidTierGroupImagesComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(PokemonImageComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(TimelineRaidScheduleComponent);
    component = fixture.componentInstance;
    component.eventType = 'raid-battles';
  });

  function nativeElement(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders nothing when there are no day sections and no default tier groups', () => {
    fixture.detectChanges();
    expect(nativeElement().querySelector('.raid-boss-tiers')).toBeNull();
  });

  it('renders day sections, in order, with their date header', () => {
    component.daySections = [
      makeDaySection({ id: 'a', date: 'July 22' }),
      makeDaySection({ id: 'b', date: 'July 23' }),
    ];
    fixture.detectChanges();
    const headers = Array.from(nativeElement().querySelectorAll('.schedule-day-header')).map((el) =>
      el.textContent.trim()
    );
    expect(headers).toEqual(['July 22', 'July 23']);
  });

  it('renders each section within a day with its label and time', () => {
    component.daySections = [
      makeDaySection({
        sections: [
          {
            id: 's1',
            labelText: 'All Day',
            isAllDay: true,
            sortKey: -1,
            tierGroups: [makeTierGroup()],
          },
          {
            id: 's2',
            labelText: 'Raid Hour',
            time: '6:00 p.m. - 7:00 p.m.',
            isAllDay: false,
            sortKey: 1080,
            tierGroups: [makeTierGroup()],
          },
        ],
      }),
    ];
    fixture.detectChanges();

    const labels = Array.from(nativeElement().querySelectorAll('.schedule-label')).map((el) =>
      el.textContent.trim()
    );
    expect(labels).toEqual(['All Day', 'Raid Hour']);

    const times = Array.from(nativeElement().querySelectorAll('.schedule-time')).map((el) =>
      el.textContent.trim()
    );
    expect(times).toEqual(['6:00 p.m. - 7:00 p.m.']);
  });

  it('marks an all-day section header with is-all-day', () => {
    component.daySections = [makeDaySection()];
    fixture.detectChanges();
    expect(nativeElement().querySelector('.schedule-section-header.is-all-day')).not.toBeNull();
  });

  it('does not mark a timed section header with is-all-day', () => {
    component.daySections = [
      makeDaySection({
        sections: [
          {
            id: 's1',
            labelText: 'Evening',
            time: '6:00 p.m.',
            isAllDay: false,
            sortKey: 1080,
            tierGroups: [makeTierGroup()],
          },
        ],
      }),
    ];
    fixture.detectChanges();
    expect(nativeElement().querySelector('.schedule-section-header.is-all-day')).toBeNull();
  });

  it('renders one raid-tier-group-images per section, passing its tierGroups', () => {
    component.daySections = [makeDaySection()];
    component.effect = 'shadow';
    fixture.detectChanges();

    const debugEl = fixture.debugElement.query(
      (el) => el.componentInstance instanceof RaidTierGroupImagesComponent
    );
    const tierGroupImages = debugEl.componentInstance as RaidTierGroupImagesComponent;

    expect(tierGroupImages.groups).toEqual([makeTierGroup()]);
    expect(tierGroupImages.height).toBe(60);
    expect(tierGroupImages.eventType).toBe('raid-battles');
    expect(tierGroupImages.effect).toBe('shadow');
  });

  it('falls back to a single flat raid-tier-group-images using defaultTierGroups when there are no day sections', () => {
    component.defaultTierGroups = [makeTierGroup({ label: 'Super Mega' })];
    fixture.detectChanges();

    expect(nativeElement().querySelector('.raid-boss-tiers')).not.toBeNull();
    expect(nativeElement().querySelectorAll('app-raid-tier-group-images').length).toBe(1);

    const debugEl = fixture.debugElement.query(
      (el) => el.componentInstance instanceof RaidTierGroupImagesComponent
    );
    const tierGroupImages = debugEl.componentInstance as RaidTierGroupImagesComponent;
    expect(tierGroupImages.groups).toEqual([makeTierGroup({ label: 'Super Mega' })]);
  });

  it('prefers day sections over defaultTierGroups when both are present', () => {
    component.daySections = [makeDaySection()];
    component.defaultTierGroups = [makeTierGroup({ label: 'Super Mega' })];
    fixture.detectChanges();

    expect(nativeElement().querySelectorAll('.schedule-day-section').length).toBe(1);
    expect(nativeElement().querySelectorAll('app-raid-tier-group-images').length).toBe(1);
  });

  it('treats an empty daySections array like "no day sections" and falls back to defaultTierGroups', () => {
    component.daySections = [];
    component.defaultTierGroups = [makeTierGroup()];
    fixture.detectChanges();

    expect(nativeElement().querySelectorAll('.schedule-day-section').length).toBe(0);
    expect(nativeElement().querySelectorAll('app-raid-tier-group-images').length).toBe(1);
  });
});
