-- Report, block and ban (PRD F11/F12; App Store guideline 1.2 for apps with
-- content people post).
--
-- Who does what:
--   * Anyone signed in can report an event, crew or profile, and block a
--     person. Both go through the API, which writes here with the service role.
--   * Blocking hides both people from each other: profiles, events, crews and
--     crew member lists. Follows between them are removed by the API.
--   * Admins (profiles.is_admin) resolve reports through the API: dismiss,
--     remove the event or crew, or ban the person. A ban hides everything they
--     posted, stops them signing in (Supabase's own ban) and keeps their email
--     from signing up again.
--   * Every admin action is written to moderation_actions.

-- ------------------------------------------------------------
-- Bans and removals
-- ------------------------------------------------------------

alter table public.profiles add column banned_at timestamptz;
alter table public.events add column removed_at timestamptz;
alter table public.crews add column removed_at timestamptz;

-- Only the service role (the API, or the SQL editor) can set or clear these;
-- an owner editing their own row can't undo a ban or a removal.
create or replace function public.protect_moderation_columns()
returns trigger
language plpgsql
as $$
begin
  -- Same test as protect_is_admin() in 0003.
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    -- Nested ifs: plpgsql may evaluate both sides of an AND, and events and
    -- crews have no banned_at column.
    if tg_table_name = 'profiles' then
      if new.banned_at is distinct from old.banned_at then
        raise exception 'banned_at can only be changed by moderators';
      end if;
    elsif new.removed_at is distinct from old.removed_at then
      raise exception 'removed_at can only be changed by moderators';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_moderation before update on public.profiles
  for each row execute function public.protect_moderation_columns();
create trigger events_protect_moderation before update on public.events
  for each row execute function public.protect_moderation_columns();
create trigger crews_protect_moderation before update on public.crews
  for each row execute function public.protect_moderation_columns();

-- Emails of banned people, hashed (sha256 of the lower-cased address), so a
-- new account with the same email starts out banned. Only the API reads it.
create table public.banned_emails (
  email_hash text primary key,
  banned_at timestamptz not null default now()
);
alter table public.banned_emails enable row level security;

create or replace function public.email_hash(p_email text)
returns text
language sql
immutable
as $$ select encode(sha256(convert_to(lower(trim(p_email)), 'UTF8')), 'hex') $$;

-- Profile creation on sign-up (from 0001), now marking banned emails.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, banned_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    case when exists (
      select 1 from public.banned_emails b where b.email_hash = public.email_hash(new.email)
    ) then now() end
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Blocks
-- ------------------------------------------------------------

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_id on public.blocks (blocked_id);

alter table public.blocks enable row level security;
-- People see the list of who they blocked; writes go through the API.
create policy "users read own blocks"
  on public.blocks for select using ((select auth.uid()) = blocker_id);

-- Whether the signed-in person should not see this profile's content: it's
-- banned, or either of them blocked the other. Security definer because the
-- blocked person can't read the blocker's rows in blocks.
create or replace function public.is_hidden_profile(p_profile uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_profile and p.banned_at is not null)
      or exists (
        select 1 from public.blocks b
         where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_profile)
            or (b.blocker_id = p_profile and b.blocked_id = (select auth.uid()))
      );
$$;

create or replace function public.is_banned(p_profile uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$ select exists (select 1 from public.profiles p where p.id = p_profile and p.banned_at is not null) $$;

-- ------------------------------------------------------------
-- What people can see (replaces the 0001 read policies)
-- ------------------------------------------------------------

drop policy "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable unless hidden"
  on public.profiles for select
  using (id = (select auth.uid()) or not public.is_hidden_profile(id));

drop policy "crews are readable by everyone" on public.crews;
create policy "crews are readable unless removed or hidden"
  on public.crews for select
  using (owner_id = (select auth.uid())
         or (removed_at is null and not public.is_hidden_profile(owner_id)));

drop policy "active memberships are readable by everyone" on public.crew_members;
create policy "memberships are readable unless hidden"
  on public.crew_members for select
  using ((status = 'active' and not public.is_hidden_profile(profile_id))
         or (select auth.uid()) = profile_id
         or (select auth.uid()) = (select owner_id from public.crews c where c.id = crew_id));

drop policy "published events are readable by everyone" on public.events;
create policy "published events are readable unless removed or hidden"
  on public.events for select
  using ((select auth.uid()) = organizer_id
         or (status = 'published' and removed_at is null and not public.is_hidden_profile(organizer_id)));

-- ------------------------------------------------------------
-- Banned people can't post, join or follow
-- ------------------------------------------------------------

drop policy "organizers can create events" on public.events;
create policy "organizers can create events"
  on public.events for insert
  with check ((select auth.uid()) = organizer_id and not public.is_banned((select auth.uid())));

drop policy "authenticated users can create crews" on public.crews;
create policy "authenticated users can create crews"
  on public.crews for insert
  with check ((select auth.uid()) = owner_id and not public.is_banned((select auth.uid())));

drop policy "users can request to join joinable crews" on public.crew_members;
create policy "users can request to join joinable crews"
  on public.crew_members for insert
  with check (
    (select auth.uid()) = profile_id
    and status = 'pending'
    and role = 'member'
    and (select is_joinable from public.crews c where c.id = crew_id)
    and not public.is_banned((select auth.uid()))
  );

drop policy "users manage own follows" on public.follows;
create policy "users manage own follows"
  on public.follows for insert
  with check ((select auth.uid()) = follower_id
              and not public.is_banned((select auth.uid()))
              and not public.is_hidden_profile(followed_id));

-- ------------------------------------------------------------
-- Reports and the moderation log (API only)
-- ------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('event', 'crew', 'profile')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'fake', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);
-- One open report per person per thing; reporting again is a no-op.
create unique index reports_one_open_per_reporter
  on public.reports (reporter_id, target_type, target_id) where status = 'open';
create index reports_open on public.reports (created_at) where status = 'open';
alter table public.reports enable row level security;

create table public.moderation_actions (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  report_id uuid references public.reports (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.moderation_actions enable row level security;
