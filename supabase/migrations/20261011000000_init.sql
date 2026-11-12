-- Tikkit schema.
--
-- Security model:
--   * Every table has row level security on.
--   * Clients can only SELECT. All writes go through the SECURITY DEFINER
--     functions at the bottom, which validate input and check the caller.
--   * Inventory (tiers.sold) and ticket codes are only ever set by the server.
--   * Definer functions pin search_path to '' and qualify every name.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.event_category as enum ('Music', 'Culture', 'Food', 'Water', 'Sport', 'Art');
create type public.event_status as enum ('scheduled', 'rescheduled', 'cancelled');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Server-only switches. No policies, so clients cannot read or write it.
create table private.settings (
  id boolean primary key default true check (id),
  -- Until a payment provider is wired in, paid orders are refused unless this
  -- is on. Local seed turns it on; hosted projects keep it off.
  allow_unpaid_orders boolean not null default false
);
insert into private.settings default values;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now()
);

create table public.events (
  id text primary key check (id ~ '^[a-z0-9-]{3,80}$'),
  owner_id uuid references auth.users (id) on delete set null,
  status public.event_status not null default 'scheduled',
  notice text check (char_length(notice) <= 500),
  title text not null check (char_length(title) between 3 and 120),
  category public.event_category not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue_name text not null check (char_length(venue_name) between 2 and 120),
  venue_area text not null check (char_length(venue_area) between 2 and 80),
  venue_address text not null check (char_length(venue_address) between 5 and 200),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  access text check (char_length(access) <= 300),
  -- Either an uploaded photo in the event-images bucket, or an external https image.
  image_path text check (image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'),
  image_url text check (image_url ~ '^https://'),
  organizer_name text not null check (char_length(organizer_name) between 2 and 80),
  description text not null check (char_length(description) between 20 and 5000),
  lineup text[] not null default '{}' check (cardinality(lineup) <= 30),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index events_starts_at_idx on public.events (starts_at);
create index events_owner_idx on public.events (owner_id);

create table public.tiers (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id) on delete cascade,
  position smallint not null default 0,
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 200),
  price integer not null check (price between 0 and 10000000), -- laari
  capacity integer not null check (capacity between 0 and 100000),
  sold integer not null default 0,
  check (sold between 0 and capacity)
);
create index tiers_event_idx on public.tiers (event_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event_id text not null references public.events (id) on delete restrict,
  holder_name text not null,
  email text not null,
  total integer not null check (total >= 0),
  status text not null check (status in ('confirmed', 'pending_payment', 'cancelled')),
  created_at timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^EVT-[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  order_id uuid not null references public.orders (id) on delete restrict,
  event_id text not null references public.events (id) on delete restrict,
  tier_id uuid not null references public.tiers (id) on delete restrict,
  -- Current holder. Null while a transferred ticket waits for its recipient
  -- to sign in with claim_email.
  owner_id uuid references auth.users (id) on delete set null,
  claim_email text,
  holder_name text not null,
  purchased_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users (id) on delete set null,
  transferred_at timestamptz,
  transferred_to_name text,
  transferred_to_email text,
  transferred_from uuid references public.tickets (id) on delete set null,
  refund_requested_at timestamptz
);
create index tickets_owner_idx on public.tickets (owner_id);
create index tickets_event_idx on public.tickets (event_id);
create index tickets_claim_idx on public.tickets (claim_email) where owner_id is null;

-- Door staff are invited by email, so inviting never reveals whether someone
-- already has an account.
create table public.event_staff (
  event_id text not null references public.events (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 254),
  added_at timestamptz not null default now(),
  primary key (event_id, email)
);

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

-- The caller's email, only if it has been verified (OTP and Google both verify).
create function private.my_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null
$$;

create function private.owns_event(p_event_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and e.owner_id = (select auth.uid())
  )
$$;

create function private.is_event_staff(p_event_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.owns_event(p_event_id) or exists (
    select 1 from public.event_staff s
    where s.event_id = p_event_id and s.email = private.my_email()
  )
$$;

-- 8 characters from a 32-letter alphabet with no 0/O or 1/I: 40 bits from a
-- CSPRNG. 256 is a multiple of 32, so the modulo is unbiased.
create function private.new_ticket_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  out text := '';
begin
  for i in 0..7 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return 'EVT-' || substr(out, 1, 4) || '-' || substr(out, 5, 4);
end;
$$;

-- Accepts codes typed with or without dashes and spaces.
create function private.normalize_code(p_code text) returns text
language sql immutable set search_path = '' as $$
  select case
    when c ~ '^EVT[A-Z2-9]{8}$' then 'EVT-' || substr(c, 4, 4) || '-' || substr(c, 8, 4)
    else null
  end
  from (select upper(regexp_replace(coalesce(p_code, ''), '[\s-]+', '', 'g')) as c) x
$$;

create function private.valid_email(p_email text) returns boolean
language sql immutable set search_path = '' as $$
  select p_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(p_email) <= 254
$$;

-- Profile row for every new account.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security: read access only
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.tiers enable row level security;
alter table public.orders enable row level security;
alter table public.tickets enable row level security;
alter table public.event_staff enable row level security;
alter table private.settings enable row level security;

create policy "Events are public" on public.events
  for select to anon, authenticated using (true);

create policy "Tiers are public" on public.tiers
  for select to anon, authenticated using (true);

create policy "Read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "Update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Read own orders" on public.orders
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Holders and event staff read tickets" on public.tickets
  for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_event_staff(event_id));

create policy "Owners and the staff member read staff" on public.event_staff
  for select to authenticated
  using (private.owns_event(event_id) or email = private.my_email());

-- Table privileges, on top of RLS: read only, plus a user's own display name.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.events, public.tiers to anon, authenticated;
grant select on public.profiles, public.orders, public.tickets, public.event_staff to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Write API (RPC)
-- ---------------------------------------------------------------------------

create function public.create_event(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_id text;
  v_start timestamptz;
  v_hours int;
  v_tier jsonb;
  v_pos int := 0;
  v_image text := nullif(p ->> 'imagePath', '');
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if (select count(*) from public.events where owner_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_events';
  end if;

  v_start := (p ->> 'startsAt')::timestamptz;
  v_hours := (p ->> 'hours')::int;
  if v_start is null or v_start <= now() or v_start > now() + interval '2 years' then raise exception 'invalid_start'; end if;
  if v_hours is null or v_hours not between 1 and 12 then raise exception 'invalid_length'; end if;
  if jsonb_typeof(p -> 'tiers') <> 'array' or jsonb_array_length(p -> 'tiers') not between 1 and 5 then
    raise exception 'invalid_tiers';
  end if;
  -- Uploaded photos must live in the caller's own folder.
  if v_image is not null and split_part(v_image, '/', 1) <> uid::text then raise exception 'invalid_image'; end if;

  v_id := left(trim(both '-' from regexp_replace(lower(coalesce(p ->> 'title', '')), '[^a-z0-9]+', '-', 'g')), 40);
  v_id := trim(both '-' from v_id) || '-' || encode(extensions.gen_random_bytes(4), 'hex');
  v_id := trim(both '-' from v_id);

  insert into public.events (
    id, owner_id, title, category, starts_at, ends_at, venue_name, venue_area, venue_address,
    lat, lng, access, image_path, image_url, organizer_name, description
  ) values (
    v_id, uid, trim(p ->> 'title'), (p ->> 'category')::public.event_category, v_start, v_start + make_interval(hours => v_hours),
    trim(p ->> 'venueName'), trim(p ->> 'venueArea'), trim(p ->> 'venueAddress'),
    4.1755, 73.5093, -- Malé until venues are geocoded.
    nullif(trim(coalesce(p ->> 'access', '')), ''),
    v_image,
    null, -- no photo: the app draws a sunset cover
    trim(p ->> 'organizerName'), trim(p ->> 'description')
  );

  for v_tier in select * from jsonb_array_elements(p -> 'tiers') loop
    insert into public.tiers (event_id, position, name, description, price, capacity)
    values (
      v_id, v_pos, trim(v_tier ->> 'name'),
      case when (v_tier ->> 'price')::int = 0 then 'Free entry' else 'Standard ticket' end,
      (v_tier ->> 'price')::int, (v_tier ->> 'capacity')::int
    );
    v_pos := v_pos + 1;
  end loop;

  return v_id;
end;
$$;

-- p_lines: [{ "tierId": uuid, "quantity": int }]
create function public.purchase(p_event_id text, p_lines jsonb, p_holder_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_email text := private.my_email();
  v_event public.events;
  v_lines jsonb;
  v_line record;
  v_tier public.tiers;
  v_count int := 0;
  v_total int := 0;
  v_order uuid;
  v_name text := trim(coalesce(p_holder_name, ''));
begin
  if uid is null or v_email is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'invalid_name'; end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'event_not_found'; end if;
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

  -- Anti-hoarding: at most 20 live tickets per person per event.
  if (select count(*) from public.tickets t
      where t.event_id = p_event_id and t.owner_id = uid
        and t.transferred_at is null and t.refund_requested_at is null) + v_count > 20 then
    raise exception 'limit_reached';
  end if;

  -- Lock tiers in a stable order so concurrent buyers cannot deadlock or oversell.
  for v_line in
    select (x ->> 'tier_id')::uuid as tier_id, (x ->> 'quantity')::int as quantity from jsonb_array_elements(v_lines) x
  loop
    select * into v_tier from public.tiers where id = v_line.tier_id and event_id = p_event_id for update;
    if not found then raise exception 'invalid_lines'; end if;
    if v_tier.capacity - v_tier.sold < v_line.quantity then raise exception 'sold_out'; end if;
    v_total := v_total + v_tier.price * v_line.quantity;
  end loop;

  if v_total > 0 and not (select allow_unpaid_orders from private.settings) then
    raise exception 'payment_required';
  end if;

  insert into public.orders (user_id, event_id, holder_name, email, total, status)
  values (uid, p_event_id, v_name, v_email, v_total, 'confirmed')
  returning id into v_order;

  for v_line in
    select (x ->> 'tier_id')::uuid as tier_id, (x ->> 'quantity')::int as quantity from jsonb_array_elements(v_lines) x
  loop
    update public.tiers set sold = sold + v_line.quantity where id = v_line.tier_id;
    for i in 1..v_line.quantity loop
      insert into public.tickets (code, order_id, event_id, tier_id, owner_id, holder_name)
      values (private.new_ticket_code(), v_order, p_event_id, v_line.tier_id, uid, v_name);
    end loop;
  end loop;

  return v_order;
end;
$$;

-- Door check-in. Codes for events the caller does not staff look exactly like
-- unknown codes, so the scanner cannot be used to probe other events.
create function public.check_in(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_code text := private.normalize_code(p_code);
  v_ticket public.tickets;
  v_event public.events;
  v_tier_name text;
  v_status text;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if v_code is null then return jsonb_build_object('status', 'unknown'); end if;

  select * into v_ticket from public.tickets where code = v_code;
  if not found or not private.is_event_staff(v_ticket.event_id) then
    return jsonb_build_object('status', 'unknown');
  end if;

  select * into v_event from public.events where id = v_ticket.event_id;
  select name into v_tier_name from public.tiers where id = v_ticket.tier_id;

  if v_ticket.transferred_at is not null or v_ticket.refund_requested_at is not null or v_event.status = 'cancelled' then
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
    'eventCancelled', v_event.status = 'cancelled'
  );
end;
$$;

create function public.transfer_ticket(p_code text, p_name text, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_ticket public.tickets;
  v_event public.events;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_recipient uuid;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'invalid_name'; end if;
  if not private.valid_email(v_email) then raise exception 'invalid_email'; end if;
  if v_email = private.my_email() then raise exception 'cannot_send_to_self'; end if;

  select * into v_ticket from public.tickets
  where code = private.normalize_code(p_code) and owner_id = uid
  for update;
  if not found then raise exception 'ticket_not_found'; end if;
  if v_ticket.transferred_at is not null or v_ticket.refund_requested_at is not null or v_ticket.checked_in_at is not null then
    raise exception 'ticket_not_active';
  end if;

  select * into v_event from public.events where id = v_ticket.event_id;
  if v_event.status = 'cancelled' or v_event.ends_at <= now() then raise exception 'event_closed'; end if;

  select id into v_recipient from auth.users
  where lower(email) = v_email and email_confirmed_at is not null;

  update public.tickets
  set transferred_at = now(), transferred_to_name = v_name, transferred_to_email = v_email
  where id = v_ticket.id;

  -- The recipient gets a fresh code, so the sender's QR stops working.
  insert into public.tickets (code, order_id, event_id, tier_id, owner_id, claim_email, holder_name, transferred_from)
  values (
    private.new_ticket_code(), v_ticket.order_id, v_ticket.event_id, v_ticket.tier_id,
    v_recipient, case when v_recipient is null then v_email end, v_name, v_ticket.id
  );
end;
$$;

-- Picks up tickets sent to the caller's verified email before they had an account.
create function public.claim_tickets() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := private.my_email();
  v_count int;
begin
  if v_email is null then return 0; end if;
  update public.tickets set owner_id = auth.uid(), claim_email = null
  where owner_id is null and claim_email = v_email;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.request_refund(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_ticket public.tickets;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  select * into v_ticket from public.tickets
  where code = private.normalize_code(p_code) and owner_id = uid
  for update;
  if not found then raise exception 'ticket_not_found'; end if;
  if v_ticket.transferred_at is not null or v_ticket.refund_requested_at is not null or v_ticket.checked_in_at is not null then
    raise exception 'ticket_not_active';
  end if;
  if (select ends_at from public.events where id = v_ticket.event_id) <= now() then raise exception 'event_closed'; end if;
  update public.tickets set refund_requested_at = now() where id = v_ticket.id;
end;
$$;

create function public.add_event_staff(p_event_id text, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not private.owns_event(p_event_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not private.valid_email(v_email) then raise exception 'invalid_email'; end if;
  if (select count(*) from public.event_staff where event_id = p_event_id) >= 50 then raise exception 'too_many_staff'; end if;
  insert into public.event_staff (event_id, email) values (p_event_id, v_email) on conflict do nothing;
end;
$$;

create function public.remove_event_staff(p_event_id text, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.owns_event(p_event_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  delete from public.event_staff where event_id = p_event_id and email = lower(trim(p_email));
end;
$$;

-- App Store and Play Store both require in-app account deletion.
create function public.delete_account() returns void
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
  -- Keep organisers' sales records but drop the person's details.
  update public.tickets set holder_name = 'Deleted account' where owner_id = uid;
  update public.orders set holder_name = 'Deleted account', email = 'deleted' where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

-- Only signed-in users may call the write API; nobody may call the helpers directly.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  public.create_event(jsonb),
  public.purchase(text, jsonb, text),
  public.check_in(text),
  public.transfer_ticket(text, text, text),
  public.claim_tickets(),
  public.request_refund(text),
  public.add_event_staff(text, text),
  public.remove_event_staff(text, text),
  public.delete_account()
to authenticated;
-- Used inside RLS policies, which run as the caller.
grant execute on function private.owns_event(text), private.is_event_staff(text), private.my_email() to authenticated;

-- New functions are not callable until granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: event photos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-images', 'event-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- Upload only into your own folder. Public bucket, so reads need no policy.
create policy "Upload event photos to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
