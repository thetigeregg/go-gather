import { TestBed } from '@angular/core/testing';
import { EventFocusService } from './event-focus.service';

describe('EventFocusService', () => {
  let service: EventFocusService;

  beforeEach(() => {
    service = TestBed.inject(EventFocusService);
  });

  it('has no pending event by default', () => {
    expect(service.getPendingEventId()).toBeNull();
  });

  it('holds the requested event ID until cleared', () => {
    service.requestFocus('event-1');
    expect(service.getPendingEventId()).toBe('event-1');

    service.clearPendingEventId();
    expect(service.getPendingEventId()).toBeNull();
  });

  it('emits each focus request to listeners', () => {
    const received: string[] = [];
    service.listenForFocusRequests().subscribe((eventId) => received.push(eventId));

    service.requestFocus('event-1');
    service.requestFocus('event-2');

    expect(received).toEqual(['event-1', 'event-2']);
    expect(service.getPendingEventId()).toBe('event-2');
  });
});
