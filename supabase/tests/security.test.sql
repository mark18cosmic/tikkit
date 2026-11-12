-- Security tests: run with `npm run db:test` (local Supabase must be running).
-- Each block acts as a different person and checks what they can and cannot do.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- People -------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'aisha@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bilal@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'org@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'door@example.mv', now(), 'authenticated', 'authenticated');

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

-- Organiser creates an event ------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select lives_ok($$
  select set_config('test.event', public.create_event(jsonb_build_object(
    'title', 'Test Night', 'category', 'Music', 'startsAt', (now() + interval '2 days')::text, 'hours', 3,
    'venueName', 'Hall', 'venueArea', 'Malé', 'venueAddress', 'Main Street 1', 'organizerName', 'Org',
    'description', 'A night of tests for the security suite.',
    'tiers', jsonb_build_array(
      jsonb_build_object('name', 'Free', 'price', 0, 'capacity', 3),
      jsonb_build_object('name', 'Paid', 'price', 10000, 'capacity', 5)))), true)
$$, 'organiser can create an event');

select throws_ok($$
  select public.create_event(jsonb_build_object('title', 'Bad', 'category', 'Music',
    'startsAt', (now() + interval '1 day')::text, 'hours', 2, 'venueName', 'Hall', 'venueArea', 'Malé',
    'venueAddress', 'Main Street 1', 'organizerName', 'Org', 'description', 'A night of tests for the suite.',
    'imagePath', '00000000-0000-0000-0000-00000000000a/x.jpg',
    'tiers', jsonb_build_array(jsonb_build_object('name', 'Free', 'price', 0, 'capacity', 3))))
$$, 'P0001', 'invalid_image', 'cannot attach a photo from someone else''s folder');

select throws_ok($$
  select public.create_event(jsonb_build_object('title', 'Past', 'category', 'Music',
    'startsAt', (now() - interval '1 day')::text, 'hours', 2, 'venueName', 'Hall', 'venueArea', 'Malé',
    'venueAddress', 'Main Street 1', 'organizerName', 'Org', 'description', 'A night of tests for the suite.',
    'tiers', jsonb_build_array(jsonb_build_object('name', 'Free', 'price', 0, 'capacity', 3))))
$$, 'P0001', 'invalid_start', 'cannot create an event in the past');

-- Remember tier ids (as admin, to read freely). The organiser isn't verified,
-- so the event starts as a draft; approve it here as a reviewer would.
select pg_temp.as_admin();
update public.events set listing = 'approved' where id = current_setting('test.event');
-- A seeded event used below; keep it in the future however old the seed is.
update public.events set starts_at = now() + interval '1 day', ends_at = now() + interval '1 day 2 hours' where id = 'boduberu-artificial-beach';
select set_config('test.free', (select id::text from public.tiers where event_id = current_setting('test.event') and price = 0), true);
select set_config('test.paid', (select id::text from public.tiers where event_id = current_setting('test.event') and price > 0), true);

-- Anonymous visitors ---------------------------------------------------------
select pg_temp.as_anon();
select ok((select count(*) from public.events) > 0, 'anon can browse events');
select throws_ok($$ select * from public.tickets $$, '42501', null, 'anon cannot read tickets at all');
select throws_ok($$ select * from public.orders $$, '42501', null, 'anon cannot read orders at all');
select throws_ok($$ select public.purchase('x', '[]', 'x') $$, '42501', null, 'anon cannot call purchase');
select throws_ok($$ select private.new_ticket_code() $$, '42501', null, 'anon cannot call private helpers');

-- Direct writes are blocked for signed-in users -------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ update public.tiers set sold = 0 $$, '42501', null, 'cannot change inventory directly');
select throws_ok($$ insert into public.events (id, title) values ('hack-1', 'x') $$, '42501', null, 'cannot insert events directly');
select throws_ok($$ insert into public.tickets (code) values ('EVT-AAAA-AAAA') $$, '42501', null, 'cannot mint tickets directly');
select throws_ok($$ update public.events set title = 'pwned' $$, '42501', null, 'cannot edit events directly');
select throws_ok($$ select * from private.settings $$, '42501', null, 'cannot read server settings');
select throws_ok($$ update public.profiles set id = gen_random_uuid() $$, '42501', null, 'cannot change profile id');
select throws_ok($$ select private.new_ticket_code() $$, '42501', null, 'cannot call private helpers');

-- Buying ----------------------------------------------------------------------
select lives_ok($$
  select set_config('test.order', public.purchase(current_setting('test.event'),
    jsonb_build_array(jsonb_build_object('tierId', current_setting('test.free'), 'quantity', 2)), 'Aisha')::text, true)
$$, 'attendee can reserve free tickets');
select is((select count(*) from public.tickets), 2::bigint, 'attendee sees their 2 tickets');
select ok((select bool_and(code ~ '^EVT-[A-Z2-9]{4}-[A-Z2-9]{4}$') from public.tickets), 'codes come from the server');
select is((select sold from public.tiers where id = current_setting('test.free')::uuid), 2, 'inventory went down');
select set_config('test.code', (select code from public.tickets order by code limit 1), true);
select set_config('test.code2', (select code from public.tickets order by code desc limit 1), true);

