-- New-event alerts for followers (0013). Run with supabase/tests/run.sh.
\set ON_ERROR_STOP on

-- o: organizer (followed by everyone). a: should be told. b: blocked by the
-- organizer. c: no phone. d: banned. e: follows someone else.
insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-00000000000f', 'o2@example.com'),
  ('10000000-0000-0000-0000-00000000000a', 'a2@example.com'),
  ('10000000-0000-0000-0000-00000000000b', 'b2@example.com'),
  ('10000000-0000-0000-0000-00000000000c', 'c2@example.com'),
  ('10000000-0000-0000-0000-00000000000d', 'd2@example.com'),
  ('10000000-0000-0000-0000-00000000000e', 'e2@example.com');
update public.profiles set display_name = 'DJ Smooth', handle = 'djsmooth' where id = '10000000-0000-0000-0000-00000000000f';
update public.profiles set banned_at = now() where id = '10000000-0000-0000-0000-00000000000d';
insert into public.blocks (blocker_id, blocked_id) values
  ('10000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-00000000000b');
insert into public.push_tokens (token, profile_id, platform)
select 'ExponentPushToken[' || id || ']', id, 'ios' from public.profiles
 where id::text like '10000000-%' and id <> '10000000-0000-0000-0000-00000000000c';
insert into public.follows (follower_id, followed_id)
select id, '10000000-0000-0000-0000-00000000000f' from public.profiles
 where id::text like '10000000-%' and id not in ('10000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-00000000000e');
insert into public.follows (follower_id, followed_id) values
  ('10000000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-00000000000a');

create function pg_temp.alert()
returns public.notification_outbox language plpgsql as $$
declare r public.notification_outbox;
begin
  if (select count(*) from public.notification_outbox) <> 1 then
    raise exception 'FAIL: want exactly 1 outbox row, have % (%)', (select count(*) from public.notification_outbox),
      (select string_agg(profile_id::text || ' ' || kind, '; ') from public.notification_outbox);
  end if;
  select * into r from public.notification_outbox;
  if r.profile_id <> '10000000-0000-0000-0000-00000000000a' then raise exception 'FAIL: wrong recipient %', r.profile_id; end if;
  return r;
end $$;

do $$
declare
  r public.notification_outbox;
  v_at timestamptz;
