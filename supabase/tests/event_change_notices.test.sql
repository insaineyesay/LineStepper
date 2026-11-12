-- Change notices for saved events (0012). Run with supabase/tests/run.sh.
\set ON_ERROR_STOP on

-- o: organizer. a: should be told. b: blocked the organizer. c: no phone.
-- d: banned. o also bookmarks their own event.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000f', 'o@example.com'),
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com');
update public.profiles set banned_at = now() where id = '00000000-0000-0000-0000-00000000000d';
insert into public.blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000f');
insert into public.push_tokens (token, profile_id, platform) values
  ('ExponentPushToken[o]', '00000000-0000-0000-0000-00000000000f', 'ios'),
  ('ExponentPushToken[a]', '00000000-0000-0000-0000-00000000000a', 'ios'),
  ('ExponentPushToken[b]', '00000000-0000-0000-0000-00000000000b', 'ios'),
  ('ExponentPushToken[d]', '00000000-0000-0000-0000-00000000000d', 'android');

insert into public.events (id, title, starts_at, venue_name, address, city, organizer_id, status) values
  ('00000000-0000-0000-0000-0000000000e1', 'Queen City Slide Night', '2030-11-21 19:00-05',
   'Uptown Social Hall', '123 Trade St', 'Charlotte', '00000000-0000-0000-0000-00000000000f', 'published'),
  ('00000000-0000-0000-0000-0000000000e2', 'Last Year''s Social', now() - interval '1 day',
   'Old Hall', null, 'Norfolk', '00000000-0000-0000-0000-00000000000f', 'published'),
  ('00000000-0000-0000-0000-0000000000e3', 'Draft Night', '2030-12-01 19:00-05',
   'Somewhere', null, 'Richmond', '00000000-0000-0000-0000-00000000000f', 'draft');
insert into public.event_bookmarks (profile_id, event_id)
select p, e from unnest(array[
  '00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c',
  '00000000-0000-0000-0000-00000000000d']::uuid[]) p
cross join unnest(array['00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2',
  '00000000-0000-0000-0000-0000000000e3']::uuid[]) e;

create function pg_temp.only_row()
returns public.notification_outbox language plpgsql as $$
declare r public.notification_outbox;
begin
  if (select count(*) from public.notification_outbox) <> 1 then
    raise exception 'FAIL: want exactly 1 outbox row, have % (%)', (select count(*) from public.notification_outbox),
      (select string_agg(profile_id::text || ' ' || kind, '; ') from public.notification_outbox);
  end if;
  select * into r from public.notification_outbox;
  if r.profile_id <> '00000000-0000-0000-0000-00000000000a' then raise exception 'FAIL: wrong recipient %', r.profile_id; end if;
  return r;
end $$;

