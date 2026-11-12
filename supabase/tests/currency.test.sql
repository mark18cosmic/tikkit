-- Events priced in US dollars. Run with `npm run db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'divecentre@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'visitor@example.com', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c3', 'boss@example.mv', now(), 'authenticated', 'authenticated');
insert into private.admins (user_id) values ('00000000-0000-0000-0000-0000000000c3');
update public.profiles set verified_at = now() where id = '00000000-0000-0000-0000-0000000000c1';

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
create function pg_temp.draft(extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'title', 'Manta Morning', 'category', 'Water', 'startsAt', (now() + interval '5 days')::text, 'hours', 4,
    'venueName', 'Hanifaru Bay', 'venueArea', 'Baa', 'venueAddress', 'Dharavandhoo jetty', 'organizerName', 'Blue Dive Co',
    'description', 'Snorkel with mantas, boat and guide included.', 'currency', 'USD',
    'tiers', jsonb_build_array(jsonb_build_object('name', 'Snorkeller', 'price', 5000, 'capacity', 6))) || extra
$$;

select pg_temp.as_postgres();
update private.settings set card_provider = 'mock', bank_account_number = '7730000000001', bank_account_number_usd = null,
  bank_name = 'BML', bank_account_name = 'Tikkit', ticket_fee_bps = 500, ticket_fee_fixed = 500, ticket_fee_fixed_usd = 30,
  fee_cap_bps = 2000, min_payout = 10000, min_payout_usd = 1000;

-- Creating ------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$ select public.create_event(pg_temp.draft(jsonb_build_object('currency', 'EUR'))) $$,
  'P0001', 'invalid_currency', 'only MVR and USD');
select lives_ok($$ select set_config('t.event', public.create_event(pg_temp.draft()), true) $$, 'an organiser creates a USD event');
select is((select currency from public.events where id = current_setting('t.event')), 'USD', 'the event is in USD');
select set_config('t.plain', public.create_event(pg_temp.draft(jsonb_build_object('currency', null))), true);
select is((select currency from public.events where id = current_setting('t.plain')), 'MVR', 'events are in MVR unless chosen');
select lives_ok($$ select set_config('t.pricey', public.create_event(pg_temp.draft(jsonb_build_object('title', 'Liveaboard week',
  'tiers', jsonb_build_array(jsonb_build_object('name', 'Cabin', 'price', 90000, 'capacity', 2))))), true) $$, 'a USD 900 trip');
select ok((select 'high_price' = any (review_flags) from public.events where id = current_setting('t.pricey')),
  'over USD 650 gets a human look');

select pg_temp.as_postgres();
update public.events set listing = 'approved' where id = current_setting('t.event');
select set_config('t.tier', (select id::text from public.tiers where event_id = current_setting('t.event')), true);
select is((public.payment_config() ->> 'ticketFeeFixedUsd')::int, 30, 'checkout knows the USD fee');

-- Buying --------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select lives_ok($$ select set_config('t.order', public.purchase(current_setting('t.event'),
    jsonb_build_array(jsonb_build_object('tierId', current_setting('t.tier'), 'quantity', 2)), 'Visitor')::text, true) $$,
  'a visitor buys 2 places');
select set_config('t.payment', (select payment_id::text from public.orders where id = current_setting('t.order')::uuid), true);
-- 2 x USD 50 = 100.00; fee 5% (5.00) + USD 0.30 per ticket = 5.60, passed on.
select is((select amount from public.payments where id = current_setting('t.payment')::uuid), 10560, 'the fee is in dollars');
select is((select currency from public.payments where id = current_setting('t.payment')::uuid), 'USD', 'the payment is in USD');
select throws_ok($$ select public.choose_payment_method(current_setting('t.payment')::uuid, 'transfer') $$,
  'P0001', 'method_unavailable', 'no transfer without a USD account to send it to');
select lives_ok($$ select public.choose_payment_method(current_setting('t.payment')::uuid, 'card') $$, 'chooses card');
select is(public.mock_gateway_complete(current_setting('t.payment')::uuid, true), 'paid', 'paid by card');

-- Locked once sold ------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$ select public.update_event(current_setting('t.event'), pg_temp.draft(jsonb_build_object('currency', 'MVR',
  'tiers', jsonb_build_array(jsonb_build_object('id', current_setting('t.tier'), 'name', 'Snorkeller', 'price', 5000, 'capacity', 6))))) $$,
  'P0001', 'currency_locked', 'the currency can''t change after a sale');

-- Wallet and withdrawals ----------------------------------------------------------
select is((public.my_wallet() -> 'usd' ->> 'pending')::int, 10000, 'the organiser''s dollars wait for the event');
select is((public.my_wallet() ->> 'pending')::int, 0, 'and aren''t mixed into rufiyaa');

select pg_temp.as_postgres();
update public.ledger set available_at = now() - interval '1 day' where user_id = '00000000-0000-0000-0000-0000000000c1';

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select lives_ok($$ select public.set_payout_account('BML', 'Blue Dive Co', '7730000012345') $$, 'adds a rufiyaa account');
select pg_temp.as_postgres();
update public.payout_accounts set changed_at = now() - interval '3 days' where user_id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$ select public.request_payout('USD') $$, 'P0001', 'no_usd_account', 'USD needs a USD account');
select throws_ok($$ select public.request_payout('MVR') $$, 'P0001', 'below_min_payout', 'there are no rufiyaa to withdraw');
select lives_ok($$ select public.set_payout_account('BML', 'Blue Dive Co', '7730000012345', '7770000054321') $$, 'adds a USD account');
select throws_ok($$ select public.request_payout('USD') $$, 'P0001', 'account_cooling_off', 'a new account waits 48 hours');
select pg_temp.as_postgres();
update public.payout_accounts set changed_at = now() - interval '3 days' where user_id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select lives_ok($$ select set_config('t.payout', public.request_payout('USD')::text, true) $$, 'withdraws the dollars');
select is((select currency || ' ' || amount || ' ' || (account ->> 'accountNumber') from public.payouts where id = current_setting('t.payout')::uuid),
  'USD 10000 7770000054321', 'the payout goes to the USD account');
select is((public.my_wallet() -> 'usd' ->> 'available')::int, 0, 'the USD balance is withdrawn');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select is((public.admin_overview() ->> 'revenue30dUsd')::int, 560, 'admins see USD fees separately');

select * from finish();
rollback;
