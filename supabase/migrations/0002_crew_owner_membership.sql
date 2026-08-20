-- When a crew is created, automatically add its owner as an active member.
-- (RLS on crew_members only allows self-service *pending* join requests, so
-- this runs as a security-definer trigger instead.)

create or replace function public.handle_new_crew()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.crew_members (crew_id, profile_id, role, status)
  values (new.id, new.owner_id, 'owner', 'active')
  on conflict (crew_id, profile_id) do nothing;
  return new;
end;
$$;

create trigger on_crew_created
  after insert on public.crews
  for each row execute function public.handle_new_crew();
