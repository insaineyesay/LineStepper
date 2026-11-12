// Web has no push notifications; reminders are a mobile-app feature.
// Same exports as push.ts so screens don't need platform checks.

export const REMINDER_CHANNEL_ID = 'reminders';
export const UPDATES_CHANNEL_ID = 'updates';

export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';
export type RegisterResult = 'registered' | 'denied' | 'unavailable';

export async function getPushStatusAsync(): Promise<PushStatus> {
  return 'unsupported';
}

export async function registerForPushAsync(_options: { prompt: boolean }): Promise<RegisterResult> {
  return 'unavailable';
}

export async function unregisterPushAsync(): Promise<void> {}

export function useNotificationTapRouting() {}
