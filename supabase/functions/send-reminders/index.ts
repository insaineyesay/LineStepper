// Sends push reminders for bookmarked events starting in the next 24 hours.
// Called hourly by pg_cron (supabase/migrations/0004_event_reminders.sql).
//
// Deploy:  npx supabase functions deploy send-reminders --no-verify-jwt
// Secrets: CRON_SECRET (required; must match the Vault secret
//          reminders_cron_secret), EXPO_ACCESS_TOKEN (only if "enhanced push
//          security" is on in the Expo dashboard).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  bookmarksToRelease,
  buildReminderPushes,
  chunk,
  emptyOutcome,
  EXPO_BATCH_LIMIT,
  recordBatch,
  REMINDER_WINDOW_HOURS,
  type DueReminder,
  type ExpoTicket,
  type PushTokenRow,
} from '../_shared/reminders.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// A row in feature_flags is an admin override; with no row, both flags are
// on by default (packages/shared/src/flags/registry.ts).
const REQUIRED_FLAGS = ['events.reminders', 'notify.push'];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...data }));
}

async function sendBatch(messages: unknown[]): Promise<ExpoTicket[] | null> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
    if (!res.ok) {
      log('reminders.batch_failed', { status: res.status, body: await res.text() });
      return null;
    }
    const body = (await res.json()) as { data?: ExpoTicket[] };
    return body.data ?? null;
  } catch (err) {
    log('reminders.batch_failed', { message: (err as Error).message });
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

  const { data: overrides } = await supabase
    .from('feature_flags')
    .select('key, enabled')
    .in('key', REQUIRED_FLAGS);
  const off = (overrides ?? []).filter((f) => !f.enabled).map((f) => f.key);
  if (off.length > 0) {
    log('reminders.skipped', { flagsOff: off });
    return json({ skipped: true, flagsOff: off });
  }

  const { data: claimed, error: claimError } = await supabase.rpc('claim_due_reminders', {
    p_within: `${REMINDER_WINDOW_HOURS} hours`,
  });
  if (claimError) {
    log('reminders.claim_failed', { message: claimError.message });
    return json({ error: claimError.message }, 500);
  }
  const due = (claimed ?? []) as DueReminder[];
  if (due.length === 0) return json({ claimed: 0, sent: 0 });

  const profileIds = [...new Set(due.map((r) => r.profile_id))];
  const { data: tokenRows, error: tokenError } = await supabase
    .from('push_tokens')
    .select('token, profile_id')
    .in('profile_id', profileIds);

  const outcome = emptyOutcome();
  if (!tokenError) {
    const pushes = buildReminderPushes(due, (tokenRows ?? []) as PushTokenRow[], new Date());
    for (const batch of chunk(pushes, EXPO_BATCH_LIMIT)) {
      recordBatch(outcome, batch, await sendBatch(batch.map((p) => p.message)));
    }
  } else {
    log('reminders.tokens_failed', { message: tokenError.message });
  }

  // Anything not delivered goes back in the queue for the next hourly run.
  const release = bookmarksToRelease(due, outcome);
  for (const r of release) {
    await supabase
      .from('event_bookmarks')
      .update({ reminder_sent: false })
      .match({ profile_id: r.profile_id, event_id: r.event_id });
  }

  if (outcome.deadTokens.size > 0) {
    await supabase.from('push_tokens').delete().in('token', [...outcome.deadTokens]);
  }

  const summary = {
    claimed: due.length,
    delivered: outcome.delivered.size,
    released: release.length,
    failedMessages: outcome.failed,
    removedTokens: outcome.deadTokens.size,
  };
  log('reminders.sent', summary);
  return json(summary);
});
