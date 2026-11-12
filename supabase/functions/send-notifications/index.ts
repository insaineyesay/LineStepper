// Delivers waiting rows from public.notification_outbox through Expo push.
// pg_cron calls it each minute, but only when something is due
// (supabase/migrations/0011_notification_outbox.sql).
//
// Deploy:  npx supabase functions deploy send-notifications --no-verify-jwt
// Secrets: CRON_SECRET (already set for send-reminders; the same value),
//          EXPO_ACCESS_TOKEN (only if "enhanced push security" is on in the
//          Expo dashboard).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  buildNotificationPushes,
  chunk,
  CLAIM_LIMIT,
  emptyNotificationOutcome,
  EXPO_BATCH_LIMIT,
  recordNotificationBatch,
  settleNotifications,
  TIME_BUDGET_MS,
  type ClaimedNotification,
  type ExpoTicket,
  type NotificationMessage,
  type PushTokenRow,
} from '../_shared/notifications.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Function logs only (Supabase dashboard). Nothing is written to the database.
function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...data }));
}

async function sendBatch(messages: NotificationMessage[]): Promise<ExpoTicket[] | null> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
    if (!res.ok) {
      log('notifications.batch_failed', { status: res.status, body: await res.text() });
      return null;
    }
    const body = (await res.json()) as { data?: ExpoTicket[] };
    return body.data ?? null;
  } catch (err) {
    log('notifications.batch_failed', { message: (err as Error).message });
    return null;
  }
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // The minute job already checks this; checked again for manual calls.
  const { data: pushOn } = await supabase.rpc('flag_enabled', { p_key: 'notify.push', p_default: true });
  if (pushOn === false) {
    log('notifications.skipped', { flagsOff: ['notify.push'] });
    return json({ skipped: true, flagsOff: ['notify.push'] });
  }

  const started = Date.now();
  const totals = { claimed: 0, finished: 0, retried: 0, dropped: 0, failedMessages: 0, removedTokens: 0 };

  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data: claimed, error: claimError } = await supabase.rpc('claim_notifications', {
      p_limit: CLAIM_LIMIT,
    });
    if (claimError) {
      log('notifications.claim_failed', { message: claimError.message });
      return json({ error: claimError.message, ...totals }, 500);
    }
    const rows = (claimed ?? []) as ClaimedNotification[];
    if (rows.length === 0) break;
    totals.claimed += rows.length;

    const profileIds = [...new Set(rows.map((r) => r.profile_id))];
    const { data: tokenRows, error: tokenError } = await supabase
      .from('push_tokens')
      .select('token, profile_id')
      .in('profile_id', profileIds);

    const outcome = emptyNotificationOutcome();
    let done: number[];
    let retry: number[];
    if (tokenError) {
      // Don't treat "couldn't look up devices" as "has no devices".
      log('notifications.tokens_failed', { message: tokenError.message });
      done = [];
      retry = rows.map((r) => r.id);
    } else {
      const pushes = buildNotificationPushes(rows, (tokenRows ?? []) as PushTokenRow[]);
      for (const batch of chunk(pushes, EXPO_BATCH_LIMIT)) {
        recordNotificationBatch(outcome, batch, await sendBatch(batch.map((p) => p.message)));
      }
      ({ done, retry } = settleNotifications(rows, pushes, outcome));
    }

    const { data: dropped, error: finishError } = await supabase.rpc('finish_notifications', {
      p_claim_token: rows[0].claim_token,
      p_done: done,
      p_retry: retry,
    });
    if (finishError) {
      // The claim times out after 10 minutes and the rows are tried again.
      log('notifications.finish_failed', { message: finishError.message });
    }

    if (outcome.deadTokens.size > 0) {
      await supabase.from('push_tokens').delete().in('token', [...outcome.deadTokens]);
    }

    totals.finished += done.length;
    totals.retried += retry.length;
    totals.dropped += typeof dropped === 'number' ? dropped : 0;
    totals.failedMessages += outcome.failed;
    totals.removedTokens += outcome.deadTokens.size;

    if (rows.length < CLAIM_LIMIT) break;
  }

  log('notifications.sent', totals);
  return json(totals);
});
