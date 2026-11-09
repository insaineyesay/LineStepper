-- Radius search (PRD F2: "ZIP or current location, radius 5 / 10 / 25 / 50 / 100 mi").
-- Everything runs in our own database; no map or geocoding service.
-- - zip_codes: the center point of every US ZIP area, from the Census
--   Bureau's 2025 ZCTA Gazetteer (public domain). Load it from
--   supabase/data/zip_codes.csv after running this file (GETTING_STARTED.md).
-- - Events get a ZIP; a trigger turns it into a point. Events without one use
--   their area's center, so older events still show up in nearby searches.
-- - events_near() returns upcoming published events within N miles of a point.
-- Per the PRD, a person's precise location is never stored: the app sends
-- its position with the search and nothing is saved. Profiles store a ZIP only.

-- ============================================================
-- ZIP centers
-- ============================================================

create table public.zip_codes (
  zip char(5) primary key check (zip ~ '^[0-9]{5}$'),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180)
);

alter table public.zip_codes enable row level security;
create policy "zip codes are readable by everyone"
  on public.zip_codes for select using (true);

-- ============================================================
-- Area centers (fallback for events without a ZIP)
-- ============================================================

alter table public.metros
  add column lat double precision,
  add column lng double precision;

update public.metros m set lat = v.lat, lng = v.lng
from (values
  ('Hampton Roads', 36.8508, -76.2859),
  ('Richmond', 37.5407, -77.4360),
  ('Raleigh-Durham', 35.8801, -78.7880),
  ('Charlotte', 35.2271, -80.8431),
  ('Greensboro / Triad', 36.0726, -79.7920),
  ('Fayetteville', 35.0527, -78.8784),
  ('Northern VA / DC', 38.8816, -77.0910)
) as v(name, lat, lng)
where m.name = v.name;

-- ============================================================
-- ZIPs on events and profiles
-- ============================================================

alter table public.events
  add column zip text check (zip ~ '^[0-9]{5}$'),
  -- Where the event is for distance searches: the ZIP's center, else the
  -- area's center. Set by the trigger below; never written by the app.
  add column lat double precision,
  add column lng double precision;

create index events_lat_lng_idx on public.events (lat, lng);

alter table public.profiles
  add column zip text check (zip ~ '^[0-9]{5}$');

create or replace function public.set_event_location()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select z.lat, z.lng into new.lat, new.lng
    from public.zip_codes z where z.zip = new.zip;
  if new.lat is null then
    select m.lat, m.lng into new.lat, new.lng
      from public.metros m where m.id = new.metro_id;
  end if;
  return new;
end;
$$;

create trigger events_set_location
  before insert or update of zip, metro_id on public.events
  for each row execute function public.set_event_location();

-- Existing events have no ZIP yet: place them at their area's center.
update public.events e set lat = m.lat, lng = m.lng
from public.metros m
where e.metro_id = m.id and e.lat is null;

-- ============================================================
-- Search
-- ============================================================

-- Upcoming published events within p_miles of a point, nearest first.
-- Runs with the caller's permissions, so row-level security still applies.
-- A cheap box check narrows the rows before the exact distance is computed.
create or replace function public.events_near(p_lat double precision, p_lng double precision, p_miles double precision)
returns setof public.events
language sql
stable
set search_path = ''
as $$
  with origin as (
    select p_lat as lat, p_lng as lng,
           least(greatest(p_miles, 1), 500) as miles
  )
  select e.*
    from public.events e, origin o
   where e.status = 'published'
     and e.starts_at >= now()
     and e.lat between o.lat - o.miles / 69.0 and o.lat + o.miles / 69.0
     and e.lng between o.lng - o.miles / (69.0 * greatest(cos(radians(o.lat)), 0.01))
                   and o.lng + o.miles / (69.0 * greatest(cos(radians(o.lat)), 0.01))
     and 3958.8 * 2 * asin(sqrt(
           power(sin(radians(e.lat - o.lat) / 2), 2)
           + cos(radians(o.lat)) * cos(radians(e.lat)) * power(sin(radians(e.lng - o.lng) / 2), 2)
         )) <= o.miles
   order by e.starts_at;
$$;

grant execute on function public.events_near(double precision, double precision, double precision)
  to anon, authenticated;
