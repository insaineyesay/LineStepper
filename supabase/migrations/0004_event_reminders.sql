-- Event reminders (roadmap step 3).
-- The app saves each device's Expo push token here. Every hour, pg_cron calls
-- the send-reminders edge function (supabase/functions/send-reminders), which
-- claims bookmarks for events starting in the next 24 hours and sends one
-- push notification per bookmark per device.

-- ============================================================
-- Push tokens
-- ============================================================

create table public.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[.+\]$'),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_tokens_profile_id_idx on public.push_tokens (profile_id);

alter table public.push_tokens enable row level security;

create policy "users read own push tokens"
  on public.push_tokens for select using ((select auth.uid()) = profile_id);
create policy "users delete own push tokens"
  on public.push_tokens for delete using ((select auth.uid()) = profile_id);

-- Saving a token goes through this function, not a direct insert: when a
-- phone changes hands (one person signs out, another signs in), the token
-- must move to the new user, and RLS would not let them update a row that
-- belongs to someone else.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in to register for notifications';
  end if;
  insert into public.push_tokens (token, profile_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update
    set profile_id = excluded.profile_id,
        platform = excluded.platform,
        last_seen_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- ============================================================
-- Claiming due reminders
-- ============================================================

-- Marks due bookmarks as sent and returns them, in one statement, so two
-- overlapping runs can never send the same reminder twice. Only bookmarks
-- whose owner has a device are claimed: someone who turns notifications on
-- later still gets reminded. The edge function un-marks any it fails to send.
create or replace function public.claim_due_reminders(p_within interval default interval '24 hours')
returns table (
  profile_id uuid,
  event_id uuid,
  title text,
  starts_at timestamptz,
  venue_name text,
  city text
)
language sql
security definer
set search_path = ''
as $$
  update public.event_bookmarks b
     set reminder_sent = true
    from public.events e
   where e.id = b.event_id
     and not b.reminder_sent
     and e.status = 'published'
     and e.starts_at > now()
     and e.starts_at <= now() + p_within
     and exists (select 1 from public.push_tokens t where t.profile_id = b.profile_id)
  returning b.profile_id, e.id, e.title, e.starts_at, e.venue_name, e.city;
$$;

revoke all on function public.claim_due_reminders(interval) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(interval) to service_role;

-- When an event moves to a new time, everyone who bookmarked it gets a fresh
-- reminder for the new time.
create or replace function public.reset_reminders_on_reschedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.event_bookmarks
     set reminder_sent = false
   where event_id = new.id;
  return new;
end;
$$;

create trigger events_reset_reminders_on_reschedule
  after update of starts_at on public.events
  for each row
  when (new.starts_at is distinct from old.starts_at)
  execute function public.reset_reminders_on_reschedule();

-- ============================================================
-- Hourly schedule
-- ============================================================

-- Needs two Vault secrets (see GETTING_STARTED.md, "Event reminders"):
--   project_url            https://<project-ref>.supabase.co
--   reminders_cron_secret  same value as the function's CRON_SECRET
-- Until they exist the job runs but the request fails harmlessly.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'send-event-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
