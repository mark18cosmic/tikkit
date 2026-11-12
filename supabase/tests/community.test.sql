-- Organisers, saves, follows, announcements, editing, promo codes, reviews.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000000b1', 'host@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'fan@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b3', 'other@example.mv', now(), 'authenticated', 'authenticated');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
create function pg_temp.draft(extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'title', 'Promo Night', 'category', 'Music', 'startsAt', (now() + interval '3 days')::text, 'hours', 3,
    'venueName', 'Hall', 'venueArea', 'Malé', 'venueAddress', 'Main Street 1', 'organizerName', 'Island Sounds',
    'description', 'A night to test the community features properly.',
    'tiers', jsonb_build_array(jsonb_build_object('name', 'General', 'price', 10000, 'capacity', 10))) || extra
$$;

-- Organisers ----------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$ select set_config('t.event', public.create_event(pg_temp.draft()), true) $$, 'host creates an event');
select isnt((select organizer_id from public.events where id = current_setting('t.event')), null, 'the event is filed under an organiser');
select set_config('t.org', (select organizer_id::text from public.events where id = current_setting('t.event')), true);
select lives_ok($$ select public.create_event(pg_temp.draft(jsonb_build_object('organizerName', 'island sounds'))) $$, 'second event, same organiser');
select is((select count(*) from public.organizers where owner_id = '00000000-0000-0000-0000-0000000000b1'), 1::bigint,
  'the same name (any case) reuses the organiser');
select lives_ok($$ select public.update_organizer(current_setting('t.org')::uuid, 'Island Sounds MV', 'Live music.') $$, 'host renames their organiser');
select is((select organizer_name from public.events where id = current_setting('t.event')), 'Island Sounds MV', 'the rename reaches the events');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select lives_ok($$ select public.create_event(pg_temp.draft(jsonb_build_object('organizerName', 'Island Sounds MV'))) $$,
  'someone else can use the same name');
select isnt((select organizer_id::text from public.events where owner_id = '00000000-0000-0000-0000-0000000000b3' limit 1),
  current_setting('t.org'), '... but gets their own organiser page, not the host''s');
select throws_ok($$ select public.update_organizer(current_setting('t.org')::uuid, 'Hijacked', '') $$, '42501', 'not_allowed',
  'cannot edit someone else''s organiser');

select pg_temp.as_anon();
select is((select count(*) from public.organizers where id = current_setting('t.org')::uuid), 1::bigint, 'organiser pages are public');
select is((public.organizer_stats(current_setting('t.org')::uuid) ->> 'events')::int, 0, 'public stats ignore drafts that aren''t approved');
select throws_ok($$ select * from public.follows $$, '42501', null, 'anon cannot read follows');
select throws_ok($$ select * from public.announcements $$, '42501', null, 'anon cannot read announcements');

-- Saves and follows -----------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select lives_ok($$ select public.set_saved(current_setting('t.event'), true) $$, 'fan saves an event');
select lives_ok($$ select public.set_follow(current_setting('t.org')::uuid, true) $$, 'fan follows the organiser');
select is((select count(*) from public.saved_events), 1::bigint, 'fan sees their save');
select throws_ok($$ insert into public.follows values ('00000000-0000-0000-0000-0000000000b3', current_setting('t.org')::uuid) $$,
  '42501', null, 'cannot write follows directly (or for someone else)');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select is((select count(*) from public.saved_events), 0::bigint, 'others cannot see the fan''s saves');
select is((public.organizer_stats(current_setting('t.org')::uuid) ->> 'followers')::int, 1, 'follower count is public');

-- Promo codes -----------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$ select public.create_promo(current_setting('t.event'), 'guestlist', 100, 1) $$, 'host makes a one-use 100% code');
select throws_ok($$ select public.create_promo(current_setting('t.event'), 'GUESTLIST', 50, null) $$, 'P0001', 'code_taken', 'codes are unique per event');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select throws_ok($$ select public.create_promo(current_setting('t.event'), 'MINE', 100, null) $$, '42501', 'not_allowed', 'only the owner makes codes');
select is((select count(*) from public.promo_codes), 0::bigint, 'others cannot list the codes');

-- Paid tickets are refused without payment, but a 100% code makes them free.
select pg_temp.as_admin();
update public.events set listing = 'approved';
update private.settings set card_provider = 'none', bank_account_number = null;
select set_config('t.tier', (select id::text from public.tiers where event_id = current_setting('t.event')), true);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select is((public.check_promo(current_setting('t.event'), 'nope') ->> 'valid')::boolean, false, 'a wrong code is not valid');
select is((public.check_promo(current_setting('t.event'), 'guest list') ->> 'percentOff')::int, 100, 'codes ignore case and spaces');
select lives_ok($$ select public.purchase(current_setting('t.event'),
  jsonb_build_array(jsonb_build_object('tierId', current_setting('t.tier'), 'quantity', 2)), 'Fan', 'GUESTLIST') $$,
  'the code makes paid tickets free');
