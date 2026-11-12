-- Trust, payments, payouts, resale and growth features. Run with `npm run db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(69);

insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-0000-0000-0000000000e1', 'seller@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'buyer@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e3', 'second@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e4', 'staff@example.mv', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e5', 'promoter@example.mv', now(), 'authenticated', 'authenticated');
insert into private.admins (user_id) values ('00000000-0000-0000-0000-0000000000e4');

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
    'title', 'Money Night', 'category', 'Music', 'startsAt', (now() + interval '5 days')::text, 'hours', 3,
    'venueName', 'Hall', 'venueArea', 'Malé', 'venueAddress', 'Main Street 1', 'organizerName', 'Cash Sounds',
    'description', 'A night to test payments and payouts properly.',
    'tiers', jsonb_build_array(jsonb_build_object('name', 'General', 'price', 20000, 'capacity', 4))) || extra
$$;

select pg_temp.as_postgres();
update private.settings set card_provider = 'mock', bank_account_number = '7730000000001', bank_name = 'BML',
  bank_account_name = 'eventspace', ticket_fee_bps = 500, ticket_fee_fixed = 500, fee_cap_bps = 2000,
  hold_days = 3, min_payout = 10000;

-- Listings and verification ----------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select lives_ok($$ select set_config('t.event', public.create_event(pg_temp.draft()), true) $$, 'anyone can draft an event');
select is((select listing::text from public.events where id = current_setting('t.event')), 'draft',
  'an unverified organiser''s event is a draft');

select pg_temp.as_anon();
select is((select count(*) from public.events where id = current_setting('t.event')), 0::bigint, 'the public cannot see a draft');
select is((select count(*) from public.tiers where event_id = current_setting('t.event')), 0::bigint, '... or its tickets');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select is((select count(*) from public.events where id = current_setting('t.event')), 0::bigint, 'other people cannot see a draft');
select throws_ok($$ select public.purchase(current_setting('t.event'),
  jsonb_build_array(jsonb_build_object('tierId', (select id from public.tiers limit 1), 'quantity', 1)), 'Buyer') $$,
  'P0001', 'event_not_found', 'a draft cannot be bought');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$ select public.submit_identity_verification(jsonb_build_object(
    'legalName', 'Seller Person', 'phone', '+960 777 1234', 'idKind', 'national_id', 'idNumber', 'A123456',
    'documentPath', '00000000-0000-0000-0000-0000000000e2/id.jpg')) $$,
  'P0001', 'invalid_document', 'cannot submit someone else''s document');
select lives_ok($$ select set_config('t.verif', public.submit_identity_verification(jsonb_build_object(
    'legalName', 'Seller Person', 'phone', '+960 777 1234', 'idKind', 'national_id', 'idNumber', 'a123456',
    'documentPath', '00000000-0000-0000-0000-0000000000e1/id.jpg'))::text, true) $$, 'organiser submits ID');
select throws_ok($$ select public.submit_identity_verification(jsonb_build_object(
    'legalName', 'Seller Person', 'phone', '+960 777 1234', 'idKind', 'national_id', 'idNumber', 'A123456',
    'documentPath', '00000000-0000-0000-0000-0000000000e1/id.jpg')) $$,
  'P0001', 'verification_pending', 'one pending verification at a time');
select throws_ok($$ select public.admin_review_verification(current_setting('t.verif')::uuid, true, '') $$,
  '42501', 'not_allowed', 'people cannot approve themselves');
select throws_ok($$ update public.profiles set verified_at = now() $$, '42501', null, 'cannot mark yourself verified');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select is((select count(*) from public.verifications), 0::bigint, 'others cannot read someone''s verification');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4');
select is((select count(*) from public.verifications where id = current_setting('t.verif')::uuid), 1::bigint, 'admins see the queue');
select throws_ok($$ select public.admin_review_verification(current_setting('t.verif')::uuid, false, '') $$,
  'P0001', 'note_required', 'rejecting needs a reason');
select lives_ok($$ select public.admin_review_verification(current_setting('t.verif')::uuid, true, '') $$, 'admin approves');
select is((select listing::text from public.events where id = current_setting('t.event')), 'pending',
  'approval sends the draft to review');
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000000000e1'), 0::bigint,
  'admins cannot read other people''s notifications');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select ok((public.my_status() ->> 'verified')::boolean, 'the organiser is now verified');
select lives_ok($$ select set_config('t.event2', public.create_event(pg_temp.draft(jsonb_build_object('title', 'Second Night'))), true) $$,
  'verified organiser creates another event');
select is((select listing::text from public.events where id = current_setting('t.event2')), 'pending',
  'a verified but new organiser''s event waits for review');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4');
select lives_ok($$ select public.admin_review_event(current_setting('t.event'), true, '') $$, 'admin approves the listing');

select pg_temp.as_anon();
select is((select count(*) from public.events where id = current_setting('t.event')), 1::bigint, 'approved events are public');

-- Buying with the mock card gateway ---------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select lives_ok($$ select public.save_addons(current_setting('t.event'), jsonb_build_array(
  jsonb_build_object('kind', 'transfer', 'name', 'Speedboat from Malé', 'price', 5000, 'capacity', 2))) $$, 'organiser adds a speedboat');
select lives_ok($$ select public.save_promoter_link(current_setting('t.event'), 'Promo Pal', 'pal', 'promoter@example.mv', 10) $$,
  'organiser makes a promoter link');
select pg_temp.as_postgres();
select set_config('t.tier', (select id::text from public.tiers where event_id = current_setting('t.event')), true);
select set_config('t.addon', (select id::text from public.event_addons where event_id = current_setting('t.event')), true);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select lives_ok($$ select set_config('t.order', public.purchase(current_setting('t.event'),
    jsonb_build_array(jsonb_build_object('tierId', current_setting('t.tier'), 'quantity', 2)), 'Buyer', null,
    jsonb_build_array(jsonb_build_object('addonId', current_setting('t.addon'), 'quantity', 2)), 'PAL')::text, true) $$,
  'buyer checks out 2 tickets and 2 boat seats through a promoter');
select is((select status from public.orders where id = current_setting('t.order')::uuid), 'pending_payment', 'the order waits for payment');
select is((select count(*) from public.tickets), 0::bigint, 'no tickets before payment');
select is((select sold from public.tiers where id = current_setting('t.tier')::uuid), 2, 'the tickets are held');
-- 2 x 200 + 2 x 50 = 500.00; fee 5% (25.00) + 5.00 per ticket = 35.00, passed on.
select is((select amount from public.payments where order_id = current_setting('t.order')::uuid), 53500, 'the buyer pays the price plus the fee');
select is((select organiser_net from public.orders where id = current_setting('t.order')::uuid), 46000,
  'the organiser keeps the price less 10% promoter commission on tickets');
select set_config('t.payment', (select payment_id::text from public.orders where id = current_setting('t.order')::uuid), true);
select throws_ok($$ select public.gateway_settle(current_setting('t.payment')::uuid, 'bml', 'x', 53500) $$,
  '42501', null, 'buyers cannot settle their own payment');
select throws_ok($$ update public.payments set status = 'paid' $$, '42501', null, 'cannot mark a payment paid directly');
select lives_ok($$ select public.choose_payment_method(current_setting('t.payment')::uuid, 'card') $$, 'buyer picks card');
select is(public.mock_gateway_complete(current_setting('t.payment')::uuid, false), 'declined', 'a declined card leaves it pending');
select is(public.mock_gateway_complete(current_setting('t.payment')::uuid, true), 'paid', 'the mock gateway confirms');
select is((select count(*) from public.tickets), 2::bigint, 'paying issues the tickets');
select is(public.mock_gateway_complete(current_setting('t.payment')::uuid, true), 'paid', 'settling twice is harmless');
select is((select count(*) from public.tickets), 2::bigint, '... and issues nothing extra');
select is((select count(*) from public.my_ticket_secrets()), 2::bigint, 'the holder gets secrets for rotating QR codes');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e5');
select is((select sum(amount) from public.ledger)::int, 4000, 'the promoter is credited 10% of the tickets');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select is((public.my_wallet() ->> 'pending')::int, 46000, 'the organiser''s money waits until after the event');
select is((public.my_wallet() ->> 'available')::int, 0, '... so nothing can be withdrawn yet');
select is((select count(*) from public.my_ticket_secrets()), 0::bigint, 'organisers never get ticket secrets');

-- Rotating QR codes at the door ----------------------------------------------------
select lives_ok($$ select public.add_event_staff(current_setting('t.event'), 'staff@example.mv') $$, 'organiser adds door staff');
select pg_temp.as_postgres();
select set_config('t.code', (select code from public.tickets where event_id = current_setting('t.event') order by code limit 1), true);
select set_config('t.qr', (select t.code || '.' || floor(extract(epoch from now()) / 30)::bigint || '.'
  || private.qr_token(s.secret, floor(extract(epoch from now()) / 30)::bigint)
  from public.tickets t join private.ticket_secrets s on s.ticket_id = t.id where t.code = current_setting('t.code')), true);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4');
select is(public.check_in(current_setting('t.code') || '.100.deadbeef') ->> 'status', 'expired_qr', 'an old or forged QR is refused');
select is(public.check_in(current_setting('t.qr')) ->> 'status', 'admitted', 'a live QR is admitted');

-- Expiry gives inventory back --------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select lives_ok($$ select set_config('t.order2', public.purchase(current_setting('t.event'),
    jsonb_build_array(jsonb_build_object('tierId', current_setting('t.tier'), 'quantity', 2)), 'Second')::text, true) $$,
  'a second buyer holds the last 2 tickets');
select throws_ok($$ select public.purchase(current_setting('t.event'),
    jsonb_build_array(jsonb_build_object('tierId', current_setting('t.tier'), 'quantity', 1)), 'Second') $$,
  'P0001', 'sold_out', 'held tickets count as sold');
select pg_temp.as_postgres();
update public.payments set expires_at = now() - interval '1 minute'
where order_id = current_setting('t.order2')::uuid;
select private.expire_payments();
select is((select sold from public.tiers where id = current_setting('t.tier')::uuid), 2, 'an expired hold is released');
select is((select status from public.orders where id = current_setting('t.order2')::uuid), 'expired', 'the order is marked expired');

-- Bank transfers are confirmed by admins against the statement ----------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select lives_ok($$ select set_config('t.order3', public.purchase(current_setting('t.event'),
    jsonb_build_array(jsonb_build_object('tierId', current_setting('t.tier'), 'quantity', 1)), 'Second')::text, true) $$,
  'the second buyer tries again');
select pg_temp.as_postgres();
select set_config('t.payment3', (select payment_id::text from public.orders where id = current_setting('t.order3')::uuid), true);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select lives_ok($$ select public.choose_payment_method(current_setting('t.payment3')::uuid, 'transfer') $$, 'they choose bank transfer');
select throws_ok($$ select public.admin_confirm_transfer(current_setting('t.payment3')::uuid, 'FT123') $$,
  '42501', 'not_allowed', 'buyers cannot confirm their own transfer');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e4');
select is(public.admin_confirm_transfer(current_setting('t.payment3')::uuid, 'FT26290001'), 'paid', 'an admin matches the statement line');

-- Resale -----------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select set_config('t.code2', (select code from public.tickets where checked_in_at is null and owner_id = auth.uid() limit 1), true);
select throws_ok($$ select public.list_resale(current_setting('t.code2'), 30000) $$,
  'P0001', 'resale_price_cap', 'resale is capped at 110% of face value');
select lives_ok($$ select set_config('t.listing', public.list_resale(current_setting('t.code2'), 22000)::text, true) $$,
  'buyer lists a ticket at the cap');
select throws_ok($$ select public.transfer_ticket(current_setting('t.code2'), 'Friend', 'friend@example.mv') $$,
  'P0001', 'ticket_listed', 'a listed ticket cannot also be sent');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select is((select count(*) from public.resale_offers(current_setting('t.event'))), 1::bigint, 'others see the offer');
select lives_ok($$ select set_config('t.rpay', public.buy_resale(current_setting('t.listing')::uuid, 'Second')::text, true) $$,
  'someone buys it');
select is(public.mock_gateway_complete(current_setting('t.rpay')::uuid, true), 'paid', 'and pays');
select is((select count(*) from public.tickets where owner_id = auth.uid() and transferred_at is null), 2::bigint,
  'the buyer now holds it with a fresh code');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select is((select transferred_at is not null from public.tickets where code = current_setting('t.code2')), true,
  'the seller''s old code is void');
select is((select amount from public.ledger where kind = 'resale'), 20900, 'the seller is credited the price less 5%');

-- Cancelling refunds everyone (the Guarantee) ------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select lives_ok($$ select public.cancel_event(current_setting('t.event'), 'Storm warning.') $$, 'organiser cancels');
select is((public.my_wallet() ->> 'pending')::int, 0, 'the organiser''s credit is reversed');
select pg_temp.as_postgres();
select is((select count(*) from public.payments where status = 'refund_due'), 3::bigint, 'every paid checkout is queued for refund');

-- Reports, wallet and payouts ----------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select throws_ok($$ select public.request_payout() $$, 'P0001', 'not_verified', 'unverified people cannot withdraw');
select throws_ok($$ select public.report('event', current_setting('t.event2'), 'scam', 'x') $$,
  'P0001', 'not_found', 'cannot report a listing that isn''t public');

select pg_temp.as_anon();
select throws_ok($$ select public.my_wallet() $$, '42501', null, 'anon has no wallet');

select * from finish();
rollback;
