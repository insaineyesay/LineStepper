-- Paid posting (PRD "Collecting the $0.99 posting fee").
-- Publishing an event costs one post credit. Credits are bought with Stripe
-- on the web (supabase/functions/stripe-webhook) and, later, with Apple and
-- Google in-app purchase. Every purchase and every spend is a row in one
-- ledger; the balance is the sum of the rows.
--
-- Publishing goes through publish_event(), which spends the credit and
-- publishes in one transaction. A trigger blocks every other way of
-- publishing, so the rule holds even if a client skips the app's checks.

-- ============================================================
-- Flag helper
-- ============================================================

-- feature_flags is readable only by the service role. This lets the
-- database itself check a runtime override. With no row, the default from
-- packages/shared/src/flags/registry.ts applies (passed in by the caller).
create or replace function public.flag_enabled(p_key text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select enabled from public.feature_flags where key = p_key), p_default);
$$;

revoke all on function public.flag_enabled(text, boolean) from public;
grant execute on function public.flag_enabled(text, boolean) to anon, authenticated, service_role;

-- ============================================================
-- Ledger
-- ============================================================

create table public.post_credit_ledger (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- +N for a purchase or grant, -1 for a post, -N for a refund.
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('purchase', 'post', 'refund', 'grant', 'adjustment')),
  source text check (source in ('stripe', 'apple', 'google', 'admin')),
  -- The store's ID for this purchase or refund. Unique, so a webhook that
  -- arrives twice can't grant credits twice.
  external_id text unique,
  -- Stripe payment intent (or store transaction) a refund is matched against.
  payment_ref text,
  event_id uuid references public.events (id) on delete set null,
  created_at timestamptz not null default now()
);

create index post_credit_ledger_profile_idx on public.post_credit_ledger (profile_id);
create index post_credit_ledger_payment_ref_idx on public.post_credit_ledger (payment_ref);
-- An event is charged once, however many times it is unpublished and republished.
create unique index post_credit_ledger_one_charge_per_event
  on public.post_credit_ledger (event_id) where reason = 'post';

alter table public.post_credit_ledger enable row level security;

-- Users see their own history. Nobody writes from the client: purchases come
-- from webhooks (service role) and spends from publish_event().
create policy "users read own credit history"
  on public.post_credit_ledger for select using ((select auth.uid()) = profile_id);

create or replace function public.post_credit_balance()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(delta), 0)::integer
    from public.post_credit_ledger
   where profile_id = auth.uid();
$$;

revoke all on function public.post_credit_balance() from public, anon;
grant execute on function public.post_credit_balance() to authenticated;

-- ============================================================
-- Publishing
-- ============================================================

-- Publishes one of the caller's events, spending a credit the first time.
-- Raises 'no_post_credits' when the balance is zero.
create or replace function public.publish_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organizer uuid;
  v_status public.event_status;
  v_balance integer;
begin
  if auth.uid() is null then
    raise exception 'sign in to post events';
  end if;

  select organizer_id, status into v_organizer, v_status
    from public.events where id = p_event_id for update;
  if not found or v_organizer <> auth.uid() then
    raise exception 'event not found';
  end if;
  if v_status = 'published' then
    return;
  end if;

  if public.flag_enabled('events.paid_posting', true)
     and not exists (
       select 1 from public.post_credit_ledger where event_id = p_event_id and reason = 'post'
     ) then
    -- One spend at a time per user, so two taps can't both use the last credit.
    perform pg_advisory_xact_lock(hashtext('post_credits:' || auth.uid()::text));
    select coalesce(sum(delta), 0) into v_balance
      from public.post_credit_ledger where profile_id = auth.uid();
    if v_balance < 1 then
      raise exception 'no_post_credits'
        using hint = 'Buy a post to publish this event.';
    end if;
    insert into public.post_credit_ledger (profile_id, delta, reason, event_id)
    values (auth.uid(), -1, 'post', p_event_id);
  end if;

  update public.events set status = 'published' where id = p_event_id;
end;
$$;

revoke all on function public.publish_event(uuid) from public, anon;
grant execute on function public.publish_event(uuid) to authenticated;

-- Blocks publishing that didn't go through publish_event(). Not security
-- definer on purpose: current_user must be the real caller. Inside
-- publish_event() it is the function owner, so that path passes, as do the
-- service role and the SQL editor. The ledger lookup sees the caller's own
-- rows, which is all it needs.
create or replace function public.require_paid_post()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin')
     and public.flag_enabled('events.paid_posting', true)
     and not exists (
       select 1 from public.post_credit_ledger where event_id = new.id and reason = 'post'
     ) then
    raise exception 'publishing an event uses a post credit: save it as a draft, then publish it';
  end if;
  return new;
end;
$$;

create trigger events_require_paid_post
  before insert or update of status on public.events
  for each row execute function public.require_paid_post();

-- ============================================================
-- Off until payments are set up
-- ============================================================

-- Paid posting starts switched off, so running this migration changes
-- nothing for people posting today. Turn it on once Stripe is connected
-- (GETTING_STARTED.md, "Paid posting"):
--   update public.feature_flags set enabled = true where key = 'events.paid_posting';
insert into public.feature_flags (key, enabled)
values ('events.paid_posting', false)
on conflict (key) do nothing;
