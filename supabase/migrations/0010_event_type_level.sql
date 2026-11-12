-- What kind of event it is and who it's for (PRD F2 filters, F3 fields).
-- Both are optional in the database so older events stay valid; the app
-- asks for them on every new event.

alter table public.events
  add column event_type text
    check (event_type in ('class', 'social', 'workshop', 'competition', 'festival')),
  add column skill_level text
    check (skill_level in ('beginner', 'intermediate', 'advanced', 'all'));

create index events_event_type_idx on public.events (event_type);

-- The sample events from seed_sample_data.sql, if present, get types so the
-- filters have something to show. Only these fixed ids are touched.
update public.events set event_type = v.t, skill_level = v.l
from (values
  ('e0000001-0000-4000-8000-000000000001'::uuid, 'social', 'all'),
  ('e0000001-0000-4000-8000-000000000002'::uuid, 'social', 'all'),
  ('e0000001-0000-4000-8000-000000000003'::uuid, 'class', 'beginner'),
  ('e0000001-0000-4000-8000-000000000004'::uuid, 'social', 'intermediate'),
  ('e0000001-0000-4000-8000-000000000005'::uuid, 'social', 'all'),
  ('e0000001-0000-4000-8000-000000000006'::uuid, 'competition', 'advanced'),
  ('e0000001-0000-4000-8000-000000000007'::uuid, 'social', 'all'),
  ('e0000001-0000-4000-8000-000000000008'::uuid, 'social', 'all'),
  ('e0000001-0000-4000-8000-000000000009'::uuid, 'festival', 'all')
) as v(id, t, l)
where public.events.id = v.id;
