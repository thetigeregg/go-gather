import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * Hands a "focus this event" request from outside the Events tab (currently
 * only a tapped push notification, see NotificationService) to the Timeline
 * view. The pending ID is held, not just emitted, so a cold start — where
 * calendar.page.ts/timeline-view.component.ts haven't mounted yet when the
 * tap is delivered — still picks it up on init; the Subject covers the warm
 * case where those components are already mounted (Ionic tabs keep them
 * alive) and their ngOnInit won't rerun.
 */
@Injectable({ providedIn: 'root' })
export class EventFocusService {
  private pendingEventId: string | null = null;
  private readonly _focusRequest$ = new Subject<string>();

  requestFocus(eventId: string): void {
    this.pendingEventId = eventId;
    this._focusRequest$.next(eventId);
  }

  getPendingEventId(): string | null {
    return this.pendingEventId;
  }

  clearPendingEventId(): void {
    this.pendingEventId = null;
  }

  listenForFocusRequests(): Observable<string> {
    return this._focusRequest$.asObservable();
  }
}
