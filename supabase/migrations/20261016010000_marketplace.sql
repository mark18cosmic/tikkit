-- Money and growth.
--
-- Money never goes person to person. Buyers pay Tikkit (card through the
-- gateway, or a bank transfer an admin matches against the bank statement;
-- slips are never accepted). Sellers are credited in a ledger and can withdraw
-- once the event is over, which is what lets Tikkit refund buyers when an
-- event is cancelled or turns out to be fake (the Tikkit Guarantee).
--
--   payments      one row per checkout: ticket orders, space rentals, resale,
--                 promoted listings and Organiser Pro all go through it.
--                 Inventory is held while a payment is pending and released
--                 when it expires.
--   ledger        signed amounts per person; available_at is when the money
--                 can be withdrawn. Reversals copy the original's date.
--   payouts       withdrawals to the person's bank account, paid by an admin.
--
-- Growth features that make money:
--   * booking fee on tickets (organiser chooses who pays it), lower on Pro
--   * commission on space rentals
--   * add-ons such as speedboat transfers, sold with tickets
--   * promoter links with a commission per sale
--   * capped resale with a seller fee, which also kills fake-ticket scams
--   * promoted listings, clearly labelled
--   * Organiser Pro subscription
-- Plus a server-side waitlist, editorial collections and rotating ticket QR codes.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

alter table private.settings
  -- 'none' until a gateway is set up; 'mock' is a local stand-in that follows
  -- the BML Connect flow; 'bml' is Bank of Maldives Connect via the payments
  -- Edge Function.
  add column card_provider text not null default 'none' check (card_provider in ('none', 'mock', 'bml')),
  -- Tikkit's own account for bank transfers. Transfers are offered only when set.
  add column bank_name text,
  add column bank_account_name text,
  add column bank_account_number text,
  add column ticket_fee_bps int not null default 500 check (ticket_fee_bps between 0 and 3000),
  add column ticket_fee_fixed int not null default 500 check (ticket_fee_fixed between 0 and 100000),
  add column pro_ticket_fee_bps int not null default 350 check (pro_ticket_fee_bps between 0 and 3000),
  -- The fee never takes more than this share of what's being bought.
  add column fee_cap_bps int not null default 2000 check (fee_cap_bps between 0 and 10000),
  add column rental_fee_bps int not null default 1000 check (rental_fee_bps between 0 and 5000),
  add column resale_fee_bps int not null default 500 check (resale_fee_bps between 0 and 5000),
  add column resale_cap_bps int not null default 11000 check (resale_cap_bps between 10000 and 20000),
  add column promoted_day_price int not null default 15000,
  add column pro_month_price int not null default 49900,
  add column pro_year_price int not null default 499000,
  add column hold_days int not null default 3 check (hold_days between 0 and 30),
  add column trusted_hold_days int not null default 1 check (trusted_hold_days between 0 and 30),
  add column min_payout int not null default 10000;

alter table private.settings drop column allow_unpaid_orders;

create function private.settings() returns private.settings
language sql stable security definer set search_path = '' as $$
  select * from private.settings limit 1
$$;

create function private.payments_available() returns boolean
language sql stable security definer set search_path = '' as $$
  select s.card_provider <> 'none' or s.bank_account_number is not null from private.settings s
$$;

-- What the app shows at checkout. Bank details are only for transfers to Tikkit.
create function public.payment_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'card', s.card_provider <> 'none',
    'provider', s.card_provider,
    'transfer', s.bank_account_number is not null,
    'bank', case when s.bank_account_number is not null then jsonb_build_object(
      'name', s.bank_name, 'accountName', s.bank_account_name, 'accountNumber', s.bank_account_number) end,
    'ticketFeeBps', s.ticket_fee_bps,
    'ticketFeeFixed', s.ticket_fee_fixed,
    'proTicketFeeBps', s.pro_ticket_fee_bps,
    'feeCapBps', s.fee_cap_bps,
    'rentalFeeBps', s.rental_fee_bps,
    'resaleFeeBps', s.resale_fee_bps,
    'resaleCapBps', s.resale_cap_bps,
    'promotedDayPrice', s.promoted_day_price,
    'proMonthPrice', s.pro_month_price,
    'proYearPrice', s.pro_year_price,
    'holdDays', s.hold_days
  )
  from private.settings s
$$;

create function private.is_pro(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select pro_until > now() from public.profiles where id = p_uid), false)
$$;

-- Booking fee for what's in a basket: a percentage plus a fixed amount per
-- paid ticket, never more than the cap.
create function private.ticket_fee(p_base int, p_paid_tickets int, p_owner uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case when p_base <= 0 then 0 else least(
    round(p_base * (case when private.is_pro(p_owner) then s.pro_ticket_fee_bps else s.ticket_fee_bps end) / 10000.0)::int
      + s.ticket_fee_fixed * p_paid_tickets,
    round(p_base * s.fee_cap_bps / 10000.0)::int
  ) end
  from private.settings s
$$;

-- How long a seller waits after the event before money can be withdrawn.
create function private.hold_for(p_uid uuid) returns interval
language sql stable security definer set search_path = '' as $$
  select make_interval(days => case when private.is_trusted(p_uid) then s.trusted_hold_days else s.hold_days end)
  from private.settings s
$$;

-- ES-7F3K92: short enough to type into a bank transfer's remarks.
create function private.new_reference() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(6);
  out text := 'ES-';
begin
  for i in 0..5 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Who pays the booking fee: the buyer on top ('pass') or the organiser out of the price ('absorb').
alter table public.events add column fee_mode text not null default 'pass' check (fee_mode in ('pass', 'absorb'));

-- Extras sold with tickets: speedboat transfers, parking, merch.
create table public.event_addons (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id) on delete cascade,
  kind text not null default 'transfer' check (kind in ('transfer', 'extra')),
  position smallint not null default 0,
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 200),
  price integer not null check (price between 0 and 10000000),
  capacity integer not null check (capacity between 0 and 100000),
  sold integer not null default 0,
  -- For transfers: when the boat leaves.
  departs_at timestamptz,
  check (sold between 0 and capacity)
);
create index event_addons_event_idx on public.event_addons (event_id);

-- Links promoters share; sales through them earn a commission.
create table public.promoter_links (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9-]{3,30}$'),
  name text not null check (char_length(name) between 2 and 80),
  -- The promoter's Tikkit email: commission goes to their wallet. Without
  -- an account the organiser keeps it and pays them directly.
  email text check (email = lower(email) and char_length(email) <= 254),
  commission_pct smallint not null default 10 check (commission_pct between 0 and 50),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (event_id, code)
);

alter table public.orders drop constraint orders_status_check;
alter table public.orders
  add constraint orders_status_check check (status in ('confirmed', 'pending_payment', 'cancelled', 'expired', 'refunded')),
  add column subtotal integer not null default 0,
  add column addons_total integer not null default 0,
  add column fee integer not null default 0,
  add column fee_mode text not null default 'pass',
  add column organiser_net integer not null default 0,
  add column commission integer not null default 0,
  add column promoter_link_id uuid references public.promoter_links (id) on delete set null,
  add column payment_id uuid,
  add column gift_name text check (char_length(gift_name) between 2 and 80),
  add column gift_email text;
update public.orders set subtotal = total + discount, organiser_net = total;
create index orders_event_idx on public.orders (event_id);

-- What an order holds, so tickets can be issued once it's paid.
create table public.order_lines (
  order_id uuid not null references public.orders (id) on delete cascade,
  tier_id uuid not null references public.tiers (id) on delete restrict,
  quantity integer not null check (quantity between 1 and 8),
  unit_price integer not null,
  primary key (order_id, tier_id)
);

create table public.order_addons (
  order_id uuid not null references public.orders (id) on delete cascade,
  addon_id uuid not null references public.event_addons (id) on delete restrict,
  quantity integer not null check (quantity between 1 and 8),
  unit_price integer not null,
  primary key (order_id, addon_id)
);

alter table public.venue_bookings
  add column payment_id uuid,
  add column paid_at timestamptz;