begin
  delete from public.notification_outbox;

  -- A draft: nothing yet, and the app can't mark it announced.
  insert into public.events (id, title, starts_at, city, organizer_id, status, followers_notified_at) values
    ('10000000-0000-0000-0000-0000000000e1', 'Queen City Slide Night', '2030-11-21 19:00-05', 'Charlotte',
     '10000000-0000-0000-0000-00000000000f', 'draft', now());
  if exists (select 1 from public.notification_outbox) then raise exception 'FAIL: draft alerted'; end if;
  if (select followers_notified_at from public.events where id = '10000000-0000-0000-0000-0000000000e1') is not null then
    raise exception 'FAIL: app set followers_notified_at';
  end if;

  -- Published: only a is told, after 2 minutes, with a link.
  update public.events set status = 'published' where id = '10000000-0000-0000-0000-0000000000e1';
  r := pg_temp.alert();
  if r.kind <> 'new_event' or r.title <> 'New event from DJ Smooth'
     or r.body <> 'Queen City Slide Night · Thu, Nov 21 at 7:00 PM · Charlotte'
     or r.url <> '/event/10000000-0000-0000-0000-0000000000e1'
     or r.send_after not between now() + interval '119 seconds' and now() + interval '121 seconds' then
    raise exception 'FAIL: alert wrong: %', row_to_json(r);
  end if;

  -- Fixed before it went: the waiting alert has the fix.
  update public.events set starts_at = '2030-11-21 20:00-05', title = 'Queen City Slide Nite'
   where id = '10000000-0000-0000-0000-0000000000e1';
  r := pg_temp.alert();
  if r.body <> 'Queen City Slide Nite · Thu, Nov 21 at 8:00 PM · Charlotte' then
    raise exception 'FAIL: alert not updated: %', row_to_json(r);
  end if;

  -- The app can't clear the marker to send alerts again.
  v_at := (select followers_notified_at from public.events where id = '10000000-0000-0000-0000-0000000000e1');
  update public.events set followers_notified_at = null where id = '10000000-0000-0000-0000-0000000000e1';
  if (select followers_notified_at from public.events where id = '10000000-0000-0000-0000-0000000000e1') is distinct from v_at then
    raise exception 'FAIL: marker changed';
  end if;

  -- Unpublished before it went: dropped. Published again: not sent again.
  update public.events set status = 'draft' where id = '10000000-0000-0000-0000-0000000000e1';
  if exists (select 1 from public.notification_outbox where kind = 'new_event') then raise exception 'FAIL: alert not dropped'; end if;
  update public.events set status = 'published' where id = '10000000-0000-0000-0000-0000000000e1';
  if exists (select 1 from public.notification_outbox where kind = 'new_event') then raise exception 'FAIL: alerted twice'; end if;

  -- Published straight away, then deleted before it went: dropped.
  insert into public.events (id, title, starts_at, city, organizer_id, status) values
    ('10000000-0000-0000-0000-0000000000e2', 'Sunday Social', '2030-11-30 15:00-05', null,
     '10000000-0000-0000-0000-00000000000f', 'published');
  r := pg_temp.alert();
  if r.body <> 'Sunday Social · Sat, Nov 30 at 3:00 PM' then raise exception 'FAIL: insert alert wrong: %', row_to_json(r); end if;
  delete from public.events where id = '10000000-0000-0000-0000-0000000000e2';
  if exists (select 1 from public.notification_outbox) then raise exception 'FAIL: deleted event still alerts'; end if;

  -- An alert already being sent is left alone.
  insert into public.events (id, title, starts_at, organizer_id, status) values
    ('10000000-0000-0000-0000-0000000000e3', 'Line Dance Class', '2030-12-01 18:00-05',
     '10000000-0000-0000-0000-00000000000f', 'published');
  update public.notification_outbox set claim_token = gen_random_uuid(), claimed_at = now();
  update public.events set status = 'cancelled' where id = '10000000-0000-0000-0000-0000000000e3';
  if (select count(*) from public.notification_outbox where kind = 'new_event') <> 1 then
    raise exception 'FAIL: claimed alert was dropped';
  end if;
  delete from public.notification_outbox;

  -- Past events, the flag off, and a banned organizer: nothing.
  insert into public.events (title, starts_at, organizer_id, status) values
    ('Last Week', now() - interval '7 days', '10000000-0000-0000-0000-00000000000f', 'published');
  insert into public.feature_flags (key, enabled) values ('events.follower_alerts', false);
  insert into public.events (title, starts_at, organizer_id, status) values
    ('Flag Off', '2030-12-02 18:00-05', '10000000-0000-0000-0000-00000000000f', 'published');
  delete from public.feature_flags where key = 'events.follower_alerts';
  update public.profiles set banned_at = now() where id = '10000000-0000-0000-0000-00000000000f';
  insert into public.events (title, starts_at, organizer_id, status) values
    ('Banned', '2030-12-03 18:00-05', '10000000-0000-0000-0000-00000000000f', 'published');
  update public.profiles set banned_at = null where id = '10000000-0000-0000-0000-00000000000f';
  if exists (select 1 from public.notification_outbox) then raise exception 'FAIL: past, flag-off or banned alerted'; end if;

  -- Followers of someone else aren't told; a's own followers (e) are, by handle when there's no name.
  insert into public.events (title, starts_at, organizer_id, status) values
    ('A''s Social', '2030-12-04 18:00-05', '10000000-0000-0000-0000-00000000000a', 'published');
  if (select count(*) from public.notification_outbox) <> 1
     or (select profile_id from public.notification_outbox) <> '10000000-0000-0000-0000-00000000000e' then
    raise exception 'FAIL: wrong followers for a';
  end if;
  delete from public.notification_outbox;
end $$;

select 'follower_event_alerts: all checks passed' as result;
