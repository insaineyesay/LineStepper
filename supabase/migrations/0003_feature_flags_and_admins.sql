-- Feature flags (PRD Addendum B2) and platform admins.
-- Registry defaults live in code (packages/shared/src/flags/registry.ts).
-- A row here is a runtime override set by an admin through the API.

-- ============================================================
-- Platform admins
-- ============================================================

alter table public.profiles
  add column is_admin boolean not null default false;

-- Users can edit their own profile, so stop them granting themselves admin.
-- Only the service role (the API, or the SQL editor) can change is_admin.
create or replace function public.protect_is_admin()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin')
     and (tg_op = 'INSERT' and new.is_admin
          or tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin) then
    raise exception 'is_admin can only be changed by the service role';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_is_admin
  before insert or update on public.profiles
  for each row execute function public.protect_is_admin();

-- ============================================================
-- Flags
-- ============================================================

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$'),
  enabled boolean not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Every change, who made it and when (PRD: "Every flag change is logged").
create table public.flag_audit (
  id bigint generated always as identity primary key,
  key text not null,
  previous boolean,
  enabled boolean not null,
  actor_id uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index flag_audit_key_changed_at on public.flag_audit (key, changed_at desc);

-- RLS on with no policies: only the service role (the API) can read or write.
-- Clients get effective flags from GET /flags, never from these tables.
alter table public.feature_flags enable row level security;
alter table public.flag_audit enable row level security;
