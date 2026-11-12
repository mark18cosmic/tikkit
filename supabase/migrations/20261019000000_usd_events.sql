-- Events priced in US dollars.
--
-- Some events (resort nights, tourist trips, international acts) sell in USD.
-- An event has one currency, chosen by the organiser, and everything bought
-- for it is in that currency: tickets, add-ons, resale and the booking fee.
-- Amounts stay in minor units (laari or cents).
--
-- Money is never converted. A payment carries its event's currency, the
-- ledger keeps a balance per currency, and withdrawals are per currency: USD
-- goes to a USD account. Spaces, Organiser Pro, promoted listings and
-- memberships stay in MVR.

-- ---------------------------------------------------------------------------
-- Columns and settings
-- ---------------------------------------------------------------------------

alter table public.events add column currency text not null default 'MVR' check (currency in ('MVR', 'USD'));
alter table public.payments add constraint payments_currency_check check (currency in ('MVR', 'USD'));
alter table public.ledger add column currency text not null default 'MVR' check (currency in ('MVR', 'USD'));
alter table public.payouts add column currency text not null default 'MVR' check (currency in ('MVR', 'USD'));
-- Maldivian banks keep USD in a separate account.
alter table public.payout_accounts add column usd_account_number text check (usd_account_number ~ '^[0-9]{7,20}$');

alter table private.settings
  -- The percentage parts of the fee are the same in both currencies; the
  -- fixed part per ticket and the smallest withdrawal are set per currency.
  add column ticket_fee_fixed_usd int not null default 30 check (ticket_fee_fixed_usd between 0 and 10000),
  add column min_payout_usd int not null default 1000,
  -- Tikkit's USD account for bank transfers. Transfers for USD events are
  -- offered only when set.
  add column bank_account_number_usd text;

create index ledger_user_currency_idx on public.ledger (user_id, currency);

-- ---------------------------------------------------------------------------
-- Currency follows the event, never the caller
-- ---------------------------------------------------------------------------

-- A payment for tickets or resale is in its event's currency. Everything
-- else Tikkit sells is in MVR.
create function private.payments_set_currency() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.currency := coalesce(
    case new.purpose
      when 'order' then (select e.currency from public.orders o join public.events e on e.id = o.event_id where o.id = new.order_id)
      when 'resale' then (select e.currency from public.resale_listings r join public.events e on e.id = r.event_id where r.id = new.resale_id)
    end,
    'MVR');
  return new;
end;
$$;
create trigger payments_set_currency before insert on public.payments
for each row execute function private.payments_set_currency();

-- A ledger line is in the currency of the payment or withdrawal behind it.
create function private.ledger_set_currency() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.currency := coalesce(
    (select currency from public.payments where id = new.payment_id),
    (select currency from public.payouts where id = new.payout_id),
    new.currency);
  return new;
end;
$$;
create trigger ledger_set_currency before insert on public.ledger
for each row execute function private.ledger_set_currency();

-- Once anyone has bought, the currency is fixed: their tickets were priced in it.
create function private.events_lock_currency() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.currency is distinct from old.currency and (
    exists (select 1 from public.orders where event_id = new.id and status in ('pending_payment', 'confirmed', 'refunded'))
    or exists (select 1 from public.resale_listings where event_id = new.id)
  ) then
    raise exception 'currency_locked';
  end if;
  return new;
end;
$$;
create trigger events_lock_currency before update of currency on public.events
for each row execute function private.events_lock_currency();

-- ---------------------------------------------------------------------------
-- Creating and editing events with a currency
-- ---------------------------------------------------------------------------

-- The existing versions do the work; these wrap them and set the currency.
alter function public.create_event(jsonb) rename to create_event_base;
alter function public.create_event_base(jsonb) set schema private;
alter function public.update_event(text, jsonb) rename to update_event_base;
alter function public.update_event_base(text, jsonb) set schema private;
revoke execute on function private.create_event_base(jsonb), private.update_event_base(text, jsonb) from public, anon, authenticated;

