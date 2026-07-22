import { ComponentFixture, TestBed } from '@angular/core/testing';
import dayjs from 'dayjs';
import { TimelineCategorySectionComponent } from './timeline-category-section.component';
import { TimelineEventComponent } from './timeline-event.component';

describe('TimelineCategorySectionComponent', () => {
  let fixture: ComponentFixture<TimelineCategorySectionComponent>;
  let component: TimelineCategorySectionComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    TestBed.overrideComponent(TimelineCategorySectionComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    TestBed.overrideComponent(TimelineEventComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(TimelineCategorySectionComponent);
    component = fixture.componentInstance;
    component.categoryKey = 'today';
    component.title = 'Today Only';
    component.events = [];
    component.dateGroups = undefined;
    component.totalCount = 0;
    component.hiddenCount = 0;
    component.eventMetadata = {};
    component.activeEventId = null;
    component.now = dayjs('2026-07-08T12:00:00.000');
  });

  it('reports isFlatCategory true for today and ongoing', () => {
    component.categoryKey = 'today';
    expect(component.isFlatCategory).toBe(true);
    component.categoryKey = 'ongoing';
    expect(component.isFlatCategory).toBe(true);
  });

  it('reports isFlatCategory false for upcoming and future', () => {
    component.categoryKey = 'upcoming';
    expect(component.isFlatCategory).toBe(false);
    component.categoryKey = 'future';
    expect(component.isFlatCategory).toBe(false);
  });

  it('formats the hidden-count text with correct singular/plural', () => {
    component.hiddenCount = 1;
    expect(component.hiddenCountText).toBe('1 event hidden by filters');
    component.hiddenCount = 3;
    expect(component.hiddenCountText).toBe('3 events hidden by filters');
  });

  it('toggles isCollapsed', () => {
    expect(component.isCollapsed).toBe(false);
    component.toggleCollapsed();
    expect(component.isCollapsed).toBe(true);
    component.toggleCollapsed();
    expect(component.isCollapsed).toBe(false);
  });

  it('emits activate with the eventId when a child event activates', () => {
    const emitSpy = vi.spyOn(component.activate, 'emit');

    component.onActivate('event-1');

    expect(emitSpy).toHaveBeenCalledWith('event-1');
  });
});
