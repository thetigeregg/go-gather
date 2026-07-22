import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PogoEvent } from '@go-gather/shared';
import { MultiDayEventBarComponent } from './multi-day-event-bar.component';

describe('MultiDayEventBarComponent', () => {
  let fixture: ComponentFixture<MultiDayEventBarComponent>;
  let component: MultiDayEventBarComponent;

  const event: PogoEvent = {
    eventID: 'test-event',
    name: 'Test &amp; Event',
    eventType: 'raid-battles',
    heading: 'Raid Battles',
    link: 'https://leekduck.com/events/test-event/',
    image: '',
    start: '2026-07-01T10:00:00.000',
    end: '2026-07-03T20:00:00.000',
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    TestBed.overrideComponent(MultiDayEventBarComponent, {
      set: { template: '<div></div>', styleUrl: undefined },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(MultiDayEventBarComponent);
    component = fixture.componentInstance;
    component.event = event;
    component.color = '#ff0000';
    component.barClass = 'start-cap';
    component.position = { left: '10%', width: '20%' };
  });

  it('formats the display name by decoding HTML entities', () => {
    expect(component.displayName).toBe('Test & Event');
  });

  it('emits eventClick with the event on click', () => {
    const emitSpy = vi.spyOn(component.eventClick, 'emit');

    component.onClick();

    expect(emitSpy).toHaveBeenCalledWith(event);
  });
});