create table public.resale_listings (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  event_id text not null references public.events (id) on delete cascade,
  tier_id uuid not null references public.tiers (id) on delete cascade,
  seller_id uuid references auth.users (id) on delete set null,
  price integer not null check (price > 0),
  status text not null default 'active' check (status in ('active', 'reserved', 'sold', 'cancelled')),
  buyer_id uuid references auth.users (id) on delete set null,
  buyer_name text,
  payment_id uuid,
  created_at timestamptz not null default now(),
  sold_at timestamptz
);
create unique index resale_one_live_per_ticket on public.resale_listings (ticket_id) where status in ('active', 'reserved');
create index resale_event_idx on public.resale_listings (event_id) where status = 'active';
alter table public.tickets add column listed_for_resale boolean not null default false;

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete set null,
  days smallint not null check (days between 1 and 14),
  amount integer not null,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'active', 'cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  payment_id uuid,
  created_at timestamptz not null default now()
);
create index promotions_live_idx on public.promotions (ends_at) where status = 'active';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  payer_id uuid references auth.users (id) on delete set null,
  purpose text not null check (purpose in ('order', 'booking', 'resale', 'promotion', 'subscription')),
  order_id uuid references public.orders (id) on delete set null,
  booking_id uuid references public.venue_bookings (id) on delete set null,
  resale_id uuid references public.resale_listings (id) on delete set null,
  promotion_id uuid references public.promotions (id) on delete set null,
  -- What's being paid for, for lists. Months for subscriptions.
  label text not null check (char_length(label) between 1 and 160),
  meta jsonb not null default '{}',
  amount integer not null check (amount > 0),
  -- Tikkit's share of this payment.
  fee integer not null default 0 check (fee >= 0),
  currency text not null default 'MVR',
  method text check (method in ('card', 'transfer')),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'expired', 'cancelled', 'refund_due', 'refunded')),
  provider text,
  provider_ref text,
  -- The bank statement line an admin matched a transfer to.
  bank_ref text check (char_length(bank_ref) <= 120),
  note text not null default '' check (char_length(note) <= 500),
  expires_at timestamptz not null,
  paid_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);
create index payments_payer_idx on public.payments (payer_id, created_at desc);
create index payments_pending_idx on public.payments (expires_at) where status = 'pending';
create index payments_queue_idx on public.payments (created_at) where status = 'refund_due' or (status = 'pending' and method = 'transfer');
create unique index payments_provider_ref_idx on public.payments (provider, provider_ref) where provider_ref is not null;
-- One bank statement line can only ever confirm one payment.
create unique index payments_bank_ref_idx on public.payments (lower(bank_ref)) where bank_ref is not null;

alter table public.orders add constraint orders_payment_fk foreign key (payment_id) references public.payments (id) on delete set null;
alter table public.venue_bookings add constraint bookings_payment_fk foreign key (payment_id) references public.payments (id) on delete set null;
alter table public.resale_listings add constraint resale_payment_fk foreign key (payment_id) references public.payments (id) on delete set null;
alter table public.promotions add constraint promotions_payment_fk foreign key (payment_id) references public.payments (id) on delete set null;

create table public.ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  kind text not null check (kind in ('sale', 'commission', 'resale', 'rental', 'payout', 'reversal', 'adjustment')),
  memo text not null default '' check (char_length(memo) <= 200),
  payment_id uuid references public.payments (id) on delete set null,
  event_id text references public.events (id) on delete set null,
  payout_id uuid,
  available_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index ledger_user_idx on public.ledger (user_id, created_at desc);
create index ledger_payment_idx on public.ledger (payment_id);

create table public.payout_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  bank text not null check (bank in ('BML', 'MIB', 'SBI', 'CBM', 'Other')),
  account_name text not null check (char_length(account_name) between 2 and 120),
  account_number text not null check (account_number ~ '^[0-9]{7,20}$'),
  -- Payouts wait 48 hours after a change, so a stolen login can't redirect money at once.
  changed_at timestamptz not null default now()
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null check (amount > 0),
  status text not null default 'requested' check (status in ('requested', 'paid', 'rejected')),
  account jsonb not null,
  bank_ref text check (char_length(bank_ref) <= 120),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index payouts_queue_idx on public.payouts (created_at) where status = 'requested';
alter table public.ledger add constraint ledger_payout_fk foreign key (payout_id) references public.payouts (id) on delete set null;

create table public.waitlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null references public.events (id) on delete cascade,
  tier_id uuid not null references public.tiers (id) on delete cascade,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (user_id, tier_id)
);
create index waitlist_tier_idx on public.waitlist (tier_id, created_at);

-- Curated rows on Explore, run by admins.
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  title text not null check (char_length(title) between 2 and 60),
  subtitle text not null default '' check (char_length(subtitle) <= 140),
  position smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.collection_events (
  collection_id uuid not null references public.collections (id) on delete cascade,
  event_id text not null references public.events (id) on delete cascade,
  position smallint not null default 0,
  primary key (collection_id, event_id)
);

-- Per-ticket secret for rotating QR codes. Only the holder gets it (by RPC);
-- door staff read tickets but never secrets.
create table private.ticket_secrets (
  ticket_id uuid primary key references public.tickets (id) on delete cascade,
  secret text not null default encode(extensions.gen_random_bytes(16), 'hex')
);
alter table private.ticket_secrets enable row level security;
create function private.tickets_add_secret() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.ticket_secrets (ticket_id) values (new.id);
  return new;
end;
$$;
create trigger tickets_add_secret after insert on public.tickets
for each row execute function private.tickets_add_secret();
insert into private.ticket_secrets (ticket_id) select id from public.tickets;

create table private.broadcasts (
  organizer_id uuid not null,
  at timestamptz not null default now()
);
alter table private.broadcasts enable row level security;

-- ---------------------------------------------------------------------------
-- Read access
-- ---------------------------------------------------------------------------

alter table public.event_addons enable row level security;
alter table public.promoter_links enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_addons enable row level security;
alter table public.resale_listings enable row level security;
alter table public.promotions enable row level security;
alter table public.payments enable row level security;
alter table public.ledger enable row level security;
alter table public.payout_accounts enable row level security;
alter table public.payouts enable row level security;
alter table public.waitlist enable row level security;
alter table public.collections enable row level security;
alter table public.collection_events enable row level security;

create policy "Add-ons of visible events" on public.event_addons
  for select to anon, authenticated using (exists (select 1 from public.events e where e.id = event_id));

create policy "Organisers and admins read promoter links" on public.promoter_links
  for select to authenticated using (private.owns_event(event_id) or private.is_admin());

create policy "Buyers read their order lines" on public.order_lines
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));
create policy "Buyers read their order add-ons" on public.order_addons
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));

create policy "Sellers, buyers and admins read resale listings" on public.resale_listings
  for select to authenticated
  using (seller_id = (select auth.uid()) or buyer_id = (select auth.uid()) or private.is_admin());

create policy "Owners and admins read promotions" on public.promotions
  for select to authenticated using (owner_id = (select auth.uid()) or private.is_admin());

create policy "Payers and admins read payments" on public.payments
  for select to authenticated using (payer_id = (select auth.uid()) or private.is_admin());

create policy "Own or admin ledger" on public.ledger
  for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());

create policy "Own or admin payout account" on public.payout_accounts
  for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());

create policy "Own or admin payouts" on public.payouts
  for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());

create policy "Own waitlist" on public.waitlist
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Active collections are public" on public.collections
  for select to anon, authenticated using (active);
create policy "Admins read all collections" on public.collections
  for select to authenticated using (private.is_admin());
create policy "Collection events are public" on public.collection_events
  for select to anon, authenticated using (exists (select 1 from public.collections c where c.id = collection_id));

create policy "Admins read orders" on public.orders
  for select to authenticated using (private.is_admin());

revoke all on public.event_addons, public.promoter_links, public.order_lines, public.order_addons,
  public.resale_listings, public.promotions, public.payments, public.ledger, public.payout_accounts,
  public.payouts, public.waitlist, public.collections, public.collection_events from anon, authenticated;
grant select on public.event_addons, public.collections, public.collection_events to anon, authenticated;
grant select on public.promoter_links, public.order_lines, public.order_addons, public.resale_listings,
  public.promotions, public.payments, public.ledger, public.payout_accounts, public.payouts, public.waitlist
to authenticated;

-- ---------------------------------------------------------------------------
-- Payment lifecycle (internal)
-- ---------------------------------------------------------------------------

