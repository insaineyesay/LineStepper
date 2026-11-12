-- Notification outbox (phase 1: change notices and new-event alerts).
--
-- Anything that wants to tell someone something writes a row here, already
-- worded. Every minute pg_cron checks for rows that are due and, only if
-- there are some, calls the send-notifications edge function
-- (supabase/functions/send-notifications), which delivers them through Expo
-- push and deletes them. Nothing is kept after it's sent: this is a queue,
-- not a log.
--
-- Running cost: the minute check is one index lookup inside the database
-- (free). The edge function only runs in minutes that have something to send,
-- so it's at most 43,200 calls a month and in practice a few hundred. Both
-- Supabase plans include far more than that (500k free, 2M on Pro). Expo
-- doesn't charge for push.

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- What this is about, for the app and the logs: 'event_update', 'new_event'.
  kind text not null check (kind ~ '^[a-z_]{1,40}$'),
  -- One waiting notice per person per key. A second change to the same event
  -- replaces the waiting notice instead of adding another one.
  dedupe_key text not null check (char_length(dedupe_key) <= 100),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 500),
  -- The app screen opened when the notice is tapped, e.g. /event/<id>.
  url text check (url ~ '^/[a-z0-9/_-]{1,200}$'),
  -- Not sent before this. Producers use it to wait a moment for more edits.
  send_after timestamptz not null default now(),
  attempts smallint not null default 0,
  -- Set while a sender is delivering the row; cleared when the row changes,
  -- so an edit that lands mid-send is sent again rather than lost.
  claim_token uuid,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (profile_id, dedupe_key)
);

create index notification_outbox_due_idx on public.notification_outbox (send_after);

-- Only the database itself (triggers) and the service role touch the outbox.
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from public, anon, authenticated;
grant all on public.notification_outbox to service_role;

-- A claim older than this is treated as abandoned (the sender crashed or
-- timed out) and the rows are picked up again.
create or replace function public.notification_claim_timeout()
returns interval
language sql
immutable
as $$ select interval '10 minutes' $$;

-- Whether anything is waiting to go out. The minute job calls the sender
-- only when this is true.
create or replace function public.notifications_due()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.notification_outbox o
     where o.send_after <= now()
       and (o.claim_token is null or o.claimed_at < now() - public.notification_claim_timeout())
  );
$$;

revoke all on function public.notifications_due() from public, anon, authenticated;
grant execute on function public.notifications_due() to service_role;

-- Marks up to p_limit due rows as being sent and returns them, with the
-- token that finish_notifications() needs. Two senders running at once never
-- get the same row (skip locked).
create or replace function public.claim_notifications(p_limit integer default 500)
returns table (
  id bigint,
  profile_id uuid,
  kind text,
  title text,
  body text,
  url text,
  claim_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_token uuid := gen_random_uuid();
begin
  return query
  with due as (
    select o.id
      from public.notification_outbox o
     where o.send_after <= now()
       and (o.claim_token is null or o.claimed_at < now() - public.notification_claim_timeout())
     order by o.send_after, o.id
     limit greatest(1, least(p_limit, 1000))
     for update skip locked
  )
  update public.notification_outbox o
     set claim_token = v_token,
         claimed_at = now()
    from due
   where o.id = due.id
  returning o.id, o.profile_id, o.kind, o.title, o.body, o.url, o.claim_token;
end;
$$;

revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;

-- After a send: rows in p_done are deleted; rows in p_retry go back in the
-- queue with a growing wait (2, 4, 8, 16 minutes) and are dropped after the
-- fifth failed try. Rows changed since they were claimed (their token was
-- cleared) are left alone, so their newer wording still goes out.
-- Returns how many rows were dropped.
create or replace function public.finish_notifications(
  p_claim_token uuid,
  p_done bigint[],
  p_retry bigint[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dropped integer;
begin
  delete from public.notification_outbox
   where claim_token = p_claim_token and id = any (coalesce(p_done, '{}'));

  update public.notification_outbox
     set attempts = attempts + 1,
         claim_token = null,
         claimed_at = null,
         send_after = now() + make_interval(mins => 2 * power(2, attempts)::integer)
   where claim_token = p_claim_token and id = any (coalesce(p_retry, '{}'));

  delete from public.notification_outbox
   where attempts >= 5 and claim_token is null and id = any (coalesce(p_retry, '{}'));
  get diagnostics v_dropped = row_count;
  return v_dropped;
end;
$$;

revoke all on function public.finish_notifications(uuid, bigint[], bigint[]) from public, anon, authenticated;
grant execute on function public.finish_notifications(uuid, bigint[], bigint[]) to service_role;

-- ============================================================
-- Minute schedule
-- ============================================================

-- Uses the same two Vault secrets as the hourly reminder job (0004):
-- project_url and reminders_cron_secret. The function reads the matching
-- CRON_SECRET, which is already set for the project's functions.
-- With push switched off (notify.push), nothing is sent and the function
-- isn't called.
select cron.schedule(
  'send-notifications',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb
  )
  where public.notifications_due()
    and public.flag_enabled('notify.push', true);
  $$
);
