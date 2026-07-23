import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { firstValueFrom } from 'rxjs';
import { FirebaseMessaging } from './firebase-messaging.client';
import type { FirebaseNotificationListenerEvent } from './firebase-messaging.types';
import { environment } from '../../../environments/environment';
import { getNativePlatform, isNativePlatform } from '../utils/native-platform.util';
import { PreferenceStorageService } from '../storage/preference-storage.service';
import { UserDataService } from './user-data.service';

const FCM_DEVICE_TOKEN_STORAGE_KEY = 'go-gather:notifications:fcm-token';

/**
 * Calendar-event push notifications are native push only (APNs via FCM
 * through `@capacitor-firebase/messaging` on Capacitor iOS) — the web app
 * has no push support. The enabled toggle and offset/all-day-time
 * preferences are synced `UserSettings` fields (see `UserDataService`), not
 * device-local — this service only owns the device's FCM token and the
 * native permission/registration flow.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly httpClient = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly preferenceStorage = inject(PreferenceStorageService);
  private readonly userDataService = inject(UserDataService);
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private nativeListenersAttached = false;

  /** True only in the Capacitor native shell; the web app has no push support. */
  isPushSupported(): boolean {
    return isNativePlatform();
  }

  /** Attaches native listeners and, if notifications are already enabled and
   * permission already granted, re-registers this device's token. Called
   * once at app startup (see app.component.ts). */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = this.initializeInternal();
    try {
      await this.initializing;
      this.initialized = true;
    } finally {
      this.initializing = null;
    }
  }

  private async initializeInternal(): Promise<void> {
    if (!this.isPushSupported()) {
      return;
    }

    await this.attachNativeListeners();

    if (!this.userDataService.getUserSettings().notificationsEnabled) {
      return;
    }

    const permission = await this.checkNativePermission();
    if (permission === 'granted') {
      await this.registerCurrentDevice();
    }
  }

  async requestPermissionAndRegister(): Promise<{ ok: boolean; message: string }> {
    if (!this.isPushSupported()) {
      return { ok: false, message: 'Notifications are not supported on this device.' };
    }

    const permission = await FirebaseMessaging.requestPermissions()
      .then((status) => status.receive)
      .catch((error: unknown) => {
        console.error('Failed to request notification permission', error);
        return 'denied';
      });

    if (permission !== 'granted') {
      return { ok: false, message: 'Notification permission was not granted.' };
    }

    return this.registerCurrentDevice();
  }

  async unregisterCurrentDevice(): Promise<{ ok: boolean; message: string }> {
    const storedToken = await this.readStoredToken();

    const backendUnregisterOk = storedToken
      ? await firstValueFrom(
          this.httpClient.post(`${environment.apiUrl}/api/notifications/fcm/unregister`, {
            token: storedToken,
          })
        )
          .then(() => true)
          .catch(() => false)
      : true;

    const firebaseDeleteOk = this.isPushSupported()
      ? await FirebaseMessaging.deleteToken()
          .then(() => true)
          .catch(() => false)
      : true;

    await this.preferenceStorage.removeItem(FCM_DEVICE_TOKEN_STORAGE_KEY).catch((err: unknown) => {
      console.error('Failed to clear stored FCM token', err);
    });

    if (backendUnregisterOk && firebaseDeleteOk) {
      return { ok: true, message: 'Notifications disabled on this device.' };
    }

    return {
      ok: false,
      message: 'Notifications were disabled locally, but device unregister did not fully complete.',
    };
  }

  private async registerCurrentDevice(): Promise<{ ok: boolean; message: string }> {
    if (!this.isPushSupported()) {
      return { ok: false, message: 'Notifications are not available in this app session.' };
    }

    const token = await FirebaseMessaging.getToken()
      .then((result) => result.token)
      .catch((error: unknown) => {
        console.error('Failed to fetch FCM token', error);
        return null;
      });

    if (!token || token.trim().length === 0) {
      return {
        ok: false,
        message:
          'Unable to register the device for notifications. Check the Firebase iOS configuration.',
      };
    }

    const registeredOnBackend = await firstValueFrom(
      this.httpClient.post(`${environment.apiUrl}/api/notifications/fcm/register`, {
        token,
        platform: this.resolveDevicePlatform(),
        appVersion: await this.resolveAppVersion(),
        userAgent: navigator.userAgent,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
    ).catch((error: unknown) => {
      console.error('Failed to register device for notifications', error);
      return null;
    });

    if (!registeredOnBackend) {
      return { ok: false, message: 'Unable to save this device token on the server.' };
    }

    await this.preferenceStorage
      .setItem(FCM_DEVICE_TOKEN_STORAGE_KEY, token)
      .catch((err: unknown) => {
        console.error('Failed to store FCM token locally', err);
      });

    return { ok: true, message: 'Notifications enabled on this device.' };
  }

  private async checkNativePermission(): Promise<string> {
    return FirebaseMessaging.checkPermissions()
      .then((status) => status.receive)
      .catch((error: unknown) => {
        console.error('Failed to check notification permission', error);
        return 'denied';
      });
  }

  private async attachNativeListeners(): Promise<void> {
    if (this.nativeListenersAttached) {
      return;
    }
    this.nativeListenersAttached = true;

    // Foreground presentation is handled natively via the FirebaseMessaging
    // `presentationOptions` in capacitor.config.ts; no action needed here.
    await FirebaseMessaging.addListener('notificationReceived', () => undefined).catch(
      (error: unknown) => {
        console.error('Failed to attach notificationReceived listener', error);
      }
    );

    await FirebaseMessaging.addListener(
      'notificationActionPerformed',
      (event: FirebaseNotificationListenerEvent) => {
        const route = this.extractRoute(event.notification.data);
        if (route !== null) {
          void this.router.navigateByUrl(route).catch(() => {
            window.location.assign(route);
          });
        }
      }
    ).catch((error: unknown) => {
      console.error('Failed to attach notificationActionPerformed listener', error);
    });
  }

  private extractRoute(data: unknown): string | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const route = (data as Record<string, unknown>)['route'];
    return typeof route === 'string' && route.startsWith('/') ? route : null;
  }

  private resolveDevicePlatform(): 'web' | 'android' | 'ios' {
    const platform = getNativePlatform();
    if (platform === 'ios' || platform === 'android') {
      return platform;
    }

    return 'web';
  }

  private async resolveAppVersion(): Promise<string | null> {
    if (!this.isPushSupported()) {
      return null;
    }

    try {
      const info = await App.getInfo();
      return info.version;
    } catch {
      return null;
    }
  }

  private async readStoredToken(): Promise<string | null> {
    try {
      const raw = await this.preferenceStorage.getItem(FCM_DEVICE_TOKEN_STORAGE_KEY);
      const normalized = typeof raw === 'string' ? raw.trim() : '';
      return normalized.length > 0 ? normalized : null;
    } catch {
      return null;
    }
  }
}