do $$
declare r public.notification_outbox;
begin
  -- Title or description edits: nothing.
  update public.events set title = 'Queen City Slide Night!', description = 'More info' where id = '00000000-0000-0000-0000-0000000000e1';
  if exists (select 1 from public.notification_outbox) then raise exception 'FAIL: title edit queued a notice'; end if;

  -- New time: only a is told, after a 2 minute wait, with a link.
  update public.events set starts_at = '2030-11-21 20:00-05' where id = '00000000-0000-0000-0000-0000000000e1';
  r := pg_temp.only_row();
  if r.kind <> 'event_time' or r.title <> 'New time: Queen City Slide Night!'
     or r.body <> 'Thu, Nov 21 at 8:00 PM · Uptown Social Hall, 123 Trade St, Charlotte'
     or r.url <> '/event/00000000-0000-0000-0000-0000000000e1'
     or r.dedupe_key <> 'event:00000000-0000-0000-0000-0000000000e1'
     or r.send_after not between now() + interval '119 seconds' and now() + interval '121 seconds' then
    raise exception 'FAIL: time notice wrong: %', row_to_json(r);
  end if;

  -- Then a new place, before it went out: one notice, both changes.
  update public.events set venue_name = 'Grand Ballroom', address = null where id = '00000000-0000-0000-0000-0000000000e1';
  r := pg_temp.only_row();
  if r.kind <> 'event_time_place' or r.title <> 'New time and place: Queen City Slide Night!'
     or r.body <> 'Thu, Nov 21 at 8:00 PM · Grand Ballroom, Charlotte' then
    raise exception 'FAIL: merged notice wrong: %', row_to_json(r);
  end if;

  -- Edits keep pushing it back, but never past 4 minutes after the first.
  update public.notification_outbox set created_at = now() - interval '3 minutes';
  update public.events set city = 'Concord' where id = '00000000-0000-0000-0000-0000000000e1';
  r := pg_temp.only_row();
  if r.kind <> 'event_time_place' or r.send_after > now() + interval '61 seconds' then
    raise exception 'FAIL: not capped at 4 minutes: %', row_to_json(r);
  end if;

  -- Cancelled: replaces the waiting notice, no link (others can't open it).
  update public.events set status = 'cancelled' where id = '00000000-0000-0000-0000-0000000000e1';
  r := pg_temp.only_row();
  if r.kind <> 'event_cancelled' or r.title <> 'Cancelled: Queen City Slide Night!' or r.url is not null
     or r.body <> 'It was set for Thu, Nov 21 at 8:00 PM. The organizer cancelled it.' then
    raise exception 'FAIL: cancel notice wrong: %', row_to_json(r);
  end if;

  -- Edits to a cancelled event: nothing new.
  delete from public.notification_outbox;
  update public.events set starts_at = '2030-11-22 20:00-05' where id = '00000000-0000-0000-0000-0000000000e1';
  if exists (select 1 from public.notification_outbox) then raise exception 'FAIL: cancelled event edit queued'; end if;

  -- Back on.
  update public.events set status = 'published' where id = '00000000-0000-0000-0000-0000000000e1';
  r := pg_temp.only_row();
  if r.kind <> 'event_restored' or r.title <> 'Back on: Queen City Slide Night!' or r.url is null then
    raise exception 'FAIL: restore notice wrong: %', row_to_json(r);
  end if;

  -- Back to draft, and removed by a moderator: "no longer listed".
  delete from public.notification_outbox;
  update public.events set status = 'draft' where id = '00000000-0000-0000-0000-0000000000e1';
  r := pg_temp.only_row();
  if r.kind <> 'event_unlisted' or r.url is not null then raise exception 'FAIL: draft notice wrong: %', row_to_json(r); end if;
  delete from public.notification_outbox;
  update public.events set status = 'published' where id = '00000000-0000-0000-0000-0000000000e1';
  delete from public.notification_outbox;
  update public.events set removed_at = now() where id = '00000000-0000-0000-0000-0000000000e1';
  r := pg_temp.only_row();
  if r.kind <> 'event_unlisted' then raise exception 'FAIL: removal notice wrong: %', row_to_json(r); end if;
  update public.events set removed_at = null where id = '00000000-0000-0000-0000-0000000000e1';

  -- Past events and drafts: nothing.
  delete from public.notification_outbox;
  update public.events set starts_at = now() - interval '2 hours', status = 'cancelled'
   where id = '00000000-0000-0000-0000-0000000000e2';
  update public.events set starts_at = '2030-12-02 19:00-05' where id = '00000000-0000-0000-0000-0000000000e3';
  if exists (select 1 from public.notification_outbox) then raise exception 'FAIL: past or draft event queued'; end if;

  -- Flag off: nothing.
  insert into public.feature_flags (key, enabled) values ('events.change_alerts', false);
  update public.events set starts_at = '2030-11-23 20:00-05' where id = '00000000-0000-0000-0000-0000000000e1';
  if exists (select 1 from public.notification_outbox) then raise exception 'FAIL: queued with the flag off'; end if;
  delete from public.feature_flags where key = 'events.change_alerts';

  -- A notice already being sent is replaced and un-claimed, so the newer one goes out too.
  update public.events set starts_at = '2030-11-24 20:00-05' where id = '00000000-0000-0000-0000-0000000000e1';
  update public.notification_outbox set claim_token = gen_random_uuid(), claimed_at = now();
  update public.events set venue_name = 'Third Hall' where id = '00000000-0000-0000-0000-0000000000e1';
  r := pg_temp.only_row();
  if r.kind <> 'event_place' or r.claim_token is not null then
    raise exception 'FAIL: claimed notice not replaced: %', row_to_json(r);
  end if;

  -- Deleted by the organizer: told, even though the bookmarks go with it.
  delete from public.notification_outbox;
  delete from public.events where id = '00000000-0000-0000-0000-0000000000e1';
  r := pg_temp.only_row();
  if r.kind <> 'event_unlisted' or r.title <> 'No longer listed: Queen City Slide Night!' then
    raise exception 'FAIL: delete notice wrong: %', row_to_json(r);
  end if;
end $$;

-- The organizer deletes their account: bookmarkers of their upcoming events are told.
delete from public.notification_outbox;
insert into public.events (id, title, starts_at, city, organizer_id, status) values
  ('00000000-0000-0000-0000-0000000000e4', 'Sunday Social', '2030-11-30 15:00-05', 'Durham',
   '00000000-0000-0000-0000-00000000000f', 'published');
insert into public.event_bookmarks (profile_id, event_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000e4');
delete from auth.users where id = '00000000-0000-0000-0000-00000000000f';
do $$
declare r public.notification_outbox := pg_temp.only_row();
begin
  if r.kind <> 'event_unlisted' or r.title <> 'No longer listed: Sunday Social' then
    raise exception 'FAIL: account deletion notice wrong: %', row_to_json(r);
  end if;
end $$;
delete from public.notification_outbox;

select 'event_change_notices: all checks passed' as result;
