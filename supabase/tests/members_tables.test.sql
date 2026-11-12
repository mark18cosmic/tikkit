-- Leaving a membership, table seating, held seats and the organiser directory.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000000e1', 'gala@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'guest1@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e3', 'guest2@example.mv', now(), 'authenticated', 'authenticated');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
create function pg_temp.draft(extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'title', 'Charity Gala Dinner', 'category', 'Food', 'startsAt', (now() + interval '5 days')::text, 'hours', 4,
    'venueName', 'Ballroom', 'venueArea', 'Malé', 'venueAddress', 'Boduthakurufaanu Magu 1', 'organizerName', 'Gala Nights',
    'description', 'A seated dinner with round tables of eight.',
    'tiers', jsonb_build_array(jsonb_build_object('name', 'Dinner', 'price', 50000, 'capacity', 10),
                               jsonb_build_object('name', 'Standing', 'price', 10000, 'capacity', 50))) || extra
$$;

select pg_temp.as_postgres();
update private.settings set card_provider = 'mock';
update public.profiles set verified_at = now() where id = '00000000-0000-0000-0000-0000000000e1';

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select set_config('t.event', public.create_event(pg_temp.draft()), true);
select pg_temp.as_postgres();
update public.events set listing = 'approved' where id = current_setting('t.event');
select set_config('t.org', (select organizer_id::text from public.events where id = current_setting('t.event')), true);
select set_config('t.tier', (select id::text from public.tiers where event_id = current_setting('t.event') and name = 'Dinner'), true);
select set_config('t.gatier', (select id::text from public.tiers where event_id = current_setting('t.event') and name = 'Standing'), true);

-- Tables ------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$ select public.save_seating(current_setting('t.event'), current_setting('t.tier')::uuid,
  jsonb_build_array(jsonb_build_object('section', 'Garden', 'layout', 'tables', 'tables', 3, 'seatsPerTable', 1))) $$,
  'P0001', 'invalid_seating', 'a table has at least 2 seats');
select is(public.save_seating(current_setting('t.event'), current_setting('t.tier')::uuid, jsonb_build_array(
  jsonb_build_object('section', 'Ballroom', 'layout', 'tables', 'tables', 2, 'seatsPerTable', 4),
  jsonb_build_object('section', 'Terrace', 'layout', 'tables', 'tables', 1, 'seatsPerTable', 6))), 14, 'organiser lays out three tables');
select is((select array_agg(distinct row_label order by row_label) from public.seat_map(current_setting('t.event'))),
  array['1', '2', '3'], 'table numbers run on across sections');
select is((select count(distinct kind) from public.seat_map(current_setting('t.event')) where kind = 'table'), 1::bigint, 'seats know they are at a table');

-- Holding seats back
select set_config('t.hold', (select array_agg(id)::text from public.seat_map(current_setting('t.event')) where row_label = '3' and seat_number <= 2), true);
select is(public.set_seats_held(current_setting('t.event'), current_setting('t.hold')::uuid[], true), 2, 'organiser holds two seats for sponsors');
select is((select capacity from public.tiers where id = current_setting('t.tier')::uuid), 12, 'held seats don''t count as for sale');
select is((select count(*) from public.seat_map(current_setting('t.event')) where held), 2::bigint, 'the organiser sees which seats are held');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select is((select count(*) from public.seat_map(current_setting('t.event')) where held), 0::bigint, 'buyers don''t see why a seat is taken');
select throws_ok($$ select public.set_seats_held(current_setting('t.event'), current_setting('t.hold')::uuid[], false) $$,
  '42501', 'not_allowed', 'only the organiser can hold or release seats');
select throws_ok($$ select public.purchase(current_setting('t.event'), '[]', 'Guest Two', null, '[]', null, null, current_setting('t.hold')::uuid[]) $$,
  'P0001', 'seat_taken', 'held seats can''t be bought');

-- Buying a seat at a table labels the ticket with the table
select set_config('t.seat', (select array_agg(id)::text from public.seat_map(current_setting('t.event')) where row_label = '2' and seat_number = 3), true);
select set_config('t.order', public.purchase(current_setting('t.event'), '[]', 'Guest Two', null, '[]', null, null, current_setting('t.seat')::uuid[])::text, true);
select set_config('t.pay', (select payment_id::text from public.orders where id = current_setting('t.order')::uuid), true);
select lives_ok($$ select public.choose_payment_method(current_setting('t.pay')::uuid, 'card') $$, 'guest picks card');
select is(public.mock_gateway_complete(current_setting('t.pay')::uuid, true), 'paid', 'and pays');
select is((select seat_label from public.tickets where order_id = current_setting('t.order')::uuid), 'Ballroom, table 2, seat 3',
  'the ticket names the table');

-- Leaving a membership ----------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select set_config('t.membership', public.save_membership(current_setting('t.org')::uuid, jsonb_build_object(
  'name', 'Gala Friends', 'perks', 'First pick of tables', 'price', 30000, 'period', 'year', 'discountPct', 10))::text, true);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select throws_ok($$ select public.cancel_membership(current_setting('t.org')::uuid) $$, 'P0001', 'not_a_member', 'nothing to leave before joining');
select set_config('t.mpay', public.buy_membership(current_setting('t.membership')::uuid)::text, true);
select public.choose_payment_method(current_setting('t.mpay')::uuid, 'card');
select is(public.mock_gateway_complete(current_setting('t.mpay')::uuid, true), 'paid', 'guest joins and pays');
select is((public.membership_exit_terms(current_setting('t.org')::uuid) ->> 'refund')::int, 30000, 'a fresh join can be refunded in full');
select is((public.cancel_membership(current_setting('t.org')::uuid) ->> 'refund')::int, 30000, 'leaving within 7 days refunds');
select is((select status from public.payments where id = current_setting('t.mpay')::uuid), 'refund_due', 'the payment is queued for refund');
select is((select count(*) from public.my_memberships()), 0::bigint, 'and they are no longer a member');

-- Rejoin, use a perk, then leave: no refund
select set_config('t.mpay2', public.buy_membership(current_setting('t.membership')::uuid)::text, true);
select public.choose_payment_method(current_setting('t.mpay2')::uuid, 'card');
select public.mock_gateway_complete(current_setting('t.mpay2')::uuid, true);
select public.purchase(current_setting('t.event'), jsonb_build_array(jsonb_build_object('tierId', current_setting('t.gatier'), 'quantity', 1)), 'Guest One');
select is((public.cancel_membership(current_setting('t.org')::uuid) ->> 'refund')::int, 0, 'after using a member price, leaving doesn''t refund');

-- Directory -----------------------------------------------------------------------
select pg_temp.as_anon();
select is((select count(*) from public.browse_organizers('gala')), 1::bigint, 'anyone can find organisers by name');
select is((select upcoming from public.browse_organizers('gala')), 1::bigint, '... with their upcoming events');

select * from finish();
rollback;
