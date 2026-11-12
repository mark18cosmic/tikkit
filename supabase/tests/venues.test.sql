-- Venue and rental security tests. Run with `npm run db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'renter@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'rival@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', 'unverified@example.mv', null, 'authenticated', 'authenticated');

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
-- Maldives 10:00 on a day `d` days from now.
create function pg_temp.at(d int, h int default 10) returns timestamptz language sql as $$
  select ((date_trunc('day', now() at time zone 'Indian/Maldives') + make_interval(days => d, hours => h))
    at time zone 'Indian/Maldives')
$$;
create function pg_temp.event(extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'title', 'Rental Night', 'category', 'Music', 'hours', 2,
    'venueName', 'Typed Hall', 'venueArea', 'Malé', 'venueAddress', 'Somewhere Street 1', 'organizerName', 'Renter',
    'description', 'An event held in a rented space for the tests.',
    'tiers', jsonb_build_array(jsonb_build_object('name', 'Free', 'price', 0, 'capacity', 10))) || extra
$$;

-- Owners and venues -----------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$
  select set_config('test.hall', public.save_venue(jsonb_build_object(
    'name', 'Test Hall', 'area', 'Malé', 'address', 'Hall Street 1', 'capacity', 100,
    'amenities', jsonb_build_array('Stage', 'Stage', 'Sound system'),
    'forRent', true, 'hourlyRate', 10000, 'minHours', 2))::text, true)
$$, 'owner lists a space for rent');
select lives_ok($$
  select set_config('test.private', public.save_venue(jsonb_build_object(
    'name', 'Back Room', 'area', 'Malé', 'address', 'Hall Street 1', 'capacity', 20))::text, true)
$$, 'owner adds a private venue');
select is((select amenities from public.venues where id = current_setting('test.hall')::uuid),
  array['Sound system', 'Stage'], 'duplicate amenities are merged');
select throws_ok($$ select public.save_venue(jsonb_build_object(
    'name', 'X Hall', 'area', 'Malé', 'address', 'Hall Street 1', 'capacity', 10, 'forRent', true)) $$,
  'P0001', 'invalid_rate', 'a space for rent needs a price');
select throws_ok($$ select public.save_venue(jsonb_build_object(
    'name', 'X Hall', 'area', 'Malé', 'address', 'Hall Street 1', 'capacity', 10,
    'imagePath', '00000000-0000-0000-0000-0000000000a2/x.jpg')) $$,
  'P0001', 'invalid_image', 'cannot use a photo from someone else''s folder');

-- Spaces are listed once verified (see trust.test.sql for the checks themselves).
select pg_temp.as_admin();
update public.venues set verified_at = now() where for_rent;

select pg_temp.as_anon();
select is((select count(*) from public.venues where id = current_setting('test.hall')::uuid), 1::bigint,
  'anyone can see a space for rent');
select is((select count(*) from public.venues where id = current_setting('test.private')::uuid), 0::bigint,
  'nobody else sees a private venue');
select throws_ok($$ select public.save_venue('{}') $$, '42501', null, 'anon cannot save venues');
select throws_ok($$ select * from public.venue_bookings $$, '42501', null, 'anon cannot read bookings');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$ update public.venues set hourly_rate = 0 $$, '42501', null, 'cannot edit venues directly');
select throws_ok($$ insert into public.venue_bookings (venue_id, requester_id, requester_name, requester_email, starts_at, ends_at, total, status)
  values (current_setting('test.hall')::uuid, '00000000-0000-0000-0000-0000000000a3', 'Rival', 'rival@example.mv', now() + interval '1 day', now() + interval '2 days', 0, 'approved') $$,
  '42501', null, 'cannot write bookings directly');
select throws_ok($$ select public.save_venue(jsonb_build_object('id', current_setting('test.hall'),
    'name', 'Mine Now', 'area', 'Malé', 'address', 'Hall Street 1', 'capacity', 100, 'forRent', true, 'hourlyRate', 1)) $$,
  'P0001', 'venue_not_found', 'cannot edit someone else''s venue');
select throws_ok($$ select public.archive_venue(current_setting('test.hall')::uuid) $$,
  'P0001', 'venue_not_found', 'cannot archive someone else''s venue');
select throws_ok($$ select public.request_booking(current_setting('test.private')::uuid, pg_temp.at(5), 2, 'Rival', '') $$,
  'P0001', 'venue_not_found', 'cannot book a venue that is not for rent');

-- Requests --------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select lives_ok($$
  select set_config('test.req', public.request_booking(current_setting('test.hall')::uuid, pg_temp.at(5), 3, 'Renter', 'Album launch')::text, true)
$$, 'organiser requests a space');
select is((select total from public.venue_bookings where id = current_setting('test.req')::uuid), 30000,
  'the quote is the hourly rate times the hours');
select is((select owner_email from public.venue_bookings where id = current_setting('test.req')::uuid), null,
  'the owner''s email stays hidden while pending');
select throws_ok($$ select public.request_booking(current_setting('test.hall')::uuid, pg_temp.at(5, 11), 2, 'Renter', '') $$,
  'P0001', 'already_requested', 'cannot send a second request for the same time');
select throws_ok($$ select public.request_booking(current_setting('test.hall')::uuid, pg_temp.at(6), 1, 'Renter', '') $$,
  'P0001', 'invalid_length', 'cannot book below the minimum hours');
select throws_ok($$ select public.request_booking(current_setting('test.hall')::uuid, now() - interval '1 hour', 2, 'Renter', '') $$,
  'P0001', 'invalid_start', 'cannot book in the past');
select throws_ok($$ select public.respond_booking(current_setting('test.req')::uuid, true, '') $$,
  'P0001', 'booking_not_found', 'the renter cannot approve their own request');
select throws_ok($$ select public.create_event(pg_temp.event(jsonb_build_object(
    'startsAt', pg_temp.at(5)::text, 'bookingId', current_setting('test.req')))) $$,
  'P0001', 'booking_not_found', 'a pending booking cannot hold an event');
select throws_ok($$ select public.create_event(pg_temp.event(jsonb_build_object(
    'startsAt', pg_temp.at(5)::text, 'venueId', current_setting('test.hall')))) $$,
  'P0001', 'venue_not_found', 'cannot put an event in someone else''s venue without a booking');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select is((select count(*) from public.venue_bookings), 0::bigint, 'others cannot see the request');
select lives_ok($$
  select set_config('test.rival', public.request_booking(current_setting('test.hall')::uuid, pg_temp.at(5, 12), 2, 'Rival', '')::text, true)
$$, 'a second organiser requests an overlapping time');
select is((select count(*) from public.venue_busy(current_setting('test.hall')::uuid, now(), now() + interval '30 days')), 0::bigint,
  'pending requests do not show as busy');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select throws_ok($$ select public.request_booking(current_setting('test.hall')::uuid, pg_temp.at(8), 2, 'Nobody', '') $$,
  '28000', 'not_signed_in', 'unverified accounts cannot request');

-- Approval --------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is((select count(*) from public.venue_bookings), 2::bigint, 'the owner sees requests for their space');
select lives_ok($$ select public.respond_booking(current_setting('test.req')::uuid, true, 'See you then') $$, 'owner approves');
select is((select status::text from public.venue_bookings where id = current_setting('test.rival')::uuid), 'declined',
  'the overlapping request is declined automatically');
select throws_ok($$ select public.create_event(pg_temp.event(jsonb_build_object(
    'startsAt', pg_temp.at(5, 11)::text, 'venueId', current_setting('test.hall')))) $$,
  'P0001', 'venue_unavailable', 'the owner cannot double-book their own space');

select pg_temp.as_anon();
select is((select count(*) from public.venue_busy(current_setting('test.hall')::uuid, now(), now() + interval '30 days')), 1::bigint,
  'the approved slot shows as busy');

-- Events in a rented space ----------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select is((select owner_email from public.venue_bookings where id = current_setting('test.req')::uuid), 'owner@example.mv',
  'the renter gets the owner''s email once approved');
select throws_ok($$ select public.create_event(pg_temp.event(jsonb_build_object(
    'startsAt', pg_temp.at(5, 12)::text, 'bookingId', current_setting('test.req')))) $$,
  'P0001', 'outside_booking', 'the event must fit inside the booking');
select throws_ok($$ select public.create_event(pg_temp.event(jsonb_build_object(
    'startsAt', pg_temp.at(5, 10)::text, 'bookingId', current_setting('test.req')))) $$,
  'P0001', 'booking_unpaid', 'an unpaid booking cannot hold an event');
select pg_temp.as_admin();
update public.venue_bookings set paid_at = now() where id = current_setting('test.req')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select lives_ok($$
  select set_config('test.event', public.create_event(pg_temp.event(jsonb_build_object(
    'startsAt', pg_temp.at(5, 10)::text, 'bookingId', current_setting('test.req')))), true)
$$, 'the renter creates an event in the booked slot');
select is((select venue_name from public.events where id = current_setting('test.event')), 'Test Hall',
  'the event uses the venue''s details');
select throws_ok($$ select public.cancel_booking(current_setting('test.req')::uuid) $$,
  'P0001', 'booking_in_use', 'a booking with an upcoming event cannot be cancelled');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.delete_account() $$, 'P0001', 'has_upcoming_bookings',
  'an owner with upcoming rentals cannot delete their account');

select * from finish();
rollback;