-- Very expensive tickets always get a human look. MVR 10,000 or about USD 650.
create function private.flag_high_price(p_event_id text) returns void
language sql security definer set search_path = '' as $$
  update public.events e set review_flags = array_append(e.review_flags, 'high_price'),
    listing = case when e.listing = 'approved' then 'pending'::public.listing_status else e.listing end,
    auto_approved = false
  where e.id = p_event_id and not ('high_price' = any (e.review_flags))
    and exists (select 1 from public.tiers t where t.event_id = e.id
                and t.price > case e.currency when 'USD' then 65000 else 1000000 end)
$$;

-- p as before, plus currency: 'MVR' (default) or 'USD'. A series shares one currency.
create function public.create_event(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_currency text := coalesce(nullif(p ->> 'currency', ''), 'MVR');
  v_first text;
  v_series uuid;
  v_id text;
begin
  if v_currency not in ('MVR', 'USD') then raise exception 'invalid_currency'; end if;
  v_first := private.create_event_base(p);
  select series_id into v_series from public.events where id = v_first;
  for v_id in
    select id from public.events where id = v_first or (v_series is not null and series_id = v_series)
  loop
    update public.events set currency = v_currency where id = v_id;
    perform private.flag_high_price(v_id);
  end loop;
  return v_first;
end;
$$;

-- p as before, plus an optional currency, which can only change before anyone buys.
create function public.update_event(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_currency text := nullif(p ->> 'currency', '');
begin
  if v_currency is not null and v_currency not in ('MVR', 'USD') then raise exception 'invalid_currency'; end if;
  perform private.update_event_base(p_id, p);
  if v_currency is not null then
    update public.events set currency = v_currency where id = p_id and currency <> v_currency;
  end if;
  perform private.flag_high_price(p_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fees
-- ---------------------------------------------------------------------------

drop function private.ticket_fee(int, int, uuid);

-- Booking fee for what's in a basket: a percentage plus a fixed amount per
-- paid ticket in the basket's currency, never more than the cap.
create function private.ticket_fee(p_base int, p_paid_tickets int, p_owner uuid, p_currency text default 'MVR') returns int
language sql stable security definer set search_path = '' as $$
  select case when p_base <= 0 then 0 else least(
    round(p_base * (case when private.is_pro(p_owner) then s.pro_ticket_fee_bps else s.ticket_fee_bps end) / 10000.0)::int
      + (case when p_currency = 'USD' then s.ticket_fee_fixed_usd else s.ticket_fee_fixed end) * p_paid_tickets,
    round(p_base * s.fee_cap_bps / 10000.0)::int
  ) end
  from private.settings s
$$;

create or replace function public.payment_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'card', s.card_provider <> 'none',
    'provider', s.card_provider,
    'transfer', s.bank_account_number is not null,
    'transferUsd', s.bank_account_number_usd is not null,
    'bank', case when s.bank_account_number is not null then jsonb_build_object(
      'name', s.bank_name, 'accountName', s.bank_account_name, 'accountNumber', s.bank_account_number) end,
    'bankUsd', case when s.bank_account_number_usd is not null then jsonb_build_object(
      'name', s.bank_name, 'accountName', s.bank_account_name, 'accountNumber', s.bank_account_number_usd) end,
    'ticketFeeBps', s.ticket_fee_bps,
    'ticketFeeFixed', s.ticket_fee_fixed,
    'ticketFeeFixedUsd', s.ticket_fee_fixed_usd,
    'proTicketFeeBps', s.pro_ticket_fee_bps,
    'feeCapBps', s.fee_cap_bps,
    'rentalFeeBps', s.rental_fee_bps,
    'resaleFeeBps', s.resale_fee_bps,
    'resaleCapBps', s.resale_cap_bps,
    'membershipFeeBps', s.membership_fee_bps,
    'promotedDayPrice', s.promoted_day_price,
    'proMonthPrice', s.pro_month_price,
    'proYearPrice', s.pro_year_price,
    'holdDays', s.hold_days,
    'minPayout', s.min_payout,
    'minPayoutUsd', s.min_payout_usd
  )
  from private.settings s
$$;

-- A transfer goes to Tikkit's account in the payment's currency.
create or replace function public.choose_payment_method(p_payment_id uuid, p_method text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  s private.settings := private.settings();
  v_deadline timestamptz;
  v_expires timestamptz;
begin
  perform private.expire_payments();
  select * into p from public.payments where id = p_payment_id and payer_id = auth.uid() for update;
  if not found then raise exception 'payment_not_found'; end if;
  if p.status <> 'pending' then raise exception 'payment_not_pending'; end if;

  -- The latest a transfer could clear: 2 hours before the thing it pays for.
  v_deadline := case p.purpose
    when 'order' then (select e.starts_at from public.orders o join public.events e on e.id = o.event_id where o.id = p.order_id)
    when 'booking' then (select starts_at from public.venue_bookings where id = p.booking_id)
    when 'resale' then (select e.starts_at from public.resale_listings r join public.events e on e.id = r.event_id where r.id = p.resale_id)
    else now() + interval '30 days'
  end - interval '2 hours';

  if p_method = 'card' then
    if s.card_provider = 'none' then raise exception 'method_unavailable'; end if;
    v_expires := least(greatest(p.expires_at, now() + interval '20 minutes'), p.created_at + interval '60 minutes');
  elsif p_method = 'transfer' then
    if (case when p.currency = 'USD' then s.bank_account_number_usd else s.bank_account_number end) is null then
      raise exception 'method_unavailable';
    end if;
    if p.purpose = 'resale' then raise exception 'method_unavailable'; end if;
    v_expires := least(now() + interval '24 hours', v_deadline);
    if p.purpose = 'booking' then v_expires := least(v_expires, p.expires_at); end if;
    if v_expires < now() + interval '1 hour' then raise exception 'transfer_too_late'; end if;
  else
    raise exception 'method_unavailable';
  end if;

  update public.payments set method = p_method, expires_at = v_expires where id = p.id;
  return jsonb_build_object('method', p_method, 'expiresAt', v_expires, 'reference', p.reference);
end;
$$;

-- ---------------------------------------------------------------------------
-- Wallet and withdrawals, per currency
-- ---------------------------------------------------------------------------

drop function private.balance(uuid);

-- available: can be withdrawn now. pending: waiting for events to finish.
-- held: frozen by reports or an admin.
create function private.balance(p_uid uuid, p_currency text default 'MVR') returns table (available bigint, pending bigint, held bigint)
language sql stable security definer set search_path = '' as $$
  select
    coalesce(sum(l.amount) filter (where l.available_at <= now() and not coalesce(e.payout_hold, false)), 0)::bigint,
    coalesce(sum(l.amount) filter (where l.available_at > now() and not coalesce(e.payout_hold, false)), 0)::bigint,
    coalesce(sum(l.amount) filter (where coalesce(e.payout_hold, false)), 0)::bigint
  from public.ledger l left join public.events e on e.id = l.event_id
  where l.user_id = p_uid and l.currency = p_currency
$$;

-- MVR at the top level, as before; USD alongside when there's any.
create or replace function public.my_wallet() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'available', b.available, 'pending', b.pending, 'held', b.held,
    'minPayout', (private.settings()).min_payout,
    'usd', case when exists (select 1 from public.ledger where user_id = (select auth.uid()) and currency = 'USD') then
      jsonb_build_object('available', u.available, 'pending', u.pending, 'held', u.held,
        'minPayout', (private.settings()).min_payout_usd) end,
    'account', (select jsonb_build_object('bank', a.bank, 'accountName', a.account_name,
                  'accountNumber', '•••• ' || right(a.account_number, 4),
                  'usdAccountNumber', case when a.usd_account_number is not null then '•••• ' || right(a.usd_account_number, 4) end,
                  'changedAt', a.changed_at)
                from public.payout_accounts a where a.user_id = (select auth.uid()))
  )
  from private.balance((select auth.uid()), 'MVR') b, private.balance((select auth.uid()), 'USD') u
$$;

drop function public.set_payout_account(text, text, text);

-- p_usd_number: the USD account at the same bank, for USD earnings. Optional.
create function public.set_payout_account(p_bank text, p_name text, p_number text, p_usd_number text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_number text := regexp_replace(coalesce(p_number, ''), '\D', '', 'g');
  v_usd text := nullif(regexp_replace(coalesce(p_usd_number, ''), '\D', '', 'g'), '');
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if coalesce(p_bank, '') not in ('BML', 'MIB', 'SBI', 'CBM', 'Other') then raise exception 'invalid_bank'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'invalid_name'; end if;
  if v_number !~ '^[0-9]{7,20}$' then raise exception 'invalid_account'; end if;
  if v_usd is not null and (v_usd !~ '^[0-9]{7,20}$' or v_usd = v_number) then raise exception 'invalid_usd_account'; end if;
  insert into public.payout_accounts (user_id, bank, account_name, account_number, usd_account_number)
  values (uid, p_bank, trim(p_name), v_number, v_usd)
  on conflict (user_id) do update set bank = excluded.bank, account_name = excluded.account_name,
    account_number = excluded.account_number, usd_account_number = excluded.usd_account_number,
    -- Any change waits 48 hours, so a stolen login can't redirect money at once.
    changed_at = case when (payout_accounts.bank, payout_accounts.account_name, payout_accounts.account_number, payout_accounts.usd_account_number)
                       is distinct from (excluded.bank, excluded.account_name, excluded.account_number, excluded.usd_account_number)
                  then now() else payout_accounts.changed_at end;
end;
$$;

drop function public.request_payout();

-- Withdraws everything available in one currency.
create function public.request_payout(p_currency text default 'MVR') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  a public.payout_accounts;
  v public.verifications;
  v_available bigint;
  v_number text;
  v_min int;
  v_flags text[] := '{}';
  v_id uuid;
  norm text;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if p_currency is null or p_currency not in ('MVR', 'USD') then raise exception 'invalid_currency'; end if;
  if not exists (select 1 from public.profiles where id = uid and verified_at is not null and suspended_at is null) then
    raise exception 'not_verified';
  end if;
  select * into a from public.payout_accounts where user_id = uid;
  if not found then raise exception 'no_payout_account'; end if;
  v_number := case when p_currency = 'USD' then a.usd_account_number else a.account_number end;
  if v_number is null then raise exception 'no_usd_account'; end if;
  if a.changed_at > now() - interval '48 hours' then raise exception 'account_cooling_off'; end if;
  if exists (select 1 from public.payouts where user_id = uid and status = 'requested' and currency = p_currency) then
    raise exception 'payout_pending';
  end if;
  perform pg_advisory_xact_lock(hashtext('payout:' || uid::text));
  select available into v_available from private.balance(uid, p_currency);
  v_min := case when p_currency = 'USD' then (private.settings()).min_payout_usd else (private.settings()).min_payout end;
  if v_available < v_min then raise exception 'below_min_payout'; end if;

  select * into v from public.verifications
  where user_id = uid and kind = 'identity' and status = 'approved' order by created_at desc limit 1;
  norm := regexp_replace(lower(a.account_name), '[^a-z]', '', 'g');
  if norm <> regexp_replace(lower(coalesce(v.legal_name, '')), '[^a-z]', '', 'g')
     and norm <> regexp_replace(lower(coalesce(v.business_name, '')), '[^a-z]', '', 'g')
     and extensions.similarity(lower(a.account_name), lower(coalesce(v.legal_name, ''))) < 0.5
     and extensions.similarity(lower(a.account_name), lower(coalesce(v.business_name, ''))) < 0.5 then
    v_flags := array_append(v_flags, 'name_mismatch');
  end if;
  if not exists (select 1 from public.payouts where user_id = uid and status = 'paid') then
    v_flags := array_append(v_flags, 'first_payout');
  end if;

  insert into public.payouts (user_id, amount, currency, account, flags)
  values (uid, v_available, p_currency, jsonb_build_object('bank', a.bank, 'accountName', a.account_name, 'accountNumber', v_number,
    'verifiedName', coalesce(v.business_name, v.legal_name)), v_flags)
  returning id into v_id;
  insert into public.ledger (user_id, amount, kind, memo, payout_id, available_at)
  values (uid, -v_available, 'payout', 'Withdrawal to ' || a.bank || ' ' || right(v_number, 4), v_id, now());
  return v_id;
end;
$$;

-- Platform takings, for the admin overview, per currency.
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'verifications', (select count(*) from public.verifications where status = 'pending'),
    'listings', (select count(*) from public.events where (listing = 'pending' or edited_after_review) and ends_at > now()),
    'reports', (select count(*) from public.reports where status = 'open'),
    'transfers', (select count(*) from public.payments where status = 'pending' and method = 'transfer'),
    'refunds', (select count(*) from public.payments where status = 'refund_due'),
    'payouts', (select count(*) from public.payouts where status = 'requested'),
    'revenue30d', (select coalesce(sum(fee), 0) from public.payments where status = 'paid' and currency = 'MVR' and paid_at > now() - interval '30 days'),
    'gmv30d', (select coalesce(sum(amount), 0) from public.payments where status = 'paid' and currency = 'MVR' and paid_at > now() - interval '30 days'),
    'revenue30dUsd', (select coalesce(sum(fee), 0) from public.payments where status = 'paid' and currency = 'USD' and paid_at > now() - interval '30 days'),
    'gmv30dUsd', (select coalesce(sum(amount), 0) from public.payments where status = 'paid' and currency = 'USD' and paid_at > now() - interval '30 days')
  );
end;
$$;

-- A balance in either currency blocks deleting the account.
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if exists (
    select 1 from public.events
    where owner_id = uid and ends_at > now() and status <> 'cancelled'
  ) then
    raise exception 'has_upcoming_events';
  end if;
  if exists (
    select 1 from public.venue_bookings b join public.venues v on v.id = b.venue_id
    where v.owner_id = uid and b.requester_id <> uid and b.status = 'approved' and b.ends_at > now()
  ) then
    raise exception 'has_upcoming_bookings';
  end if;
  if exists (select 1 from public.ledger where user_id = uid group by currency having sum(amount) <> 0)
     or exists (select 1 from public.payouts where user_id = uid and status = 'requested') then
    raise exception 'has_balance';
  end if;
  update public.tickets set holder_name = 'Deleted account' where owner_id = uid;
  update public.orders set holder_name = 'Deleted account', email = 'deleted' where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Checkout: the booking fee in the event's currency
-- ---------------------------------------------------------------------------

create or replace function public.purchase(
  p_event_id text, p_lines jsonb, p_holder_name text, p_promo text default null,
  p_addons jsonb default '[]', p_ref text default null, p_gift jsonb default null, p_seats uuid[] default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_email text := private.my_email();
  v_event public.events;
  v_lines jsonb;
  v_addons jsonb;
  v_line record;
  v_tier public.tiers;
  v_addon public.event_addons;
  v_seat public.seats;
  v_seat_count int := coalesce(cardinality(p_seats), 0);
  v_count int := 0;
  v_paid int := 0;
  v_subtotal int := 0;
  v_addons_total int := 0;
  v_discount int := 0;
  v_promo public.promo_codes;
  v_link public.promoter_links;
  v_member boolean;
  v_member_pct int := 0;
  v_gift_name text;
  v_gift_email text;
  v_base int;
  v_fee int;
  v_amount int;
  v_commission int := 0;
  v_order uuid;
  v_payment uuid;
  v_name text := trim(coalesce(p_holder_name, ''));
begin
  if uid is null or v_email is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = uid and suspended_at is not null) then raise exception 'account_suspended'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'invalid_name'; end if;
  perform private.expire_payments();

  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.listing <> 'approved' then raise exception 'event_not_found'; end if;
  if v_event.status = 'cancelled' or v_event.ends_at <= now() then raise exception 'event_closed'; end if;

  v_member := v_event.organizer_id is not null and private.is_member(uid, v_event.organizer_id);
  if v_event.public_sale_at is not null and v_event.public_sale_at > now() and not v_member and v_event.owner_id <> uid then
    raise exception 'members_only';
  end if;

  if jsonb_typeof(coalesce(p_lines, '[]')) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]')) > 5 then
    raise exception 'invalid_lines';
  end if;
  if v_seat_count > 8 or v_seat_count <> coalesce(cardinality(array(select distinct unnest(p_seats))), 0) then
    raise exception 'invalid_seats';
  end if;

  -- Typed quantities for unseated types, plus one line per seated type
  -- worked out from the chosen seats. Sorted by tier so locks are ordered.
  select coalesce(jsonb_agg(jsonb_build_object('tier_id', tier_id, 'quantity', quantity) order by tier_id), '[]')
  into v_lines
  from (
    select tier_id, sum(quantity)::int as quantity from (
      select (l ->> 'tierId')::uuid as tier_id, (l ->> 'quantity')::int as quantity
      from jsonb_array_elements(coalesce(p_lines, '[]')) l
      union all
      select s.tier_id, count(*)::int from public.seats s
      where s.id = any (coalesce(p_seats, '{}')) and s.event_id = p_event_id
      group by s.tier_id
    ) both_kinds
    group by tier_id
  ) merged;

  if exists (
    select 1 from jsonb_array_elements(v_lines) x
    where (x ->> 'quantity') is null or (x ->> 'quantity')::int < 1 or (x ->> 'tier_id') is null
  ) then
    raise exception 'invalid_lines';
  end if;
  select coalesce(sum((x ->> 'quantity')::int), 0) into v_count from jsonb_array_elements(v_lines) x;
  if v_count not between 1 and 8 then raise exception 'invalid_lines'; end if;
  -- Every chosen seat belongs to this event.
  if (select count(*) from public.seats where id = any (coalesce(p_seats, '{}')) and event_id = p_event_id) <> v_seat_count then
    raise exception 'invalid_seats';
  end if;

  if (select count(*) from public.tickets t
      where t.event_id = p_event_id and t.owner_id = uid
        and t.transferred_at is null and t.refund_requested_at is null)
     + (select coalesce(sum(ol.quantity), 0) from public.order_lines ol join public.orders o on o.id = ol.order_id
        where o.user_id = uid and o.event_id = p_event_id and o.status = 'pending_payment')
     + v_count > 20 then
    raise exception 'limit_reached';
  end if;
  if (select count(*) from public.payments where payer_id = uid and status = 'pending') >= 3 then
    raise exception 'too_many_pending';
  end if;

  for v_line in
    select (x ->> 'tier_id')::uuid as tier_id, (x ->> 'quantity')::int as quantity from jsonb_array_elements(v_lines) x
  loop
    select * into v_tier from public.tiers where id = v_line.tier_id and event_id = p_event_id for update;
    if not found then raise exception 'invalid_lines'; end if;
    -- Seated types are bought by choosing seats, never by number.
    if v_tier.seated and v_line.quantity <> (select count(*) from public.seats where id = any (coalesce(p_seats, '{}')) and tier_id = v_tier.id) then
      raise exception 'choose_seats';
    end if;
    if v_tier.capacity - v_tier.sold < v_line.quantity then raise exception 'sold_out'; end if;
    v_subtotal := v_subtotal + v_tier.price * v_line.quantity;
    if v_tier.price > 0 then v_paid := v_paid + v_line.quantity; end if;
  end loop;

  -- Lock the seats in a stable order; any already taken fails the whole order.
  for v_seat in select * from public.seats where id = any (coalesce(p_seats, '{}')) order by id for update loop
    if v_seat.status <> 'available' then raise exception 'seat_taken'; end if;
  end loop;

  if jsonb_typeof(coalesce(p_addons, '[]')) <> 'array' or jsonb_array_length(coalesce(p_addons, '[]')) > 5 then
    raise exception 'invalid_addons';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('addon_id', addon_id, 'quantity', quantity) order by addon_id), '[]')
  into v_addons
  from (
    select (a ->> 'addonId')::uuid as addon_id, sum((a ->> 'quantity')::int)::int as quantity
    from jsonb_array_elements(coalesce(p_addons, '[]')) a
    group by 1
  ) merged;
  for v_line in
    select (x ->> 'addon_id')::uuid as addon_id, (x ->> 'quantity')::int as quantity from jsonb_array_elements(v_addons) x
  loop
    if v_line.addon_id is null or v_line.quantity is null or v_line.quantity not between 1 and 8 then
      raise exception 'invalid_addons';
    end if;
    select * into v_addon from public.event_addons where id = v_line.addon_id and event_id = p_event_id for update;
    if not found then raise exception 'invalid_addons'; end if;
    if v_addon.capacity - v_addon.sold < v_line.quantity then raise exception 'addon_sold_out'; end if;
    v_addons_total := v_addons_total + v_addon.price * v_line.quantity;
  end loop;

  if nullif(trim(coalesce(p_promo, '')), '') is not null then
    v_promo := private.find_promo(p_event_id, p_promo);
    if v_promo.id is null then raise exception 'invalid_promo'; end if;
    select * into v_promo from public.promo_codes where id = v_promo.id for update;
    if not v_promo.active or (v_promo.max_uses is not null and v_promo.used >= v_promo.max_uses) then
      raise exception 'invalid_promo';
    end if;
    v_discount := round(v_subtotal * v_promo.percent_off / 100.0)::int;
    update public.promo_codes set used = used + 1 where id = v_promo.id;
  elsif v_member then
    -- Members' standing discount, when there's no code.
    select discount_pct into v_member_pct from public.memberships where organizer_id = v_event.organizer_id and active;
    v_discount := round(v_subtotal * coalesce(v_member_pct, 0) / 100.0)::int;
  end if;

  if nullif(trim(coalesce(p_ref, '')), '') is not null then
    select * into v_link from public.promoter_links
    where event_id = p_event_id and code = lower(trim(p_ref)) and active;
  end if;

  if p_gift is not null then
    v_gift_name := trim(coalesce(p_gift ->> 'name', ''));
    v_gift_email := lower(trim(coalesce(p_gift ->> 'email', '')));
    if char_length(v_gift_name) not between 2 and 80 then raise exception 'invalid_name'; end if;
    if not private.valid_email(v_gift_email) then raise exception 'invalid_email'; end if;
    if v_gift_email = v_email then raise exception 'cannot_send_to_self'; end if;
  end if;

  v_base := v_subtotal - v_discount + v_addons_total;
  v_fee := private.ticket_fee(v_base, v_paid, v_event.owner_id, v_event.currency);
  v_amount := v_base + case when v_event.fee_mode = 'pass' then v_fee else 0 end;
  if v_link.id is not null then
    v_commission := round((v_subtotal - v_discount) * v_link.commission_pct / 100.0)::int;
  end if;

  if v_amount > 0 and not private.payments_available() then raise exception 'payment_required'; end if;

  insert into public.orders (
    user_id, event_id, holder_name, email, total, status, promo_id, discount, subtotal, addons_total, fee, fee_mode,
    organiser_net, commission, promoter_link_id, gift_name, gift_email
  ) values (
    uid, p_event_id, v_name, v_email, v_amount, case when v_amount > 0 then 'pending_payment' else 'confirmed' end,
    v_promo.id, v_discount, v_subtotal, v_addons_total, v_fee, v_event.fee_mode,
    v_base - case when v_event.fee_mode = 'absorb' then v_fee else 0 end - v_commission,
    v_commission, v_link.id, v_gift_name, v_gift_email
  )
  returning id into v_order;

  for v_line in
    select (x ->> 'tier_id')::uuid as tier_id, (x ->> 'quantity')::int as quantity from jsonb_array_elements(v_lines) x
  loop
    update public.tiers set sold = sold + v_line.quantity where id = v_line.tier_id returning * into v_tier;
    insert into public.order_lines (order_id, tier_id, quantity, unit_price) values (v_order, v_line.tier_id, v_line.quantity, v_tier.price);
  end loop;
  update public.seats set status = 'held', order_id = v_order where id = any (coalesce(p_seats, '{}'));
  for v_line in
    select (x ->> 'addon_id')::uuid as addon_id, (x ->> 'quantity')::int as quantity from jsonb_array_elements(v_addons) x
  loop
    update public.event_addons set sold = sold + v_line.quantity where id = v_line.addon_id returning * into v_addon;
    insert into public.order_addons (order_id, addon_id, quantity, unit_price) values (v_order, v_line.addon_id, v_line.quantity, v_addon.price);
  end loop;

  if v_amount > 0 then
    insert into public.payments (reference, payer_id, purpose, order_id, label, amount, fee, expires_at)
    values (private.new_reference(), uid, 'order', v_order,
      left(v_count || case when v_count = 1 then ' ticket, ' else ' tickets, ' end || v_event.title, 160),
      v_amount, v_fee, now() + interval '20 minutes')
    returning id into v_payment;
    update public.orders set payment_id = v_payment where id = v_order;
  else
    perform private.issue_order(v_order);
  end if;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  private.payments_set_currency(), private.ledger_set_currency(), private.events_lock_currency(),
  private.flag_high_price(text), private.ticket_fee(int, int, uuid, text), private.balance(uuid, text),
  public.create_event(jsonb), public.update_event(text, jsonb),
  public.set_payout_account(text, text, text, text), public.request_payout(text)
from public, anon, authenticated;

grant execute on function
  public.create_event(jsonb), public.update_event(text, jsonb),
  public.set_payout_account(text, text, text, text), public.request_payout(text)
to authenticated;
