/**
 * Pure logic for the send-notifications edge function, which delivers rows
 * from public.notification_outbox (0011) through Expo push. No Deno or
 * Supabase APIs here, so it's unit-tested with vitest (notifications.test.ts).
 */

import type { ExpoTicket, PushTokenRow } from './reminders.ts';

export { chunk, EXPO_BATCH_LIMIT, type ExpoTicket, type PushTokenRow } from './reminders.ts';

/** Rows claimed per database round trip. */
export const CLAIM_LIMIT = 500;

/** Stop claiming more after this long, well inside the function time limit. */
export const TIME_BUDGET_MS = 60_000;

/**
 * Android channel for change notices and new-event alerts. The app creates it
 * (apps/mobile/src/lib/push.ts) so people can mute these separately from
 * reminders.
 */
export const UPDATES_CHANNEL_ID = 'updates';

/** A row returned by public.claim_notifications(). */
export interface ClaimedNotification {
  id: number;
  profile_id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  claim_token: string;
}

export interface NotificationMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  channelId: string;
  /** `url` is the app route opened on tap; `kind` is for the app's logs. */
  data: { url?: string; kind: string };
}

export interface PendingNotification {
  message: NotificationMessage;
  rowId: number;
}

/** One message per outbox row per device its recipient has. */
export function buildNotificationPushes(
  rows: readonly ClaimedNotification[],
  tokens: readonly PushTokenRow[]
): PendingNotification[] {
  const byProfile = new Map<string, string[]>();
  for (const t of tokens) {
    const list = byProfile.get(t.profile_id) ?? [];
    list.push(t.token);
    byProfile.set(t.profile_id, list);
  }

  const pushes: PendingNotification[] = [];
  for (const row of rows) {
    for (const token of byProfile.get(row.profile_id) ?? []) {
      pushes.push({
        rowId: row.id,
        message: {
          to: token,
          title: row.title,
          body: row.body,
          sound: 'default',
          channelId: UPDATES_CHANNEL_ID,
          data: row.url ? { url: row.url, kind: row.kind } : { kind: row.kind },
        },
      });
    }
  }
  return pushes;
}

export interface NotificationOutcome {
  /** Rows with at least one message Expo accepted. */
  delivered: Set<number>;
  /** Tokens Expo says no longer exist (app uninstalled); delete them. */
  deadTokens: Set<string>;
  failed: number;
}

export function emptyNotificationOutcome(): NotificationOutcome {
  return { delivered: new Set(), deadTokens: new Set(), failed: 0 };
}

/** Folds one batch's tickets in. `tickets` is null when the whole request failed. */
export function recordNotificationBatch(
  outcome: NotificationOutcome,
  batch: readonly PendingNotification[],
  tickets: readonly ExpoTicket[] | null
): void {
  batch.forEach((push, i) => {
    const ticket = tickets?.[i];
    if (ticket?.status === 'ok') {
      outcome.delivered.add(push.rowId);
      return;
    }
    outcome.failed += 1;
    if (ticket?.details?.error === 'DeviceNotRegistered') {
      outcome.deadTokens.add(push.message.to);
    }
  });
}

/**
 * Which claimed rows are finished and which go back in the queue. A row is
 * finished when any device got it, or when its recipient has no device left
 * (nothing to retry with). Everything else is retried.
 */
export function settleNotifications(
  rows: readonly ClaimedNotification[],
  pushes: readonly PendingNotification[],
  outcome: NotificationOutcome
): { done: number[]; retry: number[] } {
  const live = new Set<number>();
  for (const p of pushes) {
    if (!outcome.deadTokens.has(p.message.to)) live.add(p.rowId);
  }
  const done: number[] = [];
  const retry: number[] = [];
  for (const row of rows) {
    if (outcome.delivered.has(row.id) || !live.has(row.id)) done.push(row.id);
    else retry.push(row.id);
  }
  return { done, retry };
}
