-- Outbox queue rules (0011). Run with supabase/tests/run.sh.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@example.com');

-- Signed-in people can't read or write the outbox.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
begin
  begin
    perform 1 from public.notification_outbox;
    raise exception 'FAIL: authenticated can read the outbox';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_notifications(10);
    raise exception 'FAIL: authenticated can claim';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

insert into public.notification_outbox (profile_id, kind, dedupe_key, title, body, url) values
  ('00000000-0000-0000-0000-0000000000a1', 'event_update', 'event:1', 'T1', 'B1', '/event/00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000b2', 'event_update', 'event:1', 'T1', 'B1', null);
insert into public.notification_outbox (profile_id, kind, dedupe_key, title, body, send_after) values
  ('00000000-0000-0000-0000-0000000000a1', 'new_event', 'later', 'T2', 'B2', now() + interval '1 hour');

-- One waiting notice per person per key.
do $$
begin
  insert into public.notification_outbox (profile_id, kind, dedupe_key, title, body)
  values ('00000000-0000-0000-0000-0000000000a1', 'event_update', 'event:1', 'dup', 'dup');
  raise exception 'FAIL: duplicate key accepted';
exception when unique_violation then null;
end $$;

set role service_role;
do $$
declare
  v_token uuid;
  v_ids bigint[];
  v_n integer;
begin
  if not public.notifications_due() then raise exception 'FAIL: nothing due'; end if;

  select array_agg(id order by id), min(claim_token::text)::uuid into v_ids, v_token
    from public.claim_notifications(10);
  if cardinality(v_ids) <> 2 then raise exception 'FAIL: claimed % rows, want 2 (future row must wait)', cardinality(v_ids); end if;

  -- Claimed rows aren't due and can't be claimed again.
  if public.notifications_due() then raise exception 'FAIL: claimed rows still due'; end if;
  select count(*) into v_n from public.claim_notifications(10);
  if v_n <> 0 then raise exception 'FAIL: claimed twice'; end if;

  -- First done, second retried.
  v_n := public.finish_notifications(v_token, array[v_ids[1]], array[v_ids[2]]);
  if v_n <> 0 then raise exception 'FAIL: dropped % on first retry', v_n; end if;
  if exists (select 1 from public.notification_outbox where id = v_ids[1]) then raise exception 'FAIL: done row kept'; end if;
  if not exists (select 1 from public.notification_outbox where id = v_ids[2] and attempts = 1
                   and claim_token is null and send_after > now() + interval '1 minute') then
    raise exception 'FAIL: retry not rescheduled';
  end if;

  -- After the fifth failure the row is dropped.
  update public.notification_outbox set send_after = now() - interval '1 second', attempts = 4 where id = v_ids[2];
  select min(claim_token::text)::uuid into v_token from public.claim_notifications(10);
  v_n := public.finish_notifications(v_token, null, array[v_ids[2]]);
  if v_n <> 1 or exists (select 1 from public.notification_outbox where id = v_ids[2]) then
    raise exception 'FAIL: fifth failure not dropped';
  end if;

  -- A row edited while it's being sent is not deleted by the sender.
  update public.notification_outbox set send_after = now() - interval '1 second' where dedupe_key = 'later';
  select min(claim_token::text)::uuid, min(id) into v_token, v_n from public.claim_notifications(10);
  update public.notification_outbox set title = 'T2 newer', claim_token = null, claimed_at = null where id = v_n;
  perform public.finish_notifications(v_token, array[v_n::bigint], null);
  if not exists (select 1 from public.notification_outbox where id = v_n and title = 'T2 newer') then
    raise exception 'FAIL: edited row lost';
  end if;

  -- An abandoned claim is picked up again after the timeout.
  perform public.claim_notifications(10);
  update public.notification_outbox set claimed_at = now() - interval '11 minutes' where id = v_n;
  if not public.notifications_due() then raise exception 'FAIL: abandoned claim not due'; end if;
  select count(*) into v_n from public.claim_notifications(10);
  if v_n <> 1 then raise exception 'FAIL: abandoned claim not reclaimed'; end if;
end $$;
reset role;

-- Rows go when the person's account does.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
do $$
begin
  if exists (select 1 from public.notification_outbox where profile_id = '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'FAIL: rows outlived the account';
  end if;
end $$;

-- The minute job only calls the sender when something is due and push is on.
do $$
declare
  v_cmd text := (select command from cron.job where jobname = 'send-notifications');
  v_before bigint := (select count(*) from net.calls);
begin
  delete from public.notification_outbox;
  execute v_cmd;
  if (select count(*) from net.calls) <> v_before then raise exception 'FAIL: called with nothing due'; end if;

  insert into public.notification_outbox (profile_id, kind, dedupe_key, title, body)
  values ('00000000-0000-0000-0000-0000000000b2', 'new_event', 'x', 'T', 'B');
  insert into public.feature_flags (key, enabled) values ('notify.push', false);
  execute v_cmd;
  if (select count(*) from net.calls) <> v_before then raise exception 'FAIL: called with push off'; end if;

  delete from public.feature_flags where key = 'notify.push';
  execute v_cmd;
  if (select count(*) from net.calls) <> v_before + 1 then raise exception 'FAIL: not called when due'; end if;
  if (select url from net.calls order by id desc limit 1) <> 'https://example.supabase.co/functions/v1/send-notifications' then
    raise exception 'FAIL: wrong url';
  end if;
  delete from public.notification_outbox;
end $$;

select 'notification_outbox: all checks passed' as result;
