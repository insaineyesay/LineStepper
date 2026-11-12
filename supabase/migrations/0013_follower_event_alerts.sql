-- New-event alerts for followers (PRD F9).
--
-- The first time an upcoming event is published, everyone who follows its
-- organizer gets a push alert through the outbox (0011). It waits 2 minutes,
-- like change notices: if the organizer fixes the event in that time the
-- alert carries the fix, and if they unpublish or delete it the alert is
-- dropped. Re-publishing an event later (after a cancel or a move back to
-- draft) doesn't alert followers again; people who saved it get a "Back on"
-- notice instead (0012).
--
-- Not told: banned accounts, anyone in a block with the organizer (either
-- direction), and people with no phone registered for push. Nothing is sent
-- for a banned organizer. Switched off with the events.follower_alerts flag.

-- When followers were told about this event. Set by the database only.
alter table public.events add column followers_notified_at timestamptz;

-- Events already out there count as announced, so editing them later
-- doesn't send "new event" alerts.
update public.events
   set followers_notified_at = coalesce(updated_at, created_at)
 where status in ('published', 'cancelled');

-- Finding the waiting alerts for one event (to update or drop them).
create index notification_outbox_dedupe_key_idx on public.notification_outbox (dedupe_key);

-- ------------------------------------------------------------
-- Marking the first publish
-- ------------------------------------------------------------

-- Only this trigger sets followers_notified_at: whatever the app sends is
-- ignored. Runs before the row is saved, so the after-trigger below can see
-- whether this save is the first publish.
create or replace function public.mark_followers_notified()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.followers_notified_at := null;
  else
    new.followers_notified_at := old.followers_notified_at;
  end if;
  if new.status = 'published' and new.removed_at is null and new.followers_notified_at is null then
    new.followers_notified_at := now();
  end if;
  return new;
end;
$$;

create trigger events_mark_followers_notified
  before insert or update on public.events
  for each row
  execute function public.mark_followers_notified();

-- ------------------------------------------------------------
-- Queuing, updating and dropping alerts
-- ------------------------------------------------------------

create or replace function public.follower_alert_title(p_organizer_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'New event from ' || left(coalesce(nullif(trim(p.display_name), ''), '@' || p.handle, 'someone you follow'), 80)
    from public.profiles p where p.id = p_organizer_id;
$$;

revoke all on function public.follower_alert_title(uuid) from public, anon, authenticated;

-- "Queen City Slide Night · Sat, Nov 21 at 7:00 PM · Charlotte"
create or replace function public.follower_alert_body(p_title text, p_starts_at timestamptz, p_city text)
returns text
language sql
stable
set search_path = ''
as $$
  select left(p_title, 200) || ' · ' || public.event_notice_when(p_starts_at)
         || coalesce(' · ' || nullif(trim(p_city), ''), '');
$$;

create or replace function public.queue_follower_event_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'new_event:' || new.id;
  v_listed boolean := new.status = 'published' and new.removed_at is null;
begin
  -- First publish: tell the organizer's followers.
  if new.followers_notified_at is not null
     and (tg_op = 'INSERT' or old.followers_notified_at is null) then
    if new.starts_at > now()
       and public.flag_enabled('events.follower_alerts', true)
       and not public.is_banned(new.organizer_id) then
      insert into public.notification_outbox (profile_id, kind, dedupe_key, title, body, url, send_after)
      select f.follower_id,
             'new_event',
             v_key,
             public.follower_alert_title(new.organizer_id),
             public.follower_alert_body(new.title, new.starts_at, new.city),
             '/event/' || new.id,
             now() + public.event_notice_delay()
        from public.follows f
        join public.profiles p on p.id = f.follower_id
       where f.followed_id = new.organizer_id
         and p.banned_at is null
         and exists (select 1 from public.push_tokens t where t.profile_id = f.follower_id)
         and not exists (
           select 1 from public.blocks k
            where (k.blocker_id = f.follower_id and k.blocked_id = new.organizer_id)
               or (k.blocker_id = new.organizer_id and k.blocked_id = f.follower_id)
         )
      on conflict (profile_id, dedupe_key) do nothing;
    end if;
    return null;
  end if;

  if tg_op = 'UPDATE' then
    if v_listed then
      -- Edited while the alert is still waiting: send the new details.
      update public.notification_outbox
         set body = public.follower_alert_body(new.title, new.starts_at, new.city)
       where dedupe_key = v_key and claim_token is null
         and body is distinct from public.follower_alert_body(new.title, new.starts_at, new.city);
    else
      -- Unpublished, cancelled or removed before the alert went: drop it.
      delete from public.notification_outbox where dedupe_key = v_key and claim_token is null;
    end if;
  end if;
  return null;
end;
$$;

create trigger events_queue_follower_alerts
  after insert or update on public.events
  for each row
  execute function public.queue_follower_event_alerts();

create or replace function public.drop_follower_event_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notification_outbox where dedupe_key = 'new_event:' || old.id and claim_token is null;
  return old;
end;
$$;

create trigger events_drop_follower_alerts
  before delete on public.events
  for each row
  execute function public.drop_follower_event_alerts();
