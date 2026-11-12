-- Profile photos and banners, for people and for organiser pages.
--
-- Files live in a public bucket, in a folder named after the uploader. A row
-- can only point at a file in its owner's folder, so nobody can borrow another
-- account's picture by copying its path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "Upload profile images to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- So a replaced picture can be cleaned up.
create policy "Delete own profile images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter table public.profiles
  add column avatar_path text,
  add column banner_path text,
  add constraint profiles_avatar_path_own check (avatar_path ~ ('^' || id::text || '/[A-Za-z0-9._-]{1,100}$')),
  add constraint profiles_banner_path_own check (banner_path ~ ('^' || id::text || '/[A-Za-z0-9._-]{1,100}$'));

grant update (avatar_path, banner_path) on public.profiles to authenticated;

alter table public.organizers
  add column avatar_path text,
  add column banner_path text,
  add constraint organizers_avatar_path_own check (avatar_path ~ ('^' || owner_id::text || '/[A-Za-z0-9._-]{1,100}$')),
  add constraint organizers_banner_path_own check (banner_path ~ ('^' || owner_id::text || '/[A-Za-z0-9._-]{1,100}$'));

-- Null removes a picture. Only the account that runs the page can change it.
create function public.set_organizer_images(p_id uuid, p_avatar_path text default null, p_banner_path text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  begin
    update public.organizers set avatar_path = p_avatar_path, banner_path = p_banner_path
    where id = p_id and owner_id = (select auth.uid());
  exception when check_violation then
    raise exception 'invalid_image';
  end;
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
end;
$$;

revoke execute on function public.set_organizer_images(uuid, text, text) from public, anon;
grant execute on function public.set_organizer_images(uuid, text, text) to authenticated;