select is((select total from public.orders limit 1), 0, 'the order total is zero');
select throws_ok($$ select public.purchase(current_setting('t.event'),
  jsonb_build_array(jsonb_build_object('tierId', current_setting('t.tier'), 'quantity', 1)), 'Fan', 'GUESTLIST') $$,
  'P0001', 'invalid_promo', 'a one-use code cannot be used twice');
select pg_temp.as_admin();
insert into private.promo_attempts (user_id) select '00000000-0000-0000-0000-0000000000b2' from generate_series(1, 20);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$ select public.check_promo(current_setting('t.event'), 'GUESS') $$, 'P0001', 'too_many_attempts',
  'guessing codes is rate limited');

-- Announcements ---------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$ select public.post_announcement(current_setting('t.event'), 'Gates open at 7.') $$, 'host posts an announcement');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select is((select count(*) from public.announcements), 1::bigint, 'ticket holders see it');
select throws_ok($$ select public.post_announcement(current_setting('t.event'), 'Fake news') $$, '42501', 'not_allowed',
  'ticket holders cannot post');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select is((select count(*) from public.announcements), 0::bigint, 'people without tickets do not see it');

-- Editing and cancelling ------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.update_event(current_setting('t.event'), pg_temp.draft(jsonb_build_object(
    'tiers', jsonb_build_array(jsonb_build_object('id', current_setting('t.tier'), 'name', 'General', 'price', 5000, 'capacity', 10))))) $$,
  'P0001', 'tier_price_locked', 'a sold ticket type keeps its price');
select throws_ok($$ select public.update_event(current_setting('t.event'), pg_temp.draft(jsonb_build_object(
    'tiers', jsonb_build_array(jsonb_build_object('name', 'New only', 'price', 0, 'capacity', 10))))) $$,
  'P0001', 'tier_has_sales', 'a sold ticket type cannot be removed');
select lives_ok($$ select public.update_event(current_setting('t.event'), pg_temp.draft(jsonb_build_object(
    'startsAt', (now() + interval '4 days')::text,
    'tiers', jsonb_build_array(jsonb_build_object('id', current_setting('t.tier'), 'name', 'General', 'price', 10000, 'capacity', 20))))) $$,
  'host moves the event a day later');
select is((select status::text from public.events where id = current_setting('t.event')), 'rescheduled', 'it is marked rescheduled');
select is((select count(*) from public.announcements where kind = 'rescheduled'), 1::bigint, 'ticket holders get a notice');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select throws_ok($$ select public.cancel_event(current_setting('t.event'), 'Not mine') $$, '42501', 'not_allowed', 'others cannot cancel');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$ select public.cancel_event(current_setting('t.event'), 'Storm warning, sorry.') $$, 'host cancels');

-- Space reviews ---------------------------------------------------------------
select pg_temp.as_admin();
insert into public.venues (id, owner_id, name, area, address, capacity, for_rent, hourly_rate, verified_at)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Review Hall', 'Malé', 'Hall Street 1', 50, true, 1000, now());
insert into public.venue_bookings (id, venue_id, requester_id, requester_name, requester_email, starts_at, ends_at, status, total)
values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2',
   'Fan', 'fan@example.mv', now() - interval '3 days', now() - interval '3 days' + interval '2 hours', 'approved', 2000),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2',
   'Fan', 'fan@example.mv', now() + interval '3 days', now() + interval '3 days' + interval '2 hours', 'approved', 2000);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$ select public.review_booking('00000000-0000-0000-0000-0000000000d2', 5, 'Great') $$,
  'P0001', 'review_not_open', 'cannot review before the booking is over');
select lives_ok($$ select set_config('t.review', public.review_booking('00000000-0000-0000-0000-0000000000d1', 4, 'Good sound.')::text, true) $$,
  'renter reviews after the booking');
select throws_ok($$ select public.review_booking('00000000-0000-0000-0000-0000000000d1', 1, 'Again') $$,
  'P0001', 'already_reviewed', 'one review per booking');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select throws_ok($$ select public.review_booking('00000000-0000-0000-0000-0000000000d1', 1, 'Spam') $$,
  'P0001', 'booking_not_found', 'only the renter can review');
select throws_ok($$ select public.reply_review(current_setting('t.review')::uuid, 'Fake reply') $$, '42501', 'not_allowed',
  'only the space owner can reply');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$ select public.reply_review(current_setting('t.review')::uuid, 'Thanks, come back soon.') $$, 'owner replies');

select * from finish();
rollback;