create function private.notify_waitlist(p_tier_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events;
  w record;
begin
  select e.* into v_event from public.events e join public.tiers t on t.event_id = e.id where t.id = p_tier_id;
  if not found or v_event.status = 'cancelled' or v_event.ends_at <= now() then return; end if;
  for w in
    select user_id from public.waitlist
    where tier_id = p_tier_id and (notified_at is null or notified_at < now() - interval '6 hours')
    order by created_at limit 200
  loop
    perform private.notify(w.user_id, 'waitlist', 'Tickets are back', v_event.title || ' has tickets again. Be quick.', '/event/' || v_event.id);
  end loop;
  update public.waitlist set notified_at = now()
  where tier_id = p_tier_id and (notified_at is null or notified_at < now() - interval '6 hours');
end;
$$;

-- Gives back whatever a pending payment was holding.
create function private.release_payment(p_payment_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  l record;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found or p.status <> 'pending' then return; end if;
  update public.payments set status = p_status where id = p.id;

  if p.purpose = 'order' then
    update public.orders set status = case when p_status = 'expired' then 'expired' else 'cancelled' end where id = p.order_id;
    for l in select tier_id, quantity from public.order_lines where order_id = p.order_id order by tier_id loop
      update public.tiers set sold = greatest(sold - l.quantity, 0) where id = l.tier_id;
      perform private.notify_waitlist(l.tier_id);
    end loop;
    for l in select addon_id, quantity from public.order_addons where order_id = p.order_id order by addon_id loop
      update public.event_addons set sold = greatest(sold - l.quantity, 0) where id = l.addon_id;
    end loop;
    update public.promo_codes set used = greatest(used - 1, 0)
    where id = (select promo_id from public.orders where id = p.order_id);
  elsif p.purpose = 'booking' then
    update public.venue_bookings
    set status = 'cancelled', cancelled_by = 'requester', decided_at = now(),
        reply = case when p_status = 'expired' then 'Not paid in time, so the slot was released.' else reply end
    where id = p.booking_id and status = 'approved' and paid_at is null;
  elsif p.purpose = 'resale' then
    update public.resale_listings set status = 'active', buyer_id = null, buyer_name = null, payment_id = null
    where id = p.resale_id and status = 'reserved';
  elsif p.purpose = 'promotion' then
    update public.promotions set status = 'cancelled' where id = p.promotion_id and status = 'pending_payment';
  end if;
end;
$$;

create function private.expire_payments() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  n int := 0;
begin
  for v_id in
    select id from public.payments where status = 'pending' and expires_at < now()
    order by expires_at limit 200 for update skip locked
  loop
    perform private.release_payment(v_id, 'expired');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Turns a paid (or free) order into tickets and credits the organiser.
create function private.issue_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  e public.events;
  l record;
  v_recipient uuid;
  v_claim text;
  v_holder text;
  v_link public.promoter_links;
  v_promoter uuid;
  v_available timestamptz;
begin
  select * into o from public.orders where id = p_order_id for update;
  select * into e from public.events where id = o.event_id;
  update public.orders set status = 'confirmed' where id = o.id;

  -- Gifts go straight to the friend (or wait for them to sign up).
  if o.gift_email is not null then
    select id into v_recipient from auth.users where lower(email) = o.gift_email and email_confirmed_at is not null;
    v_claim := case when v_recipient is null then o.gift_email end;
    v_holder := o.gift_name;
  else
    v_recipient := o.user_id;
    v_holder := o.holder_name;
  end if;

  for l in select tier_id, quantity from public.order_lines where order_id = o.id loop
    for i in 1..l.quantity loop
      insert into public.tickets (code, order_id, event_id, tier_id, owner_id, claim_email, holder_name)
      values (private.new_ticket_code(), o.id, o.event_id, l.tier_id, v_recipient, v_claim, v_holder);
    end loop;
  end loop;

  delete from public.waitlist where user_id = o.user_id and event_id = o.event_id;

  if o.organiser_net + o.commission > 0 and e.owner_id is not null then
    v_available := e.ends_at + private.hold_for(e.owner_id);
    if o.commission > 0 then
      select * into v_link from public.promoter_links where id = o.promoter_link_id;
      if v_link.email is not null then
        select id into v_promoter from auth.users where lower(email) = v_link.email and email_confirmed_at is not null;
      end if;
    end if;
    insert into public.ledger (user_id, amount, kind, memo, payment_id, event_id, available_at)
    values (e.owner_id, o.organiser_net + case when v_promoter is null then o.commission else 0 end, 'sale',
      left('Tickets: ' || e.title, 200), o.payment_id, e.id, v_available);
    if v_promoter is not null then
      insert into public.ledger (user_id, amount, kind, memo, payment_id, event_id, available_at)
      values (v_promoter, o.commission, 'commission', left('Promoter commission: ' || e.title, 200), o.payment_id, e.id, v_available);
    end if;
  end if;

  if v_recipient is not null and o.gift_email is not null then
    perform private.notify(v_recipient, 'gift', 'You’ve been sent tickets',
      o.holder_name || ' sent you tickets to ' || e.title || '.', '/tickets');
  end if;
end;
$$;

-- Records a payment as paid and delivers what it was for. Safe to call twice.
create function private.settle_payment(p_payment_id uuid, p_provider text, p_provider_ref text, p_by uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  b public.venue_bookings;
  r public.resale_listings;
  t public.tickets;
  e public.events;
  v_buyer_email text;
  v_new uuid;
  v_start timestamptz;
  v_months int;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if p.status in ('paid', 'refund_due', 'refunded') then return p.status; end if;

  -- Money that arrives after the hold lapsed (or was cancelled) can't be
  -- matched to inventory any more; it goes straight back.
  if p.status in ('expired', 'cancelled') then
    update public.payments set status = 'refund_due', paid_at = now(), provider = coalesce(p_provider, provider),
      provider_ref = coalesce(p_provider_ref, provider_ref), confirmed_by = p_by,
      note = 'Paid after the hold expired. Refund it.'
    where id = p.id;
    perform private.notify(p.payer_id, 'payment', 'Payment arrived late',
      'Your payment ' || p.reference || ' came in after the hold ran out, so it will be refunded in full.', '/wallet');
    return 'refund_due';
  end if;

  update public.payments set status = 'paid', paid_at = now(), provider = coalesce(p_provider, provider),
    provider_ref = coalesce(p_provider_ref, provider_ref), confirmed_by = p_by
  where id = p.id;

  if p.purpose = 'order' then
    perform private.issue_order(p.order_id);
    perform private.notify(p.payer_id, 'payment', 'Payment received', p.label || '. Your tickets are ready.', '/order/' || p.order_id);

  elsif p.purpose = 'booking' then
    select * into b from public.venue_bookings where id = p.booking_id for update;
    update public.venue_bookings set paid_at = now() where id = b.id;
    insert into public.ledger (user_id, amount, kind, memo, payment_id, available_at)
    select v.owner_id, p.amount - p.fee, 'rental', left('Rental: ' || v.name, 200), p.id, b.ends_at + interval '1 day'
    from public.venues v where v.id = b.venue_id;
    perform private.notify(b.requester_id, 'payment', 'Booking paid', p.label || ' is confirmed.', '/bookings/' || b.id);
    perform private.notify((select owner_id from public.venues where id = b.venue_id), 'booking', 'Booking paid',
      b.requester_name || ' paid for ' || p.label || '.', '/bookings/' || b.id);

  elsif p.purpose = 'resale' then
    select * into r from public.resale_listings where id = p.resale_id for update;
    select * into t from public.tickets where id = r.ticket_id for update;
    select * into e from public.events where id = r.event_id;
    select lower(email) into v_buyer_email from auth.users where id = r.buyer_id;
    update public.tickets
    set listed_for_resale = false, transferred_at = now(), transferred_to_name = r.buyer_name, transferred_to_email = v_buyer_email
    where id = t.id;
    -- Fresh code for the buyer: the seller's QR stops working.
    insert into public.tickets (code, order_id, event_id, tier_id, owner_id, holder_name, transferred_from)
    values (private.new_ticket_code(), t.order_id, t.event_id, t.tier_id, r.buyer_id, r.buyer_name, t.id)
    returning id into v_new;
    update public.resale_listings set status = 'sold', sold_at = now() where id = r.id;
    if r.seller_id is not null then
      insert into public.ledger (user_id, amount, kind, memo, payment_id, event_id, available_at)
      values (r.seller_id, p.amount - p.fee, 'resale', left('Resale: ' || e.title, 200), p.id, e.id,
        e.ends_at + private.hold_for(e.owner_id));
      perform private.notify(r.seller_id, 'resale', 'Your ticket sold', e.title || '. The money is in your wallet.', '/wallet');
    end if;
    perform private.notify(r.buyer_id, 'payment', 'Ticket bought', 'Your resale ticket for ' || e.title || ' is ready.', '/tickets');

  elsif p.purpose = 'promotion' then
    select greatest(now(), coalesce(max(ends_at), now())) into v_start
    from public.promotions where event_id = (select event_id from public.promotions where id = p.promotion_id) and status = 'active';
    update public.promotions set status = 'active', starts_at = v_start, ends_at = v_start + make_interval(days => days)
    where id = p.promotion_id;
    perform private.notify(p.payer_id, 'payment', 'Promotion is live', p.label, null);

  elsif p.purpose = 'subscription' then
    v_months := coalesce((p.meta ->> 'months')::int, 1);
    update public.profiles set pro_until = greatest(now(), coalesce(pro_until, now())) + make_interval(months => v_months)
    where id = p.payer_id;
    perform private.notify(p.payer_id, 'payment', 'Welcome to Organiser Pro', 'Lower fees and Pro tools are on.', '/pro');
  end if;

  return 'paid';
end;
$$;

-- Undoes what a settled payment credited, and queues the refund.
create function private.refund_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then return; end if;
  if p.status = 'pending' then
    perform private.release_payment(p.id, 'cancelled');
    return;
  end if;
  if p.status <> 'paid' then return; end if;
  update public.payments set status = 'refund_due', note = left(coalesce(p_reason, ''), 500) where id = p.id;
  insert into public.ledger (user_id, amount, kind, memo, payment_id, event_id, available_at)
  select user_id, -amount, 'reversal', left('Refunded: ' || memo, 200), payment_id, event_id, available_at
  from public.ledger where payment_id = p.id and kind in ('sale', 'commission', 'resale', 'rental');
  if p.purpose = 'order' then
    update public.orders set status = 'refunded' where id = p.order_id;
  end if;
  perform private.notify(p.payer_id, 'refund', 'Refund on the way',
    p.label || ': ' || coalesce(nullif(p_reason, ''), 'cancelled') || '. Covered by the Tikkit Guarantee.', null);
end;
$$;

-- Cancelling an event (by the organiser or an admin) refunds everyone who paid.
create function private.events_refund_on_cancel() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    for v_id in
      select p.id from public.payments p join public.orders o on o.id = p.order_id
      where o.event_id = new.id and p.status in ('pending', 'paid')
      union
      select p.id from public.payments p join public.resale_listings r on r.id = p.resale_id
      where r.event_id = new.id and p.status in ('pending', 'paid')
      union
      select p.id from public.payments p join public.promotions pr on pr.id = p.promotion_id
      where pr.event_id = new.id and p.status = 'pending'
    loop
      perform private.refund_payment(v_id, 'Event cancelled: ' || coalesce(new.notice, ''));
    end loop;
    update public.resale_listings set status = 'cancelled' where event_id = new.id and status = 'active';
    update public.tickets set listed_for_resale = false where event_id = new.id and listed_for_resale;
    update public.promotions set status = 'cancelled', ends_at = now() where event_id = new.id and status = 'active';
  end if;
  return null;
end;
$$;
create trigger events_refund_on_cancel after update of status on public.events
for each row execute function private.events_refund_on_cancel();

-- ---------------------------------------------------------------------------
-- Space rentals are paid in the app
-- ---------------------------------------------------------------------------

-- Approving a paid request opens a payment for the renter. The slot is held
-- for 48 hours (or until the booking starts) while they pay.
create function private.bookings_open_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_payment uuid;
  v_venue public.venues;
begin
  if new.status = 'approved' and old.status = 'pending' and not new.own_use and new.total > 0 then
    select * into v_venue from public.venues where id = new.venue_id;
    insert into public.payments (reference, payer_id, purpose, booking_id, label, amount, fee, expires_at)
    values (private.new_reference(), new.requester_id, 'booking', new.id,
      left(v_venue.name || ', ' || to_char(new.starts_at at time zone 'Indian/Maldives', 'Dy DD Mon HH24:MI'), 160),
      new.total, round(new.total * (private.settings()).rental_fee_bps / 10000.0)::int,
      least(now() + interval '48 hours', new.starts_at))
    returning id into v_payment;
    update public.venue_bookings set payment_id = v_payment where id = new.id;
    perform private.notify(new.requester_id, 'booking', 'Booking approved: pay to confirm',
      v_venue.name || ' said yes. Pay within 48 hours to keep the slot.', '/bookings/' || new.id);
  end if;
  return null;
end;
$$;
create trigger bookings_open_payment after update of status on public.venue_bookings
for each row execute function private.bookings_open_payment();

create function private.bookings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- An unpaid booking can't host an event.
  if new.event_id is not null and old.event_id is null and not new.own_use and new.total > 0 and new.paid_at is null then
    raise exception 'booking_unpaid';
  end if;
  if new.status = 'cancelled' and old.status = 'approved' and old.paid_at is not null then
    -- Renters can cancel a paid booking up to 3 days before; owners any time.
    if new.cancelled_by = 'requester' and old.starts_at < now() + interval '3 days' then
      raise exception 'too_late_to_cancel';
    end if;
  end if;
  return new;
end;
$$;
create trigger bookings_guard before update on public.venue_bookings
for each row execute function private.bookings_guard();

create function private.bookings_refund_on_cancel() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status = 'approved' and new.payment_id is not null then
    perform private.refund_payment(new.payment_id, 'Booking cancelled');
  end if;
  return null;
end;
$$;
create trigger bookings_refund_on_cancel after update of status on public.venue_bookings
for each row execute function private.bookings_refund_on_cancel();

-- ---------------------------------------------------------------------------
-- Buying tickets
-- ---------------------------------------------------------------------------

-- p_addons: [{ "addonId": uuid, "quantity": int }]
-- p_ref:    a promoter link code
-- p_gift:   { "name": text, "email": text } to send the tickets to a friend
-- Free orders are issued at once. Paid orders hold the tickets for 20 minutes
-- while the buyer pays (see payments). Returns the order id.
drop function public.purchase(text, jsonb, text, text);
create function public.purchase(
  p_event_id text, p_lines jsonb, p_holder_name text, p_promo text default null,
  p_addons jsonb default '[]', p_ref text default null, p_gift jsonb default null
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
  v_count int := 0;
  v_paid int := 0;
  v_subtotal int := 0;
  v_addons_total int := 0;
  v_discount int := 0;
  v_promo public.promo_codes;
  v_link public.promoter_links;
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

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 5 then
    raise exception 'invalid_lines';
  end if;

  -- Merge duplicate tiers, sorted by id so locks are always taken in the same order.
  select coalesce(jsonb_agg(jsonb_build_object('tier_id', tier_id, 'quantity', quantity) order by tier_id), '[]')
  into v_lines
  from (
    select (l ->> 'tierId')::uuid as tier_id, sum((l ->> 'quantity')::int)::int as quantity
    from jsonb_array_elements(p_lines) l
    group by 1
  ) merged;

  if exists (
    select 1 from jsonb_array_elements(v_lines) x
    where (x ->> 'quantity') is null or (x ->> 'quantity')::int < 1 or (x ->> 'tier_id') is null
  ) then
    raise exception 'invalid_lines';
  end if;
  select coalesce(sum((x ->> 'quantity')::int), 0) into v_count from jsonb_array_elements(v_lines) x;
  if v_count not between 1 and 8 then raise exception 'invalid_lines'; end if;

  -- Anti-hoarding: at most 20 tickets per person per event, counting ones
  -- still waiting for payment, and at most 3 unpaid checkouts at a time.
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
    if v_tier.capacity - v_tier.sold < v_line.quantity then raise exception 'sold_out'; end if;
    v_subtotal := v_subtotal + v_tier.price * v_line.quantity;
    if v_tier.price > 0 then v_paid := v_paid + v_line.quantity; end if;
  end loop;

  -- Add-ons, merged and locked the same way.
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
  v_fee := private.ticket_fee(v_base, v_paid, v_event.owner_id);
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
-- Paying
-- ---------------------------------------------------------------------------

-- Card: holds for 20 more minutes (at most an hour in all) while the buyer is
-- on the gateway page. Transfer: holds for up to 24 hours, but must clear
-- before the event, so it isn't offered when the event is too close.
create function public.choose_payment_method(p_payment_id uuid, p_method text) returns jsonb
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
    if s.bank_account_number is null then raise exception 'method_unavailable'; end if;
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

-- Walks away from a checkout: releases the hold straight away.
create function public.cancel_payment(p_payment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.payments where id = p_payment_id and payer_id = auth.uid() and status = 'pending') then
    raise exception 'payment_not_pending';
  end if;
  perform private.release_payment(p_payment_id, 'cancelled');
end;
$$;

-- Fresh status, expiring anything overdue first.
create function public.payment_status(p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
begin
  perform private.expire_payments();
  select * into p from public.payments where id = p_payment_id and (payer_id = auth.uid() or private.is_admin());
  if not found then raise exception 'payment_not_found'; end if;
  return jsonb_build_object('status', p.status, 'method', p.method, 'expiresAt', p.expires_at, 'paidAt', p.paid_at);
end;
$$;

-- Local stand-in for the card gateway. Only works when card_provider is
-- 'mock', which hosted projects never use.
create function public.mock_gateway_complete(p_payment_id uuid, p_success boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
begin
  if (private.settings()).card_provider <> 'mock' then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into p from public.payments where id = p_payment_id and payer_id = auth.uid();
  if not found then raise exception 'payment_not_found'; end if;
  if p.method is distinct from 'card' then raise exception 'payment_not_pending'; end if;
  if not p_success then return 'declined'; end if;
  return private.settle_payment(p.id, 'mock', 'MOCK-' || p.reference, null);
end;
$$;

-- Called by the payments Edge Function (service role) after it has fetched
-- the transaction from the gateway itself and checked it's confirmed.
create function public.gateway_settle(p_payment_id uuid, p_provider text, p_provider_ref text, p_amount int) returns text
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
begin
  select * into p from public.payments where id = p_payment_id;
  if not found then raise exception 'payment_not_found'; end if;
  if p_amount is distinct from p.amount then raise exception 'amount_mismatch'; end if;
  return private.settle_payment(p.id, p_provider, p_provider_ref, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Organiser tools: fee mode, add-ons, promoter links, sales
-- ---------------------------------------------------------------------------

create function public.set_fee_mode(p_event_id text, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.owns_event(p_event_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_mode not in ('pass', 'absorb') then raise exception 'invalid_fee_mode'; end if;
  update public.events set fee_mode = p_mode where id = p_event_id;
end;
$$;

-- Replaces the event's add-ons. Ones that have sold keep their price and
-- can't drop below what's sold or be removed.
-- p: [{ id?, kind, name, description, price, capacity, departsAt? }]
create function public.save_addons(p_event_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_existing public.event_addons;
  v_keep uuid[] := '{}';
  v_pos int := 0;
  v_id uuid;
begin
  if not private.owns_event(p_event_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 8 then raise exception 'invalid_addons'; end if;
  for v_item in select * from jsonb_array_elements(p) loop
    if coalesce(v_item ->> 'kind', 'transfer') not in ('transfer', 'extra') then raise exception 'invalid_addons'; end if;
    if nullif(v_item ->> 'id', '') is not null then
      select * into v_existing from public.event_addons where id = (v_item ->> 'id')::uuid and event_id = p_event_id for update;
      if not found then raise exception 'invalid_addons'; end if;
      if v_existing.sold > 0 and (v_item ->> 'price')::int <> v_existing.price then raise exception 'tier_price_locked'; end if;
      if (v_item ->> 'capacity')::int < v_existing.sold then raise exception 'capacity_below_sold'; end if;
      update public.event_addons set
        kind = coalesce(v_item ->> 'kind', 'transfer'), name = trim(v_item ->> 'name'),
        description = trim(coalesce(v_item ->> 'description', '')), price = (v_item ->> 'price')::int,
        capacity = (v_item ->> 'capacity')::int, departs_at = nullif(v_item ->> 'departsAt', '')::timestamptz, position = v_pos
      where id = v_existing.id;
      v_keep := v_keep || v_existing.id;
    else
      insert into public.event_addons (event_id, kind, position, name, description, price, capacity, departs_at)
      values (p_event_id, coalesce(v_item ->> 'kind', 'transfer'), v_pos, trim(v_item ->> 'name'),
        trim(coalesce(v_item ->> 'description', '')), (v_item ->> 'price')::int, (v_item ->> 'capacity')::int,
        nullif(v_item ->> 'departsAt', '')::timestamptz)
      returning id into v_id;
      v_keep := v_keep || v_id;
    end if;
    v_pos := v_pos + 1;
  end loop;
  if exists (select 1 from public.event_addons where event_id = p_event_id and not (id = any (v_keep)) and sold > 0) then
    raise exception 'tier_has_sales';
  end if;
  delete from public.event_addons where event_id = p_event_id and not (id = any (v_keep));
end;
$$;

create function public.save_promoter_link(p_event_id text, p_name text, p_code text, p_email text, p_pct int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := lower(regexp_replace(trim(coalesce(p_code, '')), '[^A-Za-z0-9-]+', '-', 'g'));
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_id uuid;
begin
  if not private.owns_event(p_event_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'invalid_name'; end if;
  if v_code !~ '^[a-z0-9-]{3,30}$' then raise exception 'invalid_code'; end if;
  if v_email is not null and not private.valid_email(v_email) then raise exception 'invalid_email'; end if;
  if p_pct is null or p_pct not between 0 and 50 then raise exception 'invalid_percent'; end if;
  -- Two links per event on the free plan, up to 100 on Pro.
  if (select count(*) from public.promoter_links where event_id = p_event_id)
     >= (case when private.is_pro(auth.uid()) then 100 else 2 end) then
    raise exception 'pro_required';
  end if;
  begin
    insert into public.promoter_links (event_id, code, name, email, commission_pct)
    values (p_event_id, v_code, trim(p_name), v_email, p_pct)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'code_taken';
  end;
  return v_id;
end;
$$;

create function public.set_promoter_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.promoter_links set active = p_active where id = p_id and private.owns_event(event_id);
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
end;
$$;

-- Sales breakdown for the organiser: money, promoters, add-ons, and (Pro) sales by day.
create function public.event_sales(p_event_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.owns_event(p_event_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'gross', (select coalesce(sum(total), 0) from public.orders where event_id = p_event_id and status = 'confirmed'),
    'net', (select coalesce(sum(organiser_net), 0) from public.orders where event_id = p_event_id and status = 'confirmed'),
    'fees', (select coalesce(sum(fee), 0) from public.orders where event_id = p_event_id and status = 'confirmed'),
    'refunded', (select coalesce(sum(total), 0) from public.orders where event_id = p_event_id and status = 'refunded'),
    'pending', (select count(*) from public.orders where event_id = p_event_id and status = 'pending_payment'),
    'promoters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'code', l.code, 'name', l.name, 'email', l.email, 'pct', l.commission_pct, 'active', l.active,
        'orders', (select count(*) from public.orders o where o.promoter_link_id = l.id and o.status = 'confirmed'),
        'tickets', (select coalesce(sum(ol.quantity), 0) from public.order_lines ol join public.orders o on o.id = ol.order_id
                    where o.promoter_link_id = l.id and o.status = 'confirmed'),
        'commission', (select coalesce(sum(o.commission), 0) from public.orders o where o.promoter_link_id = l.id and o.status = 'confirmed'),
        'hasAccount', exists (select 1 from auth.users u where lower(u.email) = l.email and u.email_confirmed_at is not null)
      ) order by l.created_at)
      from public.promoter_links l where l.event_id = p_event_id
    ), '[]'),
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'sold', a.sold, 'capacity', a.capacity, 'price', a.price)
        order by a.position)
      from public.event_addons a where a.event_id = p_event_id
    ), '[]'),
    'byDay', case when private.is_pro(auth.uid()) then coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'tickets', n, 'net', net) order by d)
      from (
        select (o.created_at at time zone 'Indian/Maldives')::date as d,
          sum((select coalesce(sum(quantity), 0) from public.order_lines where order_id = o.id))::int as n,
          sum(o.organiser_net)::int as net
        from public.orders o where o.event_id = p_event_id and o.status = 'confirmed'
        group by 1
      ) x
    ), '[]') end
  );
end;
$$;

-- Who's on which boat: names and counts per add-on, for the organiser and door staff.
create function public.addon_manifest(p_event_id text) returns table (addon_id uuid, addon_name text, holder_name text, quantity int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_event_staff(p_event_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  return query
    select a.id, a.name, coalesce(o.gift_name, o.holder_name), oa.quantity
    from public.order_addons oa
    join public.orders o on o.id = oa.order_id
    join public.event_addons a on a.id = oa.addon_id
    where a.event_id = p_event_id and o.status = 'confirmed'
    order by a.position, 3;
end;
$$;

-- What each of the caller's events actually earns them, after fees and commission.
create or replace function public.my_event_revenue()
returns table (event_id text, revenue bigint, discounts bigint)
language sql stable security definer set search_path = '' as $$
  select o.event_id, sum(o.organiser_net)::bigint, sum(o.discount)::bigint
  from public.orders o
  join public.events e on e.id = o.event_id
  where e.owner_id = (select auth.uid()) and o.status = 'confirmed'
  group by o.event_id
$$;

-- ---------------------------------------------------------------------------
-- Resale (capped, through Tikkit only)
-- ---------------------------------------------------------------------------

create function public.list_resale(p_code text, p_price int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  t public.tickets;
  e public.events;
  v_face int;
  v_id uuid;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  select * into t from public.tickets where code = private.normalize_code(p_code) and owner_id = uid for update;
  if not found then raise exception 'ticket_not_found'; end if;
  if t.transferred_at is not null or t.refund_requested_at is not null or t.checked_in_at is not null or t.listed_for_resale then
    raise exception 'ticket_not_active';
  end if;
  select * into e from public.events where id = t.event_id;
  if e.listing <> 'approved' or e.status = 'cancelled' or e.starts_at <= now() + interval '1 hour' then raise exception 'event_closed'; end if;
  select price into v_face from public.tiers where id = t.tier_id;
  if v_face = 0 then raise exception 'not_resellable'; end if;
  if p_price is null or p_price < 100 or p_price > round(v_face * (private.settings()).resale_cap_bps / 10000.0) then
    raise exception 'resale_price_cap';
  end if;
  if (select count(*) from public.resale_listings where seller_id = uid and status = 'active') >= 10 then
    raise exception 'too_many_requests';
  end if;
  insert into public.resale_listings (ticket_id, event_id, tier_id, seller_id, price)
  values (t.id, t.event_id, t.tier_id, uid, p_price)
  returning id into v_id;
  update public.tickets set listed_for_resale = true where id = t.id;
  perform private.notify_waitlist(t.tier_id);
  return v_id;
end;
$$;

create function public.cancel_resale(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.resale_listings;
begin
  select * into r from public.resale_listings where id = p_id and seller_id = auth.uid() for update;
  if not found then raise exception 'not_found'; end if;
  if r.status <> 'active' then raise exception 'resale_not_active'; end if;
  update public.resale_listings set status = 'cancelled' where id = r.id;
  update public.tickets set listed_for_resale = false where id = r.ticket_id;
end;
$$;

-- Resale tickets on offer for an event, cheapest first. Never says who's selling.
create function public.resale_offers(p_event_id text)
returns table (id uuid, tier_id uuid, tier_name text, price int, face_price int)
language sql stable security definer set search_path = '' as $$
  select r.id, r.tier_id, t.name, r.price, t.price
  from public.resale_listings r
  join public.tiers t on t.id = r.tier_id
  join public.events e on e.id = r.event_id
  where r.event_id = p_event_id and r.status = 'active' and e.listing = 'approved'
    and e.status <> 'cancelled' and e.starts_at > now()
    and r.seller_id is distinct from (select auth.uid())
  order by r.price, r.created_at
  limit 50
$$;

create function public.buy_resale(p_id uuid, p_holder_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r public.resale_listings;
  e public.events;
  v_name text := trim(coalesce(p_holder_name, ''));
  v_payment uuid;
begin
  if uid is null or private.my_email() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'invalid_name'; end if;
  if (private.settings()).card_provider = 'none' then raise exception 'payment_required'; end if;
  perform private.expire_payments();
  if (select count(*) from public.payments where payer_id = uid and status = 'pending') >= 3 then
    raise exception 'too_many_pending';
  end if;
  select * into r from public.resale_listings where id = p_id for update;
  if not found or r.status <> 'active' then raise exception 'resale_not_active'; end if;
  if r.seller_id = uid then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into e from public.events where id = r.event_id;
  if e.status = 'cancelled' or e.starts_at <= now() then raise exception 'event_closed'; end if;

  insert into public.payments (reference, payer_id, purpose, resale_id, label, amount, fee, method, expires_at)
  values (private.new_reference(), uid, 'resale', r.id, left('Resale ticket, ' || e.title, 160), r.price,
    round(r.price * (private.settings()).resale_fee_bps / 10000.0)::int, 'card', now() + interval '20 minutes')
  returning id into v_payment;
  update public.resale_listings set status = 'reserved', buyer_id = uid, buyer_name = v_name, payment_id = v_payment where id = r.id;
  return v_payment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Promoted listings and Organiser Pro
-- ---------------------------------------------------------------------------

create function public.buy_promotion(p_event_id text, p_days int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  e public.events;
  v_amount int;
  v_promo uuid;
  v_payment uuid;
begin
  select * into e from public.events where id = p_event_id and owner_id = uid;
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
  if e.listing <> 'approved' then raise exception 'not_approved'; end if;
  if e.status = 'cancelled' or e.starts_at <= now() then raise exception 'event_closed'; end if;
  if p_days is null or p_days not between 1 and 14 then raise exception 'invalid_days'; end if;
  if not private.payments_available() then raise exception 'payment_required'; end if;
  -- Pro organisers get 25% off.
  v_amount := round((private.settings()).promoted_day_price * p_days * case when private.is_pro(uid) then 0.75 else 1 end)::int;
  insert into public.promotions (event_id, owner_id, days, amount) values (p_event_id, uid, p_days, v_amount)
  returning id into v_promo;
  insert into public.payments (reference, payer_id, purpose, promotion_id, label, amount, fee, expires_at)
  values (private.new_reference(), uid, 'promotion', v_promo,
    left('Promote ' || e.title || ' for ' || p_days || case when p_days = 1 then ' day' else ' days' end, 160),
    v_amount, v_amount, now() + interval '24 hours')
  returning id into v_payment;
  update public.promotions set payment_id = v_payment where id = v_promo;
  return v_payment;
end;
$$;

-- Event ids promoted right now. The app labels them "Promoted".
create function public.active_promotions() returns setof text
language sql stable security definer set search_path = '' as $$
  select distinct p.event_id from public.promotions p join public.events e on e.id = p.event_id
  where p.status = 'active' and now() between p.starts_at and p.ends_at
    and e.listing = 'approved' and e.status <> 'cancelled' and e.ends_at > now()
$$;

create function public.buy_pro(p_months int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  s private.settings := private.settings();
  v_amount int;
  v_payment uuid;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if p_months not in (1, 12) then raise exception 'invalid_plan'; end if;
  if not private.payments_available() then raise exception 'payment_required'; end if;
  if (select count(*) from public.payments where payer_id = uid and status = 'pending' and purpose = 'subscription') > 0 then
    raise exception 'too_many_pending';
  end if;
  v_amount := case when p_months = 12 then s.pro_year_price else s.pro_month_price end;
  insert into public.payments (reference, payer_id, purpose, label, meta, amount, fee, expires_at)
  values (private.new_reference(), uid, 'subscription',
    case when p_months = 12 then 'Organiser Pro, 1 year' else 'Organiser Pro, 1 month' end,
    jsonb_build_object('months', p_months), v_amount, v_amount, now() + interval '24 hours')
  returning id into v_payment;
  return v_payment;
end;
$$;

-- Pro: tell every follower about something new. Three a week.
create function public.broadcast(p_organizer_id uuid, p_title text, p_body text, p_event_id text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_org public.organizers;
  v_count int;
begin
  select * into v_org from public.organizers where id = p_organizer_id and owner_id = uid;
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not private.is_pro(uid) then raise exception 'pro_required'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 80 or char_length(trim(coalesce(p_body, ''))) > 300 then
    raise exception 'invalid_message';
  end if;
  if p_event_id is not null and not exists (
    select 1 from public.events where id = p_event_id and owner_id = uid and listing = 'approved'
  ) then
    raise exception 'event_not_found';
  end if;
  if (select count(*) from private.broadcasts where organizer_id = p_organizer_id and at > now() - interval '7 days') >= 3 then
    raise exception 'too_many_announcements';
  end if;
  insert into private.broadcasts (organizer_id) values (p_organizer_id);
  insert into public.notifications (user_id, kind, title, body, link)
  select f.user_id, 'broadcast', left(v_org.name || ': ' || trim(p_title), 120), trim(coalesce(p_body, '')),
    coalesce('/event/' || p_event_id, '/organizer/' || v_org.slug)
  from public.follows f where f.organizer_id = p_organizer_id
  limit 50000;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Wallet and payouts
-- ---------------------------------------------------------------------------

-- available: can be withdrawn now. pending: waiting for events to finish.
-- held: frozen by reports or an admin.
create function private.balance(p_uid uuid) returns table (available bigint, pending bigint, held bigint)
language sql stable security definer set search_path = '' as $$
  select
    coalesce(sum(l.amount) filter (where l.available_at <= now() and not coalesce(e.payout_hold, false)), 0)::bigint,
    coalesce(sum(l.amount) filter (where l.available_at > now() and not coalesce(e.payout_hold, false)), 0)::bigint,
    coalesce(sum(l.amount) filter (where coalesce(e.payout_hold, false)), 0)::bigint
  from public.ledger l left join public.events e on e.id = l.event_id
  where l.user_id = p_uid
$$;

create function public.my_wallet() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'available', b.available, 'pending', b.pending, 'held', b.held,
    'minPayout', (private.settings()).min_payout,
    'account', (select jsonb_build_object('bank', a.bank, 'accountName', a.account_name,
                  'accountNumber', '•••• ' || right(a.account_number, 4), 'changedAt', a.changed_at)
                from public.payout_accounts a where a.user_id = (select auth.uid()))
  )
  from private.balance((select auth.uid())) b
$$;

create function public.set_payout_account(p_bank text, p_name text, p_number text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_number text := regexp_replace(coalesce(p_number, ''), '\D', '', 'g');
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if coalesce(p_bank, '') not in ('BML', 'MIB', 'SBI', 'CBM', 'Other') then raise exception 'invalid_bank'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'invalid_name'; end if;
  if v_number !~ '^[0-9]{7,20}$' then raise exception 'invalid_account'; end if;
  insert into public.payout_accounts (user_id, bank, account_name, account_number)
  values (uid, p_bank, trim(p_name), v_number)
  on conflict (user_id) do update set bank = excluded.bank, account_name = excluded.account_name,
    account_number = excluded.account_number, changed_at = now();
end;
$$;

create function public.request_payout() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  a public.payout_accounts;
  v_available bigint;
  v_id uuid;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = uid and verified_at is not null and suspended_at is null) then
    raise exception 'not_verified';
  end if;
  select * into a from public.payout_accounts where user_id = uid;
  if not found then raise exception 'no_payout_account'; end if;
  if a.changed_at > now() - interval '48 hours' then raise exception 'account_cooling_off'; end if;
  if exists (select 1 from public.payouts where user_id = uid and status = 'requested') then raise exception 'payout_pending'; end if;
  -- One request at a time per person, even with two taps.
  perform pg_advisory_xact_lock(hashtext('payout:' || uid::text));
  select available into v_available from private.balance(uid);
  if v_available < (private.settings()).min_payout then raise exception 'below_min_payout'; end if;
  insert into public.payouts (user_id, amount, account)
  values (uid, v_available, jsonb_build_object('bank', a.bank, 'accountName', a.account_name, 'accountNumber', a.account_number))
  returning id into v_id;
  insert into public.ledger (user_id, amount, kind, memo, payout_id, available_at)
  values (uid, -v_available, 'payout', 'Withdrawal to ' || a.bank || ' ' || right(a.account_number, 4), v_id, now());
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Waitlist and collections
-- ---------------------------------------------------------------------------

create function public.set_waitlist(p_tier_id uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if p_on then
    if (select count(*) from public.waitlist where user_id = uid) >= 50 then raise exception 'too_many_requests'; end if;
    insert into public.waitlist (user_id, event_id, tier_id)
    select uid, t.event_id, t.id from public.tiers t join public.events e on e.id = t.event_id
    where t.id = p_tier_id and e.listing = 'approved'
    on conflict do nothing;
  else
    delete from public.waitlist where user_id = uid and tier_id = p_tier_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tickets: rotating QR codes and resale-aware door checks
-- ---------------------------------------------------------------------------

-- Secrets for the caller's own live tickets, so the app can draw a QR code
-- that changes every 30 seconds (works offline once fetched).
create function public.my_ticket_secrets() returns table (code text, secret text)
language sql stable security definer set search_path = '' as $$
  select t.code, s.secret from public.tickets t join private.ticket_secrets s on s.ticket_id = t.id
  where t.owner_id = (select auth.uid()) and t.transferred_at is null
$$;

-- The 8-character token for a 30-second window.
create function private.qr_token(p_secret text, p_window bigint) returns text
language sql immutable set search_path = '' as $$
  select left(encode(extensions.digest(p_secret || ':' || p_window::text, 'sha256'), 'hex'), 8)
$$;

-- Door check-in. Accepts a typed code (EVT-XXXX-XXXX) or a scanned QR
-- (EVT-XXXX-XXXX.window.token). A QR older than about two minutes is
-- refused, so screenshots can't be passed around. Typed codes still work
-- but are flagged so staff check the holder's name.
drop function public.check_in(text);
create function public.check_in(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_parts text[] := string_to_array(trim(coalesce(p_code, '')), '.');
  v_code text := private.normalize_code(v_parts[1]);
  v_scanned boolean := cardinality(v_parts) = 3;
  v_ticket public.tickets;
  v_event public.events;
  v_tier_name text;
  v_secret text;
  v_window bigint;
  v_now bigint := floor(extract(epoch from now()) / 30)::bigint;
  v_status text;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if v_code is null or cardinality(v_parts) not in (1, 3) then return jsonb_build_object('status', 'unknown'); end if;

  select * into v_ticket from public.tickets where code = v_code;
  if not found or not private.is_event_staff(v_ticket.event_id) then
    return jsonb_build_object('status', 'unknown');
  end if;

  if v_scanned then
    select secret into v_secret from private.ticket_secrets where ticket_id = v_ticket.id;
    v_window := case when v_parts[2] ~ '^[0-9]{1,12}$' then v_parts[2]::bigint end;
    if v_window is null or abs(v_window - v_now) > 4 or private.qr_token(v_secret, v_window) <> lower(v_parts[3]) then
      return jsonb_build_object('status', 'expired_qr', 'code', v_ticket.code, 'holderName', v_ticket.holder_name);
    end if;
  end if;

  select * into v_event from public.events where id = v_ticket.event_id;
  select name into v_tier_name from public.tiers where id = v_ticket.tier_id;

  if v_ticket.transferred_at is not null or v_ticket.refund_requested_at is not null
     or v_ticket.listed_for_resale or v_event.status = 'cancelled' then
    v_status := 'void';
  else
    update public.tickets set checked_in_at = now(), checked_in_by = uid
    where id = v_ticket.id and checked_in_at is null
    returning * into v_ticket;
    if found then
      v_status := 'admitted';
    else
      v_status := 'already';
      select * into v_ticket from public.tickets where code = v_code;
    end if;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'code', v_ticket.code,
    'holderName', v_ticket.holder_name,
    'tierName', v_tier_name,
    'eventTitle', v_event.title,
    'checkedInAt', v_ticket.checked_in_at,
    'transferredToName', v_ticket.transferred_to_name,
    'refundRequested', v_ticket.refund_requested_at is not null,
    'listedForResale', v_ticket.listed_for_resale,
    'eventCancelled', v_event.status = 'cancelled',
    'typed', not v_scanned
  );
end;
$$;

-- A ticket on resale can't also be sent, refunded or used.
create function private.tickets_guard_resale() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.listed_for_resale and new.listed_for_resale
     and (new.transferred_at is not null or new.refund_requested_at is not null) then
    raise exception 'ticket_listed';
  end if;
  return new;
end;
$$;
create trigger tickets_guard_resale before update on public.tickets
for each row execute function private.tickets_guard_resale();

-- ---------------------------------------------------------------------------
-- Admin: money
-- ---------------------------------------------------------------------------

-- Matches a transfer to a line on Tikkit's bank statement.
create function public.admin_confirm_transfer(p_payment_id uuid, p_bank_ref text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ref text := trim(coalesce(p_bank_ref, ''));
begin
  perform private.require_admin();
  if char_length(v_ref) not between 3 and 120 then raise exception 'bank_ref_required'; end if;
  if not exists (select 1 from public.payments where id = p_payment_id and method = 'transfer') then
    raise exception 'payment_not_found';
  end if;
  begin
    update public.payments set bank_ref = v_ref where id = p_payment_id;
  exception when unique_violation then
    raise exception 'bank_ref_used';
  end;
  return private.settle_payment(p_payment_id, 'transfer', v_ref, auth.uid());
end;
$$;

create function public.admin_mark_refunded(p_payment_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.payments set status = 'refunded', refunded_at = now(),
    note = left(trim(coalesce(p_note, note)), 500)
  where id = p_payment_id and status = 'refund_due';
  if not found then raise exception 'payment_not_found'; end if;
end;
$$;

create function public.admin_decide_payout(p_id uuid, p_paid boolean, p_ref text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.payouts;
begin
  perform private.require_admin();
  select * into v from public.payouts where id = p_id for update;
  if not found or v.status <> 'requested' then raise exception 'not_found'; end if;
  if char_length(trim(coalesce(p_ref, ''))) < 2 then raise exception 'bank_ref_required'; end if;
  update public.payouts set status = case when p_paid then 'paid' else 'rejected' end,
    bank_ref = case when p_paid then trim(p_ref) end, note = case when p_paid then '' else trim(p_ref) end, decided_at = now()
  where id = p_id;
  if p_paid then
    perform private.notify(v.user_id, 'payout', 'Money sent', 'Your withdrawal is on its way to your bank.', '/wallet');
  else
    insert into public.ledger (user_id, amount, kind, memo, payout_id, available_at)
    values (v.user_id, v.amount, 'reversal', 'Withdrawal returned: ' || left(trim(p_ref), 150), v.id, now());
    perform private.notify(v.user_id, 'payout', 'Withdrawal returned', trim(p_ref), '/wallet');
  end if;
end;
$$;

-- Takes a listing down for good: cancels it (which refunds everyone) and
-- upholds the reports against it.
create function public.admin_takedown_event(p_id text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
begin
  perform private.require_admin();
  if char_length(v_reason) not between 2 and 500 then raise exception 'note_required'; end if;
  update public.events set status = 'cancelled', notice = 'Removed by Tikkit: ' || v_reason, payout_hold = true
  where id = p_id and status <> 'cancelled';
  if not found then raise exception 'not_found'; end if;
  insert into public.announcements (event_id, author_id, kind, body)
  values (p_id, auth.uid(), 'cancelled', 'This event was removed by Tikkit. Everyone who paid gets a full refund.');
  update public.venue_bookings set status = 'cancelled', cancelled_by = 'owner', decided_at = now()
  where event_id = p_id and own_use;
  update public.reports set status = 'upheld', resolution_note = v_reason, resolved_by = auth.uid(), resolved_at = now()
  where target_kind = 'event' and target_id = p_id and status = 'open';
end;
$$;

-- p: { id?, slug, title, subtitle, position, active, eventIds: [] }
create function public.admin_save_collection(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_event text;
  v_pos int := 0;
begin
  perform private.require_admin();
  if v_id is null then
    insert into public.collections (slug, title, subtitle, position, active)
    values (p ->> 'slug', trim(p ->> 'title'), trim(coalesce(p ->> 'subtitle', '')),
      coalesce((p ->> 'position')::int, 0), coalesce((p ->> 'active')::boolean, true))
    returning id into v_id;
  else
    update public.collections set slug = p ->> 'slug', title = trim(p ->> 'title'),
      subtitle = trim(coalesce(p ->> 'subtitle', '')), position = coalesce((p ->> 'position')::int, position),
      active = coalesce((p ->> 'active')::boolean, active)
    where id = v_id;
  end if;
  if jsonb_typeof(p -> 'eventIds') = 'array' then
    delete from public.collection_events where collection_id = v_id;
    for v_event in select jsonb_array_elements_text(p -> 'eventIds') loop
      insert into public.collection_events (collection_id, event_id, position)
      select v_id, id, v_pos from public.events where id = v_event
      on conflict do nothing;
      v_pos := v_pos + 1;
    end loop;
  end if;
  return v_id;
end;
$$;

create function public.admin_delete_collection(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.collections where id = p_id;
end;
$$;

-- Platform takings, for the admin overview.
create function public.admin_overview() returns jsonb
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
    'revenue30d', (select coalesce(sum(fee), 0) from public.payments where status = 'paid' and paid_at > now() - interval '30 days'),
    'gmv30d', (select coalesce(sum(amount), 0) from public.payments where status = 'paid' and paid_at > now() - interval '30 days')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Accounts with money can't be deleted until it's settled
-- ---------------------------------------------------------------------------

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
  if exists (select 1 from public.ledger where user_id = uid having sum(amount) <> 0)
     or exists (select 1 from public.payouts where user_id = uid and status = 'requested') then
    raise exception 'has_balance';
  end if;
  update public.tickets set holder_name = 'Deleted account' where owner_id = uid;
  update public.orders set holder_name = 'Deleted account', email = 'deleted' where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Expire holds every minute where pg_cron is available; every write path
-- also expires lazily, so nothing depends on it.
-- ---------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('expire-payments', '* * * * *', 'select private.expire_payments()');
exception when others then
  raise notice 'pg_cron not available; payments expire lazily';
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function
  public.venue_busy(uuid, timestamptz, timestamptz),
  public.organizer_stats(uuid),
  public.payment_config(),
  public.resale_offers(text),
  public.active_promotions()
to anon, authenticated;

grant execute on function
  public.create_event(jsonb),
  public.purchase(text, jsonb, text, text, jsonb, text, jsonb),
  public.check_in(text),
  public.transfer_ticket(text, text, text),
  public.claim_tickets(),
  public.request_refund(text),
  public.add_event_staff(text, text),
  public.remove_event_staff(text, text),
  public.delete_account(),
  public.save_venue(jsonb),
  public.archive_venue(uuid),
  public.request_booking(uuid, timestamptz, int, text, text),
  public.respond_booking(uuid, boolean, text),
  public.cancel_booking(uuid),
  public.update_organizer(uuid, text, text),
  public.set_saved(text, boolean),
  public.set_follow(uuid, boolean),
  public.post_announcement(text, text),
  public.update_event(text, jsonb),
  public.cancel_event(text, text),
  public.create_promo(text, text, int, int),
  public.set_promo_active(uuid, boolean),
  public.check_promo(text, text),
  public.review_booking(uuid, int, text),
  public.reply_review(uuid, text),
  public.my_event_revenue(),
  public.my_status(),
  public.submit_identity_verification(jsonb),
  public.submit_venue_verification(jsonb),
  public.report(text, text, text, text),
  public.mark_notifications_read(uuid[]),
  public.admin_review_verification(uuid, boolean, text),
  public.admin_review_event(text, boolean, text),
  public.admin_resolve_report(uuid, boolean, text),
  public.admin_set_payout_hold(text, boolean),
  public.admin_suspend(uuid, boolean, text),
  public.admin_user(uuid),
  public.choose_payment_method(uuid, text),
  public.cancel_payment(uuid),
  public.payment_status(uuid),
  public.mock_gateway_complete(uuid, boolean),
  public.set_fee_mode(text, text),
  public.save_addons(text, jsonb),
  public.save_promoter_link(text, text, text, text, int),
  public.set_promoter_active(uuid, boolean),
  public.event_sales(text),
  public.addon_manifest(text),
  public.list_resale(text, int),
  public.cancel_resale(uuid),
  public.buy_resale(uuid, text),
  public.buy_promotion(text, int),
  public.buy_pro(int),
  public.broadcast(uuid, text, text, text),
  public.my_wallet(),
  public.set_payout_account(text, text, text),
  public.request_payout(),
  public.set_waitlist(uuid, boolean),
  public.my_ticket_secrets(),
  public.admin_confirm_transfer(uuid, text),
  public.admin_mark_refunded(uuid, text),
  public.admin_decide_payout(uuid, boolean, text),
  public.admin_takedown_event(text, text),
  public.admin_save_collection(jsonb),
  public.admin_delete_collection(uuid),
  public.admin_overview()
to authenticated;

-- Only the payments Edge Function (service role) settles card payments.
grant execute on function public.gateway_settle(uuid, text, text, int) to service_role;

-- Used inside RLS policies, which run as the caller.
grant execute on function
  private.owns_event(text), private.is_event_staff(text), private.my_email(),
  private.owns_venue(uuid), private.holds_ticket(text), private.is_admin()
to authenticated;
