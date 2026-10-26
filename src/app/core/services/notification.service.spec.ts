import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FirebaseMessaging } from './firebase-messaging.client';
import type { FirebaseNotificationListenerEvent } from './firebase-messaging.types';
import { EventFocusService } from './event-focus.service';
import { NotificationService } from './notification.service';
import { PreferenceStorageService } from '../storage/preference-storage.service';
import { UserDataService } from './user-data.service';

vi.mock('../utils/native-platform.util', () => ({
  isNativePlatform: () => true,
  getNativePlatform: () => 'ios',
}));

vi.mock('./firebase-messaging.client', () => ({
  FirebaseMessaging: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    getToken: vi.fn(),
    deleteToken: vi.fn(),
    addListener: vi.fn(),
  },
}));

type Listener = (event: FirebaseNotificationListenerEvent) => void;

describe('NotificationService notification taps', () => {
  let listeners: Map<string, Listener>;
  let navigateByUrl: Mock<(route: string) => Promise<boolean>>;
  let eventFocusService: EventFocusService;

  async function tap(data: unknown): Promise<void> {
    const listener = listeners.get('notificationActionPerformed');
    if (!listener) {
      throw new Error('notificationActionPerformed listener was not attached');
    }
    listener({ notification: { data } });
    await Promise.resolve();
  }

  beforeEach(async () => {
    listeners = new Map();
    vi.mocked(FirebaseMessaging.addListener).mockImplementation((eventName, listener) => {
      listeners.set(eventName, listener);
      return Promise.resolve({ remove: () => undefined });
    });
    navigateByUrl = vi.fn<(route: string) => Promise<boolean>>().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: {} },
        { provide: Router, useValue: { navigateByUrl } },
        { provide: PreferenceStorageService, useValue: {} },
        {
          provide: UserDataService,
          useValue: { getUserSettings: () => ({ notificationsEnabled: false }) },
        },
      ],
    });

    eventFocusService = TestBed.inject(EventFocusService);
    await TestBed.inject(NotificationService).initialize();
  });

  it('requests focus on the tapped event before navigating to its route', async () => {
    const calls: string[] = [];
    vi.spyOn(eventFocusService, 'requestFocus').mockImplementation((eventId) => {
      calls.push(`focus:${eventId}`);
    });
    navigateByUrl.mockImplementation((route) => {
      calls.push(`navigate:${route}`);
      return Promise.resolve(true);
    });

    await tap({ eventId: 'event-1', eventType: 'raid-day', route: '/tabs/calendar' });

    expect(calls).toEqual(['focus:event-1', 'navigate:/tabs/calendar']);
  });

  it('only navigates when the payload has no eventId', async () => {
    const focusSpy = vi.spyOn(eventFocusService, 'requestFocus');

    await tap({ route: '/tabs/calendar' });

    expect(focusSpy).not.toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/tabs/calendar');
  });

  it('ignores a blank or non-string eventId', async () => {
    const focusSpy = vi.spyOn(eventFocusService, 'requestFocus');

    await tap({ eventId: '  ', route: '/tabs/calendar' });
    await tap({ eventId: 42, route: '/tabs/calendar' });

    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('does not navigate for a missing or non-absolute route', async () => {
    await tap({ eventId: 'event-1', route: 'https://example.com' });
    await tap(undefined);

    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(eventFocusService.getPendingEventId()).toBe('event-1');
  });
});
