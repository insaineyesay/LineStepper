-- LineStepper sample data — DEV ONLY, do not run in production.
-- Paste into the Supabase SQL editor and run once.
--
-- Creates 5 demo users (the signup trigger auto-creates their profiles),
-- 3 crews, crew memberships, and 9 events over the next 6 weeks.
-- Safe to re-run: every insert is ON CONFLICT DO NOTHING.
-- These demo users cannot log in (no password/identity is set up).

-- ============================================================
-- Demo users
-- ============================================================

insert into auth.users
  (instance_id, id, aud, role, email, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'demo.dj@linestepper.test', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"DJ Smooth Vibe"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'demo.instructor@linestepper.test', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Ms. Carla Steps"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'demo.crew.rva@linestepper.test', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Marcus Rivers"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'demo.crew.hr@linestepper.test', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Angela Brooks"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-4555-8555-555555555555',
   'authenticated', 'authenticated', 'demo.planner@linestepper.test', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Tony Events"}',
   now(), now(), '', '', '', '')
on conflict (id) do nothing;

-- The on_auth_user_created trigger has now created 5 profile rows.
-- Fill in the fields the trigger doesn't know about.

update public.profiles set handle = 'dj_smooth_vibe',  role = 'dj',            tier = 'standard', home_metro_id = 2,
  bio = 'Spinning soul line sets across VA for 10+ years.'
  where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set handle = 'carla_steps',     role = 'instructor',    tier = 'standard', home_metro_id = 1,
  bio = 'Soul line instructor — beginners welcome, always.'
  where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set handle = 'marcus_rivers',   role = 'crew_leader',   tier = 'featured', home_metro_id = 2,
  bio = 'Founder, Richmond Smooth Steppers.'
  where id = '33333333-3333-4333-8333-333333333333';
update public.profiles set handle = 'angela_brooks',   role = 'crew_leader',   tier = 'standard', home_metro_id = 1,
  bio = 'Leading the Tidewater Line Kings & Queens.'
  where id = '44444444-4444-4444-8444-444444444444';
update public.profiles set handle = 'tony_events',     role = 'event_planner', tier = 'standard', home_metro_id = 4,
  bio = 'Bringing the biggest soul line socials to the Carolinas.'
  where id = '55555555-5555-4555-8555-555555555555';

-- ============================================================
-- Crews
-- ============================================================

insert into public.crews (id, name, slug, description, home_metro_id, owner_id, is_joinable, tier) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Richmond Smooth Steppers', 'richmond-smooth-steppers',
   'Soul line dance crew hosting monthly socials across RVA. All levels welcome.',
   2, '33333333-3333-4333-8333-333333333333', true, 'featured'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Tidewater Line Kings & Queens', 'tidewater-line-kings-queens',
   'Hampton Roads'' home for soul line dancing — weekly practice in Norfolk.',
   1, '44444444-4444-4444-8444-444444444444', true, 'standard'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Queen City Sliders', 'queen-city-sliders',
   'Charlotte crew keeping the slides smooth. Come step with us.',
   4, '55555555-5555-4555-8555-555555555555', false, 'free')
on conflict (id) do nothing;

insert into public.crew_members (crew_id, profile_id, role, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'owner',  'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'member', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444', 'owner',  'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'member', 'active'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '55555555-5555-4555-8555-555555555555', 'owner',  'active')
on conflict (crew_id, profile_id) do nothing;

-- ============================================================
-- Events (spread over the next 6 weeks)
-- ============================================================

insert into public.events
  (id, title, description, starts_at, ends_at, venue_name, city, metro_id,
   organizer_id, crew_id, status, is_featured, price_text) values
  ('e0000001-0000-4000-8000-000000000001', 'Soul Line Saturday',
   'Monthly social — first hour is instruction with Ms. Carla, then open floor til midnight.',
   date_trunc('hour', now()) + interval '3 days', date_trunc('hour', now()) + interval '3 days 4 hours',
   'The Granby Ballroom', 'Norfolk', 1,
   '44444444-4444-4444-8444-444444444444', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'published', true, '$10 at the door'),
  ('e0000001-0000-4000-8000-000000000002', 'RVA Line Dance Social',
   'Richmond Smooth Steppers monthly social with DJ Smooth Vibe on the ones and twos.',
   date_trunc('hour', now()) + interval '6 days', date_trunc('hour', now()) + interval '6 days 3 hours',
   'Westover Community Center', 'Richmond', 2,
   '33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'published', true, 'Free'),
  ('e0000001-0000-4000-8000-000000000003', 'Beginner Bootcamp: Learn 5 Dances',
   'Two-hour beginner workshop. Wobble, Cupid Shuffle, and three you haven''t met yet.',
   date_trunc('hour', now()) + interval '9 days', date_trunc('hour', now()) + interval '9 days 2 hours',
   'Virginia Beach Rec Center', 'Virginia Beach', 1,
   '22222222-2222-4222-8222-222222222222', null, 'published', false, '$15'),
  ('e0000001-0000-4000-8000-000000000004', 'Queen City Slide Night',
   'Charlotte''s smoothest floor. Line dance sets all night, cash bar.',
   date_trunc('hour', now()) + interval '13 days', date_trunc('hour', now()) + interval '13 days 4 hours',
   'Uptown Social Hall', 'Charlotte', 4,
   '55555555-5555-4555-8555-555555555555', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'published', false, '$12 advance / $15 door'),
  ('e0000001-0000-4000-8000-000000000005', 'Sunday Slide & Dine',
   'Afternoon social with a soul food buffet. Bring your appetite and your slides.',
   date_trunc('hour', now()) + interval '17 days', date_trunc('hour', now()) + interval '17 days 3 hours',
   'The Carriage House', 'Raleigh', 3,
   '55555555-5555-4555-8555-555555555555', null, 'published', false, '$25 incl. buffet'),
  ('e0000001-0000-4000-8000-000000000006', 'Line Dance Explosion: VA vs NC',
   'The big one — crews from both states, dance-offs, vendors, and guest instructors.',
   date_trunc('hour', now()) + interval '24 days', date_trunc('hour', now()) + interval '24 days 6 hours',
   'Greensboro Coliseum Annex', 'Greensboro', 5,
   '55555555-5555-4555-8555-555555555555', null, 'published', true, '$30'),
  ('e0000001-0000-4000-8000-000000000007', 'Midweek Practice Social',
   'Low-key Wednesday practice — request your problem dances and drill them.',
   date_trunc('hour', now()) + interval '27 days', date_trunc('hour', now()) + interval '27 days 2 hours',
   'Westover Community Center', 'Richmond', 2,
   '33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'published', false, '$5'),
  ('e0000001-0000-4000-8000-000000000008', 'Fayetteville First Friday Social',
   'First Friday soul line social with DJ Smooth Vibe guest set.',
   date_trunc('hour', now()) + interval '31 days', date_trunc('hour', now()) + interval '31 days 4 hours',
   'All American Event Hall', 'Fayetteville', 6,
   '11111111-1111-4111-8111-111111111111', null, 'published', false, '$10'),
  ('e0000001-0000-4000-8000-000000000009', 'Steppers Anniversary Gala (draft)',
   'Planning in progress — save the date. Formal attire, live band hour.',
   date_trunc('hour', now()) + interval '40 days', date_trunc('hour', now()) + interval '40 days 5 hours',
   'TBD', 'Richmond', 2,
   '33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'draft', false, null)
on conflict (id) do nothing;
