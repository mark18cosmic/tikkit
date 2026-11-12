-- Series, memberships and presales, seats, and trust signals. Run with `npm run db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'club@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'fan1@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f3', 'fan2@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f4', 'copy@example.mv', now(), 'authenticated', 'authenticated');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
create function pg_temp.draft(extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'title', 'Thursday Quiz Night', 'category', 'Culture', 'startsAt', (now() + interval '3 days')::text, 'hours', 2,
    'venueName', 'Café', 'venueArea', 'Malé', 'venueAddress', 'Main Street 1', 'organizerName', 'Quiz Club',
    'description', 'A weekly pub quiz with prizes for the best team.',
    'tiers', jsonb_build_array(jsonb_build_object('name', 'Seat', 'price', 10000, 'capacity', 30))) || extra
$$;

select pg_temp.as_postgres();
update private.settings set card_provider = 'mock';
update public.profiles set verified_at = now() where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f4');

-- Series ----------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select throws_ok($$ select public.create_event(pg_temp.draft(jsonb_build_object('recurrence', jsonb_build_object('every', 'week', 'count', 40)))) $$,
  'P0001', 'invalid_recurrence', 'a series has at most 12 dates');
select lives_ok($$ select set_config('t.first', public.create_event(pg_temp.draft(jsonb_build_object(
  'recurrence', jsonb_build_object('every', 'week', 'count', 4),
  'publicSaleAt', (now() + interval '2 days')::text))), true) $$, 'organiser creates a weekly series with a presale');
select set_config('t.series', (select series_id::text from public.events where id = current_setting('t.first')), true);
select is((select count(*) from public.events where series_id::text = current_setting('t.series')), 4::bigint, 'one event per date');
select is((select count(distinct starts_at) from public.events where series_id::text = current_setting('t.series')), 4::bigint, 'each a week apart');
select ok((select bool_and(public_sale_at is not null) from public.events where series_id::text = current_setting('t.series')),
  'each date gets its own presale window');

select pg_temp.as_postgres();
insert into private.admins values ('00000000-0000-0000-0000-0000000000f4');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f4');
select lives_ok($$ select public.admin_review_event(current_setting('t.first'), true, '') $$, 'admin approves the first date');
select is((select count(*) from public.events where series_id::text = current_setting('t.series') and listing = 'approved'), 4::bigint,
  'approving one date approves the whole series');
select pg_temp.as_postgres();
delete from private.admins where user_id = '00000000-0000-0000-0000-0000000000f4';
select set_config('t.tier', (select id::text from public.tiers where event_id = current_setting('t.first')), true);
select set_config('t.org', (select organizer_id::text from public.events where id = current_setting('t.first')), true);

-- Memberships and presale -------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select throws_ok($$ select public.purchase(current_setting('t.first'),
  jsonb_build_array(jsonb_build_object('tierId', current_setting('t.tier'), 'quantity', 1)), 'Fan One') $$,
  'P0001', 'members_only', 'non-members can''t buy during the presale');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select lives_ok($$ select set_config('t.membership', public.save_membership(current_setting('t.org')::uuid, jsonb_build_object(
  'name', 'Quiz Club Members', 'perks', 'Book first, 10% off', 'price', 50000, 'period', 'year', 'discountPct', 10))::text, true) $$,
  'organiser sets up a membership');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select throws_ok($$ select public.save_membership(current_setting('t.org')::uuid, jsonb_build_object('name', 'Mine', 'price', 100)) $$,
  '42501', 'not_allowed', 'others can''t change it');
select lives_ok($$ select set_config('t.mpay', public.buy_membership(current_setting('t.membership')::uuid)::text, true) $$, 'fan joins');
select lives_ok($$ select public.choose_payment_method(current_setting('t.mpay')::uuid, 'card') $$, 'fan picks card');
select is(public.mock_gateway_complete(current_setting('t.mpay')::uuid, true), 'paid', 'and pays');
select is((select count(*) from public.my_memberships()), 1::bigint, 'the fan is a member');
select lives_ok($$ select set_config('t.order', public.purchase(current_setting('t.first'),
  jsonb_build_array(jsonb_build_object('tierId', current_setting('t.tier'), 'quantity', 2)), 'Fan One')::text, true) $$,
  'members can buy in the presale');
select is((select discount from public.orders where id = current_setting('t.order')::uuid), 2000, 'members get their 10% off');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select is((select sum(amount) from public.ledger where kind = 'sale' and memo like 'Membership%')::int, 45000,
  'the organiser is credited the membership less 10%');

-- Seats --------------------------------------------------------------------------
select set_config('t.second', (select id from public.events where series_id::text = current_setting('t.series') order by starts_at offset 1 limit 1), true);
select pg_temp.as_postgres();
select set_config('t.stier', (select id::text from public.tiers where event_id = current_setting('t.second')), true);
update public.events set public_sale_at = null where id = current_setting('t.second');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select is(public.save_seating(current_setting('t.second'), current_setting('t.stier')::uuid,
  jsonb_build_array(jsonb_build_object('section', 'Hall', 'rows', 2, 'seatsPerRow', 3))), 6, 'organiser lays out 6 seats');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select is((select count(*) from public.seat_map(current_setting('t.second')) where free), 6::bigint, 'buyers see 6 free seats');
select throws_ok($$ select * from public.seats $$, '42501', null, 'buyers can''t read who holds seats');
select throws_ok($$ select public.purchase(current_setting('t.second'),
  jsonb_build_array(jsonb_build_object('tierId', current_setting('t.stier'), 'quantity', 2)), 'Fan One') $$,
  'P0001', 'choose_seats', 'seated tickets need seats chosen');
select set_config('t.seats', (select array_agg(id order by seat_position)::text from public.seat_map(current_setting('t.second')) where row_label = 'A' and seat_number <= 2), true);
select lives_ok($$ select set_config('t.sorder', public.purchase(current_setting('t.second'), '[]', 'Fan One', null, '[]', null, null,
  current_setting('t.seats')::uuid[])::text, true) $$, 'fan picks seats A1 and A2');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
select throws_ok($$ select public.purchase(current_setting('t.second'), '[]', 'Fan Two', null, '[]', null, null, current_setting('t.seats')::uuid[]) $$,
  'P0001', 'seat_taken', 'held seats can''t be bought twice');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select set_config('t.spay', (select payment_id::text from public.orders where id = current_setting('t.sorder')::uuid), true);
select lives_ok($$ select public.choose_payment_method(current_setting('t.spay')::uuid, 'card') $$, 'fan picks card');
select is(public.mock_gateway_complete(current_setting('t.spay')::uuid, true), 'paid', 'and pays');
select is((select array_agg(seat_label order by seat_label) from public.tickets where order_id = current_setting('t.sorder')::uuid),
  array['Hall, row A, seat 1', 'Hall, row A, seat 2'], 'tickets carry their seats');
select lives_ok($$ select public.transfer_ticket((select code from public.tickets where order_id = current_setting('t.sorder')::uuid
  and transferred_at is null order by seat_label limit 1), 'Fan Two', 'fan2@example.mv') $$, 'fan sends one on');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
select is((select seat_label from public.tickets where owner_id = auth.uid() and transferred_at is null), 'Hall, row A, seat 1',
  'a ticket that''s sent on keeps its seat');

-- Trust --------------------------------------------------------------------------
select throws_ok($$ select public.review_organizer(current_setting('t.first'), 5, 'Great') $$,
  'P0001', 'review_not_open', 'only people who were there can review, after the event');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f4');
select lives_ok($$ select set_config('t.copy', public.create_event(pg_temp.draft(jsonb_build_object('title', 'Thursday Quiz Nite', 'organizerName', 'Other'))), true) $$,
  'someone lists an event with nearly the same name');
select is((select review_flags from public.events where id = current_setting('t.copy')), array['similar_title'],
  'it''s flagged as a possible copy');
select is((select listing::text from public.events where id = current_setting('t.copy')), 'pending', '... and waits for a human');

select pg_temp.as_postgres();
insert into private.admins values ('00000000-0000-0000-0000-0000000000f4');
update public.events set listing = 'approved' where id = current_setting('t.copy');
insert into public.saved_events values ('00000000-0000-0000-0000-0000000000f3', current_setting('t.copy'));
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f4');
select lives_ok($$ select public.admin_takedown_event(current_setting('t.copy'), 'Copy of Quiz Club.') $$, 'admin takes the copy down');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
select is((select count(*) from public.notifications where kind = 'alert'), 1::bigint, 'people who saved it get a scam alert');

-- Withdrawals to an account in someone else's name are flagged for a closer look.
select pg_temp.as_postgres();
insert into public.verifications (user_id, kind, status, legal_name, phone, id_kind, id_number, document_path)
values ('00000000-0000-0000-0000-0000000000f1', 'identity', 'approved', 'Mariyam Shifa', '+960 7771234', 'national_id', 'A111111',
  '00000000-0000-0000-0000-0000000000f1/id.jpg');
insert into public.payout_accounts (user_id, bank, account_name, account_number, changed_at)
values ('00000000-0000-0000-0000-0000000000f1', 'BML', 'Ibrahim Rasheed', '7730000999999', now() - interval '3 days');
insert into public.ledger (user_id, amount, kind, memo, available_at) values ('00000000-0000-0000-0000-0000000000f1', 50000, 'adjustment', 'test', now());
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select lives_ok($$ select set_config('t.payout', public.request_payout()::text, true) $$, 'organiser withdraws');
select is((select flags from public.payouts where id = current_setting('t.payout')::uuid), array['name_mismatch', 'first_payout'],
  'a name that doesn''t match the verified one, and a first withdrawal, are flagged');

select * from finish();
rollback;