select throws_ok($$
  select public.purchase(current_setting('test.event'),
    jsonb_build_array(jsonb_build_object('tierId', current_setting('test.free'), 'quantity', 2)), 'Aisha')
$$, 'P0001', 'sold_out', 'cannot oversell (1 left, asked for 2)');
select throws_ok($$
  select public.purchase(current_setting('test.event'),
    jsonb_build_array(jsonb_build_object('tierId', current_setting('test.paid'), 'quantity', 9)), 'Aisha')
$$, 'P0001', 'invalid_lines', 'cannot exceed 8 per order');
select throws_ok($$
  select public.purchase(current_setting('test.event'),
    jsonb_build_array(jsonb_build_object('tierId', current_setting('test.free'), 'quantity', -5)), 'Aisha')
$$, 'P0001', 'invalid_lines', 'negative quantities are rejected');
select throws_ok($$
  select public.purchase('boduberu-artificial-beach',
    jsonb_build_array(jsonb_build_object('tierId', current_setting('test.free'), 'quantity', 1)), 'Aisha')
$$, 'P0001', 'invalid_lines', 'cannot buy a tier from a different event');

-- Paid tiers need payment when unpaid orders are off (as on hosted projects).
select pg_temp.as_admin();
update private.settings set card_provider = 'none', bank_account_number = null;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select throws_ok($$
  select public.purchase(current_setting('test.event'),
    jsonb_build_array(jsonb_build_object('tierId', current_setting('test.paid'), 'quantity', 1)), 'Aisha')
$$, 'P0001', 'payment_required', 'paid tickets are refused without payment');

-- Privacy between attendees ---------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is((select count(*) from public.tickets), 0::bigint, 'another attendee cannot see Aisha''s tickets');
select is((select count(*) from public.orders), 0::bigint, 'another attendee cannot see Aisha''s orders');
select is(public.check_in(current_setting('test.code')) ->> 'status', 'unknown', 'a stranger cannot check tickets in');
select throws_ok($$ select public.transfer_ticket(current_setting('test.code'), 'Friend', 'friend@example.mv') $$,
  'P0001', 'ticket_not_found', 'a stranger cannot transfer someone else''s ticket');
select throws_ok($$ select public.add_event_staff(current_setting('test.event'), 'bilal@example.mv') $$,
  '42501', 'not_allowed', 'a stranger cannot add themselves as door staff');

-- Door staff ------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select lives_ok($$ select public.add_event_staff(current_setting('test.event'), 'Door@Example.mv') $$, 'organiser adds door staff');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select is(public.check_in(current_setting('test.code')) ->> 'status', 'admitted', 'door staff admits a valid ticket');
select is(public.check_in(lower(replace(current_setting('test.code'), '-', ''))) ->> 'status', 'already',
  'second scan says already checked in (code typed without dashes)');
select is((select count(*) from public.tickets where event_id = current_setting('test.event')), 2::bigint,
  'door staff can see the guest list');

-- Transfers -------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.transfer_ticket(current_setting('test.code'), 'Bilal', 'bilal@example.mv') $$,
  'P0001', 'ticket_not_active', 'a used ticket cannot be transferred');
select lives_ok($$ select public.transfer_ticket(current_setting('test.code2'), 'New Person', 'new@example.mv') $$,
  'attendee sends a ticket to someone without an account');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select is(public.check_in(current_setting('test.code2')) ->> 'status', 'void', 'the sender''s old code no longer works');

select pg_temp.as_admin();
insert into auth.users (id, email, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-00000000000e', 'new@example.mv', now(), 'authenticated', 'authenticated');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select is(public.claim_tickets(), 1, 'recipient claims the ticket after signing up');
select is((select count(*) from public.tickets where checked_in_at is null and transferred_at is null), 1::bigint,
  'recipient now holds a live ticket');

-- Unverified emails cannot claim or staff.
select pg_temp.as_admin();
insert into auth.users (id, email, email_confirmed_at, aud, role)
values ('00000000-0000-0000-0000-00000000000f', 'door@example.mv.fake', null, 'authenticated', 'authenticated');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select is(public.claim_tickets(), 0, 'unverified accounts claim nothing');

-- Account deletion ------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.delete_account() $$, 'P0001', 'has_upcoming_events',
  'an organiser with upcoming events cannot delete their account');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.delete_account() $$, 'an attendee can delete their account');
select pg_temp.as_admin();
select is((select count(*) from auth.users where id = '00000000-0000-0000-0000-00000000000a'), 0::bigint, 'the account is gone');

select * from finish();
rollback;
