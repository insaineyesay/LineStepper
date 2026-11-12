-- Event flyers and profile photos (PRD F1, F3).
--
-- Files live in one public Supabase Storage bucket, "images":
--   events/<event id>/<image id>.jpg        flyer, up to 1200px wide
--   events/<event id>/<image id>-thumb.jpg  list thumbnail, 400px
--   profiles/<profile id>/<image id>.jpg    profile photo, 400px
--
-- The app shrinks every photo before upload. Nobody uploads with their own
-- credentials: the API checks who's asking, then hands out a one-time upload
-- link for exactly those paths, and afterwards writes the public URLs into
-- the row. So the URL columns below can only be changed by the API.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table public.events add column flyer_thumb_url text;

-- Only the service role (the API) may set image URLs, so an app can't point
-- an event or profile at an image hosted anywhere else.
create or replace function public.protect_image_columns()
returns trigger
language plpgsql
as $$
begin
  -- Same test as protect_is_admin() in 0003.
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    -- Nested ifs: plpgsql may evaluate both sides of an AND, and profiles
    -- have no flyer columns. On insert there is no old row, so any value
    -- other than null is refused.
    if tg_table_name = 'profiles' then
      if (tg_op = 'INSERT' and new.avatar_url is not null)
         or (tg_op = 'UPDATE' and new.avatar_url is distinct from old.avatar_url) then
        raise exception 'avatar_url is set through the API';
      end if;
    elsif tg_op = 'INSERT' then
      if new.flyer_url is not null or new.flyer_thumb_url is not null then
        raise exception 'flyer images are set through the API';
      end if;
    elsif new.flyer_url is distinct from old.flyer_url
       or new.flyer_thumb_url is distinct from old.flyer_thumb_url then
      raise exception 'flyer images are set through the API';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_images before insert or update on public.profiles
  for each row execute function public.protect_image_columns();
create trigger events_protect_images before insert or update on public.events
  for each row execute function public.protect_image_columns();
