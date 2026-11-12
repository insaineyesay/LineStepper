-- Just enough of Supabase for the migrations to run on plain Postgres, for
-- the tests in this folder. Not used on the real project.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create schema storage;
create schema extensions;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- auth.uid() and auth.role() read the same settings PostgREST sets:
--   select set_config('request.jwt.claim.sub', '<uuid>', false);
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;

create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);

-- pg_cron, pg_net and Vault: the jobs are recorded, and "HTTP calls" land in
-- net.calls, so tests can run a job's SQL and see whether it called out.
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (n, s, c)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid $$;
create function cron.unschedule(n text) returns boolean language sql
  as $$ delete from cron.job where jobname = n returning true $$;
create schema net;
create table net.calls (id bigserial primary key, url text, headers jsonb, body jsonb, at timestamptz default now());
create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}') returns bigint
  language sql as $$ insert into net.calls (url, headers, body) values (url, headers, body) returning id $$;
create schema vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values
  ('project_url', 'https://example.supabase.co'),
  ('reminders_cron_secret', 'test-secret');
