-- Account deletion (App Store and Play Store require it in-app).
--
-- The API deletes the auth user; everything owned by the profile cascades
-- from there (events, bookmarks, follows, memberships, push tokens, post
-- credits). The one thing that would block it is crews.owner_id, which is
-- `on delete restrict`. This function runs first and gives each crew the
-- person owns to its next member: an active admin first, then the
-- longest-standing active member. A crew with nobody else in it is deleted.
--
-- Only the API (service role) may call it.

create or replace function public.release_owned_crews(p_profile uuid)
returns table (handed_off integer, deleted integer)
language plpgsql
security definer set search_path = ''
as $$
declare
  crew record;
  heir uuid;
  n_handed integer := 0;
  n_deleted integer := 0;
begin
  for crew in select c.id from public.crews c where c.owner_id = p_profile for update loop
    select m.profile_id into heir
      from public.crew_members m
     where m.crew_id = crew.id
       and m.profile_id <> p_profile
       and m.status = 'active'
     order by (m.role = 'admin') desc, m.created_at asc
     limit 1;

    if heir is null then
      delete from public.crews where id = crew.id;
      n_deleted := n_deleted + 1;
    else
      update public.crews set owner_id = heir where id = crew.id;
      update public.crew_members set role = 'owner'
       where crew_id = crew.id and profile_id = heir;
      n_handed := n_handed + 1;
    end if;
  end loop;

  return query select n_handed, n_deleted;
end;
$$;

revoke all on function public.release_owned_crews(uuid) from public, anon, authenticated;
grant execute on function public.release_owned_crews(uuid) to service_role;
