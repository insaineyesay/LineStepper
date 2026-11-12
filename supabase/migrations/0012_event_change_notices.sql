-- Change notices for saved events (PRD F3, F9).
--
-- When a published, upcoming event gets a new date or time, a new place, is
-- cancelled, or stops being listed (the organizer moves it back to draft or
-- deletes it, or a moderator removes it), everyone who bookmarked it gets a
-- push notice through the outbox (0011). When a cancelled or unlisted event
-- comes back, they're told it's back on.
--
-- Notices wait 2 minutes for further edits, and an edit within that time
-- replaces the waiting notice instead of adding another (a time change then
-- a place change becomes one "New time and place"). Each notice goes out at
-- most about 4 minutes after the first edit, so within about 5 minutes with
-- the minute job.
--
-- Not told: the organizer, banned accounts, and anyone who blocked the
-- organizer or was blocked by them. Only people with a phone registered for
-- push get a row. Switched off with the events.change_alerts flag.

-- How long a notice waits for more edits, and the longest it can be pushed back.
create or replace function public.event_notice_delay()
returns interval language sql immutable as $$ select interval '2 minutes' $$;
create or replace function public.event_notice_max_delay()
returns interval language sql immutable as $$ select interval '4 minutes' $$;

-- "Sat, Nov 21 at 7:00 PM". The launch region is all on Eastern time.
create or replace function public.event_notice_when(p_starts_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_starts_at at time zone 'America/New_York', 'Dy, Mon FMDD "at" FMHH12:MI AM');
$$;

-- "Uptown Social Hall, 123 Trade St, Charlotte", leaving out blanks.
create or replace function public.event_notice_where(p_venue text, p_address text, p_city text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(concat_ws(', ', nullif(trim(p_venue), ''), nullif(trim(p_address), ''), nullif(trim(p_city), '')), '');
$$;

-- Writes one notice for each person who should hear about this event,
-- merging with a notice still waiting for them. Kinds:
--   event_time, event_place, event_time_place, event_cancelled,
--   event_unlisted, event_restored
create or replace function public.queue_event_notice(
  p_event_id uuid,
  p_organizer_id uuid,
  p_event_title text,
  p_kind text,
  p_body text,
  p_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := left(p_event_title, 150);
begin
  insert into public.notification_outbox as o (profile_id, kind, dedupe_key, title, body, url, send_after)
  select b.profile_id,
         p_kind,
         'event:' || p_event_id,
         case p_kind
           when 'event_time' then 'New time: '
           when 'event_place' then 'New place: '
           when 'event_time_place' then 'New time and place: '
           when 'event_cancelled' then 'Cancelled: '
           when 'event_unlisted' then 'No longer listed: '
           when 'event_restored' then 'Back on: '
         end || v_title,
         p_body,
         p_url,
         now() + public.event_notice_delay()
    from public.event_bookmarks b
    join public.profiles p on p.id = b.profile_id
   where b.event_id = p_event_id
     and b.profile_id <> p_organizer_id
     and p.banned_at is null
     and exists (select 1 from public.push_tokens t where t.profile_id = b.profile_id)
     and not exists (
       select 1 from public.blocks k
        where (k.blocker_id = b.profile_id and k.blocked_id = p_organizer_id)
           or (k.blocker_id = p_organizer_id and k.blocked_id = b.profile_id)
     )
  on conflict (profile_id, dedupe_key) do update
     set kind = case
                  when o.claim_token is null
                   and o.kind in ('event_time', 'event_place', 'event_time_place')
                   and excluded.kind in ('event_time', 'event_place', 'event_time_place')
                   and o.kind <> excluded.kind
                  then 'event_time_place'
                  else excluded.kind
                end,
         title = case
                   when o.claim_token is null
                    and o.kind in ('event_time', 'event_place', 'event_time_place')
                    and excluded.kind in ('event_time', 'event_place', 'event_time_place')
                    and o.kind <> excluded.kind
                   then 'New time and place: ' || v_title
                   else excluded.title
                 end,
         body = excluded.body,
         url = excluded.url,
         -- Wait for more edits, but not past 4 minutes after the first one.
         send_after = least(excluded.send_after, o.created_at + public.event_notice_max_delay()),
         attempts = 0,
         claim_token = null,
         claimed_at = null;
end;
$$;

revoke all on function public.queue_event_notice(uuid, uuid, text, text, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Edits
-- ------------------------------------------------------------

create or replace function public.queue_event_change_notices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_listed boolean := old.status = 'published' and old.removed_at is null;
  v_is_listed boolean := new.status = 'published' and new.removed_at is null;
  v_time boolean := new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at;
  v_place boolean := new.venue_name is distinct from old.venue_name
                     or new.address is distinct from old.address
                     or new.city is distinct from old.city
                     or new.zip is distinct from old.zip;
  v_when text := public.event_notice_when(new.starts_at);
  v_where text := public.event_notice_where(new.venue_name, new.address, new.city);
  v_kind text;
  v_body text;
  v_url text := '/event/' || new.id;
begin
  -- Past events don't need notices.
  if greatest(old.starts_at, new.starts_at) <= now() then
    return null;
  end if;
  if not public.flag_enabled('events.change_alerts', true) then
    return null;
  end if;

  if v_was_listed and v_is_listed then
    if not (v_time or v_place) then
      return null;
    end if;
    v_kind := case when v_time and v_place then 'event_time_place'
                   when v_time then 'event_time'
                   else 'event_place' end;
    v_body := v_when || coalesce(' · ' || v_where, '');
  elsif v_was_listed and new.status = 'cancelled' then
    v_kind := 'event_cancelled';
    v_body := 'It was set for ' || public.event_notice_when(old.starts_at) || '. The organizer cancelled it.';
    v_url := null; -- cancelled events aren't shown to others
  elsif v_was_listed then
    -- Back to draft, or removed by a moderator.
    v_kind := 'event_unlisted';
    v_body := 'It was set for ' || public.event_notice_when(old.starts_at)
              || '. It''s no longer listed; check with the organizer before you go.';
    v_url := null;
  elsif v_is_listed and old.status in ('cancelled', 'draft') then
    v_kind := 'event_restored';
    v_body := v_when || coalesce(' · ' || v_where, '');
  else
    return null;
  end if;

  perform public.queue_event_notice(new.id, new.organizer_id, new.title, v_kind, v_body, v_url);
  return null;
end;
$$;

create trigger events_queue_change_notices
  after update on public.events
  for each row
  execute function public.queue_event_change_notices();

-- ------------------------------------------------------------
-- Deletes (the organizer deletes it, or deletes their account)
-- ------------------------------------------------------------

-- Before the delete, while the bookmarks still exist (they cascade away).
create or replace function public.queue_event_deleted_notices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'published' and old.removed_at is null and old.starts_at > now()
     and public.flag_enabled('events.change_alerts', true) then
    perform public.queue_event_notice(
      old.id, old.organizer_id, old.title, 'event_unlisted',
      'It was set for ' || public.event_notice_when(old.starts_at)
        || '. It''s no longer listed; check with the organizer before you go.',
      null
    );
  end if;
  return old;
end;
$$;

create trigger events_queue_deleted_notices
  before delete on public.events
  for each row
  execute function public.queue_event_deleted_notices();
