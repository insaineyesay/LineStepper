import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { LogEvents } from '@linestepper/shared';

import { isBackendConfigured } from '@/data/backend';
import { registerPushToken, removePushToken } from '@/data/push-tokens';

import { logger } from './logger';

/**
 * Push notifications for event reminders. The server side is
 * supabase/functions/send-reminders; it uses the same channel id.
 * Web has no push (see push.web.ts).
 */
export const REMINDER_CHANNEL_ID = 'reminders';

export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';
export type RegisterResult = 'registered' | 'denied' | 'unavailable';

// Show reminders as a banner even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let registeredToken: string | null = null;

function easProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

function isGranted(status: Notifications.NotificationPermissionsStatus): boolean {
  return (
    status.granted ||
    status.ios?.status === IosAuthorizationStatus.PROVISIONAL
  );
}

/** Whether this device can get reminders, without asking. */
export async function getPushStatusAsync(): Promise<PushStatus> {
  try {
    const status = await Notifications.getPermissionsAsync();
    if (isGranted(status)) return 'granted';
    return status.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/**
 * Gets this device's Expo push token and saves it for the signed-in user.
 * With `prompt: true` it asks for permission first if it hasn't been asked;
 * otherwise it only registers when permission was already given.
 */
export async function registerForPushAsync({ prompt }: { prompt: boolean }): Promise<RegisterResult> {
  if (!isBackendConfigured) return 'unavailable';
  try {
    // Android 13+ shows the permission prompt only once a channel exists.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
        name: 'Event reminders',
        importance: AndroidImportance.HIGH,
      });
    }

    let permissions = await Notifications.getPermissionsAsync();
    if (!isGranted(permissions) && prompt && permissions.canAskAgain) {
      permissions = await Notifications.requestPermissionsAsync();
    }
    if (!isGranted(permissions)) return 'denied';

    const projectId = easProjectId();
    if (!projectId) {
      // Set by `eas init`; Expo can't issue push tokens without it.
      logger.warn(LogEvents.pushRegisterFailed, { reason: 'no_eas_project_id' });
      return 'unavailable';
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await registerPushToken(token, Platform.OS);
    if (error) throw new Error(error.message);

    registeredToken = token;
    logger.info(LogEvents.pushRegistered, { platform: Platform.OS });
    return 'registered';
  } catch (err) {
    logger.warn(LogEvents.pushRegisterFailed, { message: (err as Error).message });
    return 'unavailable';
  }
}

/**
 * Stops reminders reaching this device. Call before signing out, while the
 * session can still delete the user's own token.
 */
export async function unregisterPushAsync(): Promise<void> {
  const token = registeredToken;
  if (!token) return;
  registeredToken = null;
  const { error } = await removePushToken(token);
  if (error) logger.warn(LogEvents.pushRegisterFailed, { message: error.message, op: 'unregister' });
}

const EVENT_URL = /^\/event\/[0-9a-f-]{36}$/i;

/**
 * Opens the event when a reminder is tapped, whether the app was running or
 * was launched by the tap. Only event links are followed.
 */
export function useNotificationTapRouting() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (!active || typeof url !== 'string' || !EVENT_URL.test(url)) return;
      logger.info(LogEvents.pushOpened, { url });
      router.push(url as `/event/${string}`);
      void Notifications.clearLastNotificationResponseAsync();
    };

    Notifications.getLastNotificationResponseAsync().then(open);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
      active = false;
      sub.remove();
    };
  }, [router]);
}
