/**
 * Pure logic for the send-reminders edge function: building Expo push
 * messages and reading Expo's replies. No Deno or Supabase APIs here, so it
 * is unit-tested with vitest (reminders.test.ts, run by `npm test`).
 */

/** Reminders go out for events starting within this many hours. */
export const REMINDER_WINDOW_HOURS = 24;

/** Expo accepts at most 100 messages per push request. */
export const EXPO_BATCH_LIMIT = 100;

/** Android channel the app creates (apps/mobile/src/lib/push.ts). */
export const REMINDER_CHANNEL_ID = 'reminders';

/** A row returned by public.claim_due_reminders(). */
export interface DueReminder {
  profile_id: string;
  event_id: string;
  title: string;
  starts_at: string;
  venue_name: string | null;
  city: string | null;
}

export interface PushTokenRow {
  token: string;
  profile_id: string;
}

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  channelId: string;
  /** `url` is the app route opened when the notification is tapped. */
  data: { url: string };
}

/** One message plus the bookmark it is for, so replies can be matched back. */
export interface PendingPush {
  message: ExpoMessage;
  profileId: string;
  eventId: string;
}

/** An Expo push ticket (one per message, in send order). */
export interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export function bookmarkKey(profileId: string, eventId: string): string {
  return `${profileId}:${eventId}`;
}

/** "Starts in about 3 hours", "Starts within the hour". */
export function startsInText(startsAt: Date, now: Date): string {
  const minutes = (startsAt.getTime() - now.getTime()) / 60_000;
  if (minutes <= 60) return 'Starts within the hour';
  const hours = Math.round(minutes / 60);
  return `Starts in about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

export function reminderBody(reminder: DueReminder, now: Date): string {
  const where = [reminder.venue_name, reminder.city].filter(Boolean).join(', ');
  const when = startsInText(new Date(reminder.starts_at), now);
  return where ? `${when} · ${where}` : when;
}

/** One message per due bookmark per device the bookmark's owner has. */
export function buildReminderPushes(
  due: readonly DueReminder[],
  tokens: readonly PushTokenRow[],
  now: Date
): PendingPush[] {
  const tokensByProfile = new Map<string, string[]>();
  for (const row of tokens) {
    const list = tokensByProfile.get(row.profile_id) ?? [];
    list.push(row.token);
    tokensByProfile.set(row.profile_id, list);
  }

  const pushes: PendingPush[] = [];
  for (const reminder of due) {
    for (const token of tokensByProfile.get(reminder.profile_id) ?? []) {
      pushes.push({
        profileId: reminder.profile_id,
        eventId: reminder.event_id,
        message: {
          to: token,
          title: reminder.title,
          body: reminderBody(reminder, now),
          sound: 'default',
          channelId: REMINDER_CHANNEL_ID,
          data: { url: `/event/${reminder.event_id}` },
        },
      });
    }
  }
  return pushes;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface SendOutcome {
  /** Bookmarks with at least one message Expo accepted. */
  delivered: Set<string>;
  /** Tokens Expo says no longer exist (app uninstalled); delete them. */
  deadTokens: Set<string>;
  failed: number;
}

export function emptyOutcome(): SendOutcome {
  return { delivered: new Set(), deadTokens: new Set(), failed: 0 };
}

/**
 * Folds one batch's tickets into the outcome. `tickets` is null when the
 * whole request failed, which counts every message in the batch as failed.
 */
export function recordBatch(
  outcome: SendOutcome,
  batch: readonly PendingPush[],
  tickets: readonly ExpoTicket[] | null
): void {
  batch.forEach((push, i) => {
    const ticket = tickets?.[i];
    if (ticket?.status === 'ok') {
      outcome.delivered.add(bookmarkKey(push.profileId, push.eventId));
      return;
    }
    outcome.failed += 1;
    if (ticket?.details?.error === 'DeviceNotRegistered') {
      outcome.deadTokens.add(push.message.to);
    }
  });
}

/** Claimed bookmarks with no accepted message: un-mark them so the next run retries. */
export function bookmarksToRelease(
  due: readonly DueReminder[],
  outcome: SendOutcome
): DueReminder[] {
  return due.filter((r) => !outcome.delivered.has(bookmarkKey(r.profile_id, r.event_id)));
}
