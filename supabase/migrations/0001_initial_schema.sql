-- LineStepper initial schema
-- Run via Supabase SQL editor or `supabase db push`.

-- ============================================================
-- Enums
-- ============================================================

create type public.profile_role as enum (
  'dancer',
  'crew_leader',
  'dj',
  'instructor',
  'event_planner',
  'vendor'
);

-- Paid tiers apply to non-dancer roles; dancers stay 'free'.
create type public.account_tier as enum ('free', 'standard', 'featured');

create type public.event_status as enum ('draft', 'published', 'cancelled');

create type public.crew_member_role as enum ('owner', 'admin', 'member');
create type public.crew_member_status as enum ('pending', 'active', 'removed');

-- ============================================================
-- Metros (launch region: Hampton Roads, Richmond, NC)
-- ============================================================

create table public.metros (
  id smallint generated always as identity primary key,
  name text not null unique,
  state text not null
);

insert into public.metros (name, state) values
  ('Hampton Roads', 'VA'),
  ('Richmond', 'VA'),
  ('Raleigh-Durham', 'NC'),
  ('Charlotte', 'NC'),
  ('Greensboro / Triad', 'NC'),
  ('Fayetteville', 'NC'),
  ('Northern VA / DC', 'VA');

-- ============================================================
-- Profiles (1:1 with auth.users, created by trigger on signup)
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name text,
  role public.profile_role not null default 'dancer',
  tier public.account_tier not null default 'free',
  bio text,
  avatar_url text,
  home_metro_id smallint references public.metros (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Crews
-- ============================================================

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  description text,
  logo_url text,
  home_metro_id smallint references public.metros (id),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  -- Paid feature: crew is discoverable and accepts join requests in-app.
  is_joinable boolean not null default false,
  tier public.account_tier not null default 'free',
  merch_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crew_members (
  crew_id uuid not null references public.crews (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.crew_member_role not null default 'member',
  status public.crew_member_status not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (crew_id, profile_id)
);

-- ============================================================
-- Events
-- ============================================================

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text,
  address text,
  city text,
  metro_id smallint references public.metros (id),
  flyer_url text,
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  crew_id uuid references public.crews (id) on delete set null,
  status public.event_status not null default 'draft',
  is_featured boolean not null default false,
  price_text text,          -- e.g. "$10 at the door", "Free"
  ticket_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index events_starts_at_idx on public.events (starts_at);
create index events_metro_idx on public.events (metro_id);
create index events_organizer_idx on public.events (organizer_id);

-- ============================================================
-- Bookmarks (drives reminders) and follows
-- ============================================================

create table public.event_bookmarks (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  reminder_sent boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (profile_id, event_id)
);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

-- ============================================================
-- Billing (Stripe linkage; managed by web dashboard, not the app)
-- ============================================================

create table public.subscriptions (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  tier public.account_tier not null default 'free',
  status text,              -- mirrors Stripe subscription status
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Triggers
-- ============================================================

-- Auto-create a profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger crews_updated_at before update on public.crews
  for each row execute function public.set_updated_at();
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.metros enable row level security;
alter table public.profiles enable row level security;
alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.events enable row level security;
alter table public.event_bookmarks enable row level security;
alter table public.follows enable row level security;
alter table public.subscriptions enable row level security;

-- Metros: public read.
create policy "metros are readable by everyone"
  on public.metros for select using (true);

-- Profiles: public read, self write.
create policy "profiles are readable by everyone"
  on public.profiles for select using (true);
create policy "users can update own profile"
  on public.profiles for update using ((select auth.uid()) = id);

-- Crews: public read; owner manages.
create policy "crews are readable by everyone"
  on public.crews for select using (true);
create policy "authenticated users can create crews"
  on public.crews for insert with check ((select auth.uid()) = owner_id);
create policy "owner can update crew"
  on public.crews for update using ((select auth.uid()) = owner_id);
create policy "owner can delete crew"
  on public.crews for delete using ((select auth.uid()) = owner_id);

-- Crew members: public read of active members; self-service join requests;
-- crew owner manages membership.
create policy "active memberships are readable by everyone"
  on public.crew_members for select
  using (status = 'active' or (select auth.uid()) = profile_id
         or (select auth.uid()) = (select owner_id from public.crews c where c.id = crew_id));
create policy "users can request to join joinable crews"
  on public.crew_members for insert
  with check (
    (select auth.uid()) = profile_id
    and status = 'pending'
    and role = 'member'
    and (select is_joinable from public.crews c where c.id = crew_id)
  );
create policy "crew owner manages members"
  on public.crew_members for update
  using ((select auth.uid()) = (select owner_id from public.crews c where c.id = crew_id));
create policy "members can leave, owner can remove"
  on public.crew_members for delete
  using ((select auth.uid()) = profile_id
         or (select auth.uid()) = (select owner_id from public.crews c where c.id = crew_id));

-- Events: published events public; organizers see and manage their own.
create policy "published events are readable by everyone"
  on public.events for select
  using (status = 'published' or (select auth.uid()) = organizer_id);
create policy "organizers can create events"
  on public.events for insert with check ((select auth.uid()) = organizer_id);
create policy "organizers can update own events"
  on public.events for update using ((select auth.uid()) = organizer_id);
create policy "organizers can delete own events"
  on public.events for delete using ((select auth.uid()) = organizer_id);

-- Bookmarks: private to the user.
create policy "users manage own bookmarks"
  on public.event_bookmarks for all
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

-- Follows: public read (follower counts), self write.
create policy "follows are readable by everyone"
  on public.follows for select using (true);
create policy "users manage own follows"
  on public.follows for insert with check ((select auth.uid()) = follower_id);
create policy "users can unfollow"
  on public.follows for delete using ((select auth.uid()) = follower_id);

-- Subscriptions: user can read own; writes happen server-side
-- (service role from Stripe webhooks) and bypass RLS.
create policy "users can read own subscription"
  on public.subscriptions for select using ((select auth.uid()) = profile_id);
