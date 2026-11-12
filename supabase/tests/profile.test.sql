-- Profile photos and banners for people and organiser pages.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'pic@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'thief@example.mv', now(), 'authenticated', 'authenticated');
insert into public.organizers (id, owner_id, slug, name) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'pic-nights', 'Pic Nights');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select lives_ok($$ update public.profiles set avatar_path = '00000000-0000-0000-0000-0000000000c1/me.jpg',
  banner_path = '00000000-0000-0000-0000-0000000000c1/beach.jpg' where id = '00000000-0000-0000-0000-0000000000c1' $$,
  'people set their own photo and banner');
select throws_ok($$ update public.profiles set avatar_path = '00000000-0000-0000-0000-0000000000c2/x.jpg'
  where id = '00000000-0000-0000-0000-0000000000c1' $$, '23514', null, 'cannot point at a file in someone else''s folder');
select throws_ok($$ update public.profiles set verified_at = now() where id = '00000000-0000-0000-0000-0000000000c1' $$,
  '42501', null, 'the picture grant does not open other columns');
select lives_ok($$ select public.set_organizer_images('00000000-0000-0000-0000-0000000000d1',
  '00000000-0000-0000-0000-0000000000c1/logo.png', '00000000-0000-0000-0000-0000000000c1/cover.jpg') $$, 'owner sets the page logo and banner');
select throws_ok($$ select public.set_organizer_images('00000000-0000-0000-0000-0000000000d1', '../c2/logo.png') $$,
  'P0001', 'invalid_image', 'paths outside the owner''s folder are refused');
select lives_ok($$ select public.set_organizer_images('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1/logo.png') $$,
  'leaving the banner out removes it');
select is((select banner_path from public.organizers where id = '00000000-0000-0000-0000-0000000000d1'), null, '... and it is gone');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select throws_ok($$ select public.set_organizer_images('00000000-0000-0000-0000-0000000000d1', null, null) $$,
  '42501', 'not_allowed', 'cannot change someone else''s page pictures');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'), 0::bigint,
  'other people still cannot read your profile row');

select pg_temp.as_anon();
select is((select avatar_path from public.organizers where id = '00000000-0000-0000-0000-0000000000d1'),
  '00000000-0000-0000-0000-0000000000c1/logo.png', 'page logos are public');

select * from finish();
rollback;
