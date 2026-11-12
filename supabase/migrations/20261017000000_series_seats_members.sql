-- Recurring events, members-only presales, seat maps, and more trust.
--
--   * Series: create_event takes an optional recurrence and creates one event
--     per date, linked by series_id. Each date has its own tickets and can be
--     edited or cancelled on its own. Admins review a series in one go.
--   * Memberships: an organiser can sell a membership (monthly or yearly).
--     Members can buy during a presale before public_sale_at, and can get a
--     standing discount. Tikkit keeps a fee on each membership.
--   * Seats: a ticket type can be seated. The organiser lays out sections,
--     rows and seats; buyers pick seats, which are held with the payment and
--     released when it expires. Tickets carry their seat label.
--   * Trust: reviews of organisers from people who checked in, a public trust
--     summary, copycat-title detection, payout name checks, and scam alerts
--     to everyone affected when an event is taken down.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.events
  add column series_id uuid,
  -- Before this, only the organiser's members can buy. Null: on sale to all.
  add column public_sale_at timestamptz,
  -- Why an admin should look: similar_title, high_price.
  add column review_flags text[] not null default '{}';
create index events_series_idx on public.events (series_id) where series_id is not null;

alter table public.tiers add column seated boolean not null default false;
alter table public.tickets
  add column seat_id uuid,
  add column seat_label text check (char_length(seat_label) <= 40);

alter table private.settings add column membership_fee_bps int not null default 1000 check (membership_fee_bps between 0 and 5000);

alter table public.payouts add column flags text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Seats
-- ---------------------------------------------------------------------------

create table public.seats (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id) on delete cascade,
  tier_id uuid not null references public.tiers (id) on delete cascade,
  section text not null check (char_length(section) between 1 and 30),
  row_label text not null check (char_length(row_label) between 1 and 4),
  number smallint not null check (number between 1 and 200),
  position int not null default 0,
  status text not null default 'available' check (status in ('available', 'held', 'sold', 'blocked')),
  order_id uuid references public.orders (id) on delete set null,
  ticket_id uuid references public.tickets (id) on delete set null,
  unique (event_id, section, row_label, number)
);
create index seats_tier_idx on public.seats (tier_id, position);
create index seats_order_idx on public.seats (order_id) where order_id is not null;
alter table public.tickets add constraint tickets_seat_fk foreign key (seat_id) references public.seats (id) on delete set null;

-- No direct reads: availability comes from seat_map(), which never says who holds what.
alter table public.seats enable row level security;
revoke all on public.seats from anon, authenticated;

-- A ticket that's sent on or resold keeps its seat.
create function private.tickets_keep_seat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  src public.tickets;
begin
  if new.transferred_from is not null and new.seat_id is null then
    select * into src from public.tickets where id = new.transferred_from;
    new.seat_id := src.seat_id;
    new.seat_label := src.seat_label;
  end if;
  return new;
end;
$$;
create trigger tickets_keep_seat before insert on public.tickets
for each row execute function private.tickets_keep_seat();

create function private.tickets_point_seat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.seat_id is not null then
    update public.seats set ticket_id = new.id, status = 'sold' where id = new.seat_id;
  end if;
  return null;
end;
$$;
create trigger tickets_point_seat after insert on public.tickets
for each row execute function private.tickets_point_seat();

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null unique references public.organizers (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  perks text not null default '' check (char_length(perks) <= 500),
  price integer not null check (price between 100 and 10000000),
  period text not null default 'year' check (period in ('month', 'year')),
  discount_pct smallint not null default 0 check (discount_pct between 0 and 50),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.member_passes (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete cascade,
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  payment_id uuid references public.payments (id) on delete set null,
  created_at timestamptz not null default now()
);
create index member_passes_user_idx on public.member_passes (user_id, organizer_id, expires_at desc);
create index member_passes_org_idx on public.member_passes (organizer_id, expires_at);

alter table public.payments drop constraint payments_purpose_check;
alter table public.payments
  add constraint payments_purpose_check check (purpose in ('order', 'booking', 'resale', 'promotion', 'subscription', 'membership')),
  add column membership_id uuid references public.memberships (id) on delete set null;

alter table public.memberships enable row level security;
alter table public.member_passes enable row level security;
create policy "Active memberships are public" on public.memberships
  for select to anon, authenticated using (active);
create policy "Owners read their membership" on public.memberships
  for select to authenticated
  using (exists (select 1 from public.organizers o where o.id = organizer_id and o.owner_id = (select auth.uid())));
create policy "Own passes" on public.member_passes
  for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());
revoke all on public.memberships, public.member_passes from anon, authenticated;
grant select on public.memberships to anon, authenticated;
grant select on public.member_passes to authenticated;

create function private.is_member(p_uid uuid, p_organizer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_passes
    where user_id = p_uid and organizer_id = p_organizer and expires_at > now()
  )
$$;

-- ---------------------------------------------------------------------------
-- Organiser reviews (from people who were there)
-- ---------------------------------------------------------------------------

create table public.organizer_reviews (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  event_id text not null references public.events (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 80),
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);
create index organizer_reviews_org_idx on public.organizer_reviews (organizer_id, created_at desc);
alter table public.organizer_reviews enable row level security;
create policy "Organiser reviews are public" on public.organizer_reviews for select to anon, authenticated using (true);
revoke all on public.organizer_reviews from anon, authenticated;
grant select on public.organizer_reviews to anon, authenticated;

create function public.review_organizer(p_event_id text, p_rating int, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  e public.events;
  v_name text;
  v_id uuid;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  select * into e from public.events where id = p_event_id;
  if not found or e.organizer_id is null then raise exception 'event_not_found'; end if;
  if e.owner_id = uid then raise exception 'not_allowed' using errcode = '42501'; end if;
  -- Only people who were actually let in, once it's over.
  select holder_name into v_name from public.tickets
  where event_id = p_event_id and owner_id = uid and checked_in_at is not null limit 1;
  if v_name is null then raise exception 'review_not_open'; end if;
  if e.ends_at > now() then raise exception 'review_not_open'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'invalid_rating'; end if;
  if char_length(trim(coalesce(p_body, ''))) > 500 then raise exception 'invalid_message'; end if;
  begin
    insert into public.organizer_reviews (organizer_id, event_id, user_id, author_name, rating, body)
    values (e.organizer_id, e.id, uid, split_part(v_name, ' ', 1), p_rating, trim(coalesce(p_body, '')))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_reviewed';
  end;
  return v_id;
end;
$$;

-- The public trust summary on organiser pages and events.
create or replace function public.organizer_stats(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'followers', (select count(*) from public.follows where organizer_id = p_id),
    'events', (select count(*) from public.events where organizer_id = p_id and listing = 'approved'),
    'eventsRun', (select count(*) from public.events
                  where organizer_id = p_id and listing = 'approved' and status <> 'cancelled' and ends_at < now()),
    'cancelled', (select count(*) from public.events where organizer_id = p_id and listing = 'approved' and status = 'cancelled'),
    'ticketsSold', (select count(*) from public.tickets t join public.events e on e.id = t.event_id
                    where e.organizer_id = p_id and t.transferred_from is null),
    'rating', (select round(avg(rating)::numeric, 1) from public.organizer_reviews where organizer_id = p_id),
    'reviews', (select count(*) from public.organizer_reviews where organizer_id = p_id),
    'since', (select created_at from public.organizers where id = p_id),
    'verified', (select verified from public.organizers where id = p_id),
    'membership', (select jsonb_build_object('id', m.id, 'name', m.name, 'perks', m.perks, 'price', m.price,
                     'period', m.period, 'discountPct', m.discount_pct)
                   from public.memberships m where m.organizer_id = p_id and m.active),
    'members', (select count(distinct user_id) from public.member_passes where organizer_id = p_id and expires_at > now())
  )
$$;

-- ---------------------------------------------------------------------------
-- Listings: copycat titles and big prices always get a human look
-- ---------------------------------------------------------------------------

create or replace function private.events_set_listing() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_profile public.profiles;
  v_flags text[] := '{}';
begin
  if uid is null or new.owner_id is distinct from uid then return new; end if;
  select * into v_profile from public.profiles where id = uid;
  if v_profile.suspended_at is not null then raise exception 'account_suspended'; end if;

  -- Someone else's live event with nearly the same name: a common way to
  -- impersonate a popular night and sell fake tickets.
  if exists (
    select 1 from public.events e
    where e.owner_id is distinct from uid and e.listing = 'approved' and e.ends_at > now()
      and extensions.similarity(lower(e.title), lower(new.title)) > 0.6
  ) then
    v_flags := array_append(v_flags, 'similar_title');
  end if;
  new.review_flags := v_flags;

  if v_profile.verified_at is null then
    if (select count(*) from public.events where owner_id = uid and listing = 'draft' and ends_at > now()) >= 3
       and new.series_id is null then
      raise exception 'too_many_drafts';
    end if;
    new.listing := 'draft';
  elsif private.is_trusted(uid) and cardinality(v_flags) = 0 then
    new.listing := 'approved';
    new.auto_approved := true;
    new.reviewed_at := now();
  else
    new.listing := 'pending';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Creating events, optionally as a series
-- ---------------------------------------------------------------------------

-- One event. The caller's checks (signed in, rate limits) are done by create_event.
create function private.create_event_one(p jsonb, p_start timestamptz, p_series uuid, p_sale timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_id text;
  v_end timestamptz;
  v_hours int := (p ->> 'hours')::int;
  v_tier jsonb;
  v_pos int := 0;
  v_image text := nullif(p ->> 'imagePath', '');
  v_venue public.venues;
  v_booking public.venue_bookings;
  v_venue_id uuid := nullif(p ->> 'venueId', '')::uuid;
  v_booking_id uuid := nullif(p ->> 'bookingId', '')::uuid;
begin
  if p_start is null or p_start <= now() or p_start > now() + interval '2 years' then raise exception 'invalid_start'; end if;
  if v_hours is null or v_hours not between 1 and 12 then raise exception 'invalid_length'; end if;
  v_end := p_start + make_interval(hours => v_hours);
  if jsonb_typeof(p -> 'tiers') <> 'array' or jsonb_array_length(p -> 'tiers') not between 1 and 5 then
    raise exception 'invalid_tiers';
  end if;
  if v_image is not null and split_part(v_image, '/', 1) <> uid::text then raise exception 'invalid_image'; end if;
  if p_sale is not null and (p_sale >= p_start) then raise exception 'invalid_presale'; end if;

  if v_booking_id is not null then
    select * into v_booking from public.venue_bookings
    where id = v_booking_id and requester_id = uid and status = 'approved'
    for update;
    if not found then raise exception 'booking_not_found'; end if;
    if v_booking.event_id is not null then raise exception 'booking_in_use'; end if;
    if p_start < v_booking.starts_at or v_end > v_booking.ends_at then raise exception 'outside_booking'; end if;
    select * into v_venue from public.venues where id = v_booking.venue_id;
  elsif v_venue_id is not null then
    select * into v_venue from public.venues where id = v_venue_id and owner_id = uid and not archived;
    if not found then raise exception 'venue_not_found'; end if;
  end if;

  v_id := left(trim(both '-' from regexp_replace(lower(coalesce(p ->> 'title', '')), '[^a-z0-9]+', '-', 'g')), 40);
  v_id := trim(both '-' from v_id) || '-' || encode(extensions.gen_random_bytes(4), 'hex');
  v_id := trim(both '-' from v_id);

  insert into public.events (
    id, owner_id, venue_id, series_id, public_sale_at, title, category, starts_at, ends_at,
    venue_name, venue_area, venue_address, lat, lng, access, image_path, image_url, organizer_name, description
  ) values (
    v_id, uid, v_venue.id, p_series, case when p_sale > now() then p_sale end,
    trim(p ->> 'title'), (p ->> 'category')::public.event_category, p_start, v_end,
    coalesce(v_venue.name, trim(p ->> 'venueName')),
    coalesce(v_venue.area, trim(p ->> 'venueArea')),
    coalesce(v_venue.address, trim(p ->> 'venueAddress')),
    coalesce(v_venue.lat, 4.1755), coalesce(v_venue.lng, 73.5093),
    coalesce(nullif(trim(coalesce(p ->> 'access', '')), ''), v_venue.access),
    v_image, null, trim(p ->> 'organizerName'), trim(p ->> 'description')
  );

  if v_booking_id is not null then
    update public.venue_bookings set event_id = v_id where id = v_booking_id;
  elsif v_venue.id is not null then
    begin
      insert into public.venue_bookings (
        venue_id, requester_id, requester_name, requester_email, owner_email, starts_at, ends_at,
        status, total, own_use, event_id, decided_at
      ) values (
        v_venue.id, uid, trim(p ->> 'organizerName'), coalesce(private.my_email(), ''), private.my_email(),
        p_start, v_end, 'approved', 0, true, v_id, now()
      );
    exception when exclusion_violation then
      raise exception 'venue_unavailable';
    end;
    update public.venue_bookings
    set status = 'declined', reply = 'The space was booked by someone else for this time.', decided_at = now()
    where venue_id = v_venue.id and status = 'pending' and during && tstzrange(p_start, v_end);
  end if;

  for v_tier in select * from jsonb_array_elements(p -> 'tiers') loop
    insert into public.tiers (event_id, position, name, description, price, capacity)
    values (
      v_id, v_pos, trim(v_tier ->> 'name'),
      case when (v_tier ->> 'price')::int = 0 then 'Free entry' else 'Standard ticket' end,
      (v_tier ->> 'price')::int, (v_tier ->> 'capacity')::int
    );
    v_pos := v_pos + 1;
  end loop;

  -- Very expensive tickets always get a human look, even from trusted organisers.
  if exists (select 1 from public.tiers where event_id = v_id and price > 1000000) then
    update public.events set review_flags = array_append(review_flags, 'high_price'),
      listing = case when listing = 'approved' then 'pending'::public.listing_status else listing end,
      auto_approved = false
    where id = v_id;
  end if;

  return v_id;
end;
$$;

-- p as before, plus:
--   recurrence:   { "every": "week" | "fortnight" | "month", "count": 2..12 }
--   publicSaleAt: members-only presale until then (for a series, the same
--                 lead time before each date)
-- Returns the first event's id.
create or replace function public.create_event(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_start timestamptz := (p ->> 'startsAt')::timestamptz;
  v_sale timestamptz := nullif(p ->> 'publicSaleAt', '')::timestamptz;
  v_lead interval;
  v_every text := p -> 'recurrence' ->> 'every';
  v_count int := coalesce((p -> 'recurrence' ->> 'count')::int, 1);
  v_step interval;
  v_series uuid;
  v_first text;
  v_id text;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  -- A series counts once.
  if (select count(distinct coalesce(series_id::text, id)) from public.events
      where owner_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_events';
  end if;
  if v_start is null then raise exception 'invalid_start'; end if;
  if v_sale is not null then
    if not exists (select 1 from public.profiles where id = uid and verified_at is not null) then raise exception 'not_verified'; end if;
    v_lead := v_start - v_sale;
  end if;

  if v_every is null then
    return private.create_event_one(p, v_start, null, v_sale);
  end if;
  if v_every not in ('week', 'fortnight', 'month') or v_count not between 2 and 12 then raise exception 'invalid_recurrence'; end if;
  if nullif(p ->> 'bookingId', '') is not null then raise exception 'booking_single'; end if;
  v_step := case v_every when 'week' then interval '7 days' when 'fortnight' then interval '14 days' else interval '1 month' end;
  v_series := gen_random_uuid();
  for i in 0..v_count - 1 loop
    v_id := private.create_event_one(p, v_start + v_step * i, v_series, case when v_lead is not null then v_start + v_step * i - v_lead end);
    if i = 0 then v_first := v_id; end if;
  end loop;
  return v_first;
end;
$$;

-- Members-only window for one event. Null opens it to everyone now.
create function public.set_public_sale(p_event_id text, p_at timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
begin
  select * into e from public.events where id = p_event_id and owner_id = auth.uid();
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_at is not null and (p_at >= e.starts_at or p_at <= now()) then raise exception 'invalid_presale'; end if;
  update public.events set public_sale_at = p_at where id = p_event_id;
end;
$$;

-- Admins approve or reject a whole series at once.
create or replace function public.admin_review_event(p_id text, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.events;
  v_note text := trim(coalesce(p_note, ''));
begin
  perform private.require_admin();
  if not p_approve and char_length(v_note) < 2 then raise exception 'note_required'; end if;
  select * into v from public.events where id = p_id for update;
  if not found then raise exception 'not_found'; end if;

  update public.events set
    listing = case when p_approve then 'approved'::public.listing_status else 'rejected'::public.listing_status end,
    review_note = nullif(v_note, ''), reviewed_at = now(), edited_after_review = false, auto_approved = false,
    review_flags = '{}'
  where id = p_id
     or (v.series_id is not null and series_id = v.series_id and listing in ('pending', 'draft') and ends_at > now());

  if p_approve and v.listing <> 'approved' then
    perform private.notify(v.owner_id, 'listing', 'Your event is live',
      v.title || case when v.series_id is not null then ' (every date)' else '' end || ' is now on Explore.', '/organiser/' || p_id);
  elsif not p_approve then
    perform private.notify(v.owner_id, 'listing', 'Changes needed', v.title || ': ' || v_note, '/organiser/' || p_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seating
-- ---------------------------------------------------------------------------

-- Lays out seats for a ticket type that hasn't sold yet.
-- p: [{ "section": "Stand A", "rows": 10, "seatsPerRow": 20 }]  (rows lettered A, B, C...)
create function public.save_seating(p_event_id text, p_tier_id uuid, p jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  t public.tiers;
  s jsonb;
  v_rows int;
  v_per int;
  v_pos int := 0;
  v_total int := 0;
  v_label text;
begin
  if not private.owns_event(p_event_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into t from public.tiers where id = p_tier_id and event_id = p_event_id for update;
  if not found then raise exception 'invalid_tiers'; end if;
  if t.sold > 0 then raise exception 'tier_has_sales'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between 1 and 8 then raise exception 'invalid_seating'; end if;

  delete from public.seats where tier_id = p_tier_id;
  for s in select * from jsonb_array_elements(p) loop
    v_rows := (s ->> 'rows')::int;
    v_per := (s ->> 'seatsPerRow')::int;
    if char_length(trim(coalesce(s ->> 'section', ''))) not between 1 and 30
       or v_rows is null or v_rows not between 1 and 26 or v_per is null or v_per not between 1 and 60 then
      raise exception 'invalid_seating';
    end if;
    for r in 0..v_rows - 1 loop
      v_label := chr(65 + r);
      for n in 1..v_per loop
        insert into public.seats (event_id, tier_id, section, row_label, number, position)
        values (p_event_id, p_tier_id, trim(s ->> 'section'), v_label, n, v_pos);
        v_pos := v_pos + 1;
      end loop;
    end loop;
  end loop;
  select count(*) into v_total from public.seats where tier_id = p_tier_id;
  if v_total > 2000 then raise exception 'invalid_seating'; end if;
  update public.tiers set seated = true, capacity = v_total where id = p_tier_id;
  return v_total;
end;
$$;

create function public.clear_seating(p_event_id text, p_tier_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.owns_event(p_event_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if exists (select 1 from public.tiers where id = p_tier_id and sold > 0) then raise exception 'tier_has_sales'; end if;
  delete from public.seats where tier_id = p_tier_id;
  update public.tiers set seated = false where id = p_tier_id and event_id = p_event_id;
end;
$$;

-- Which seats are free. Never says who holds a taken one.
create function public.seat_map(p_event_id text)
returns table (id uuid, tier_id uuid, section text, row_label text, seat_number smallint, seat_position int, free boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.tier_id, s.section, s.row_label, s.number, s.position, s.status = 'available'
  from public.seats s join public.events e on e.id = s.event_id
  where s.event_id = p_event_id and (e.listing = 'approved' or e.owner_id = (select auth.uid()))
  order by s.position
$$;

-- ---------------------------------------------------------------------------
-- Buying: presale, member discount, seats
-- ---------------------------------------------------------------------------

drop function public.purchase(text, jsonb, text, text, jsonb, text, jsonb);
create function public.purchase(
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

-- Releasing a hold also frees its seats.
create or replace function private.release_payment(p_payment_id uuid, p_status text) returns void
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
    update public.seats set status = 'available', order_id = null where order_id = p.order_id and status = 'held';
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

-- Seated tickets are issued one per chosen seat.
create or replace function private.issue_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  e public.events;
  l record;
  s record;
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

  if o.gift_email is not null then
    select id into v_recipient from auth.users where lower(email) = o.gift_email and email_confirmed_at is not null;
    v_claim := case when v_recipient is null then o.gift_email end;
    v_holder := o.gift_name;
  else
    v_recipient := o.user_id;
    v_holder := o.holder_name;
  end if;

  for l in select ol.tier_id, ol.quantity, t.seated from public.order_lines ol join public.tiers t on t.id = ol.tier_id where ol.order_id = o.id loop
    if l.seated then
      for s in select id, section, row_label, number from public.seats where order_id = o.id and tier_id = l.tier_id order by position loop
        insert into public.tickets (code, order_id, event_id, tier_id, owner_id, claim_email, holder_name, seat_id, seat_label)
        values (private.new_ticket_code(), o.id, o.event_id, l.tier_id, v_recipient, v_claim, v_holder, s.id,
          left(s.section || ', row ' || s.row_label || ', seat ' || s.number, 40));
      end loop;
    else
      for i in 1..l.quantity loop
        insert into public.tickets (code, order_id, event_id, tier_id, owner_id, claim_email, holder_name)
        values (private.new_ticket_code(), o.id, o.event_id, l.tier_id, v_recipient, v_claim, v_holder);
      end loop;
    end if;
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

-- ---------------------------------------------------------------------------
-- Memberships: selling and settling
-- ---------------------------------------------------------------------------

-- p: { name, perks, price, period, discountPct, active }
create function public.save_membership(p_organizer_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
begin
  if not exists (select 1 from public.organizers where id = p_organizer_id and owner_id = uid) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = uid and verified_at is not null and suspended_at is null) then
    raise exception 'not_verified';
  end if;
  begin
    insert into public.memberships (organizer_id, name, perks, price, period, discount_pct, active)
    values (p_organizer_id, trim(p ->> 'name'), trim(coalesce(p ->> 'perks', '')), (p ->> 'price')::int,
      coalesce(p ->> 'period', 'year'), coalesce((p ->> 'discountPct')::int, 0), coalesce((p ->> 'active')::boolean, true))
    on conflict (organizer_id) do update set name = excluded.name, perks = excluded.perks, price = excluded.price,
      period = excluded.period, discount_pct = excluded.discount_pct, active = excluded.active
    returning id into v_id;
  exception when check_violation then
    raise exception 'invalid_membership';
  end;
  return v_id;
end;
$$;

create function public.buy_membership(p_membership_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.memberships;
  o public.organizers;
  v_payment uuid;
begin
  if uid is null or private.my_email() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  select * into m from public.memberships where id = p_membership_id and active;
  if not found then raise exception 'not_found'; end if;
  select * into o from public.organizers where id = m.organizer_id;
  if o.owner_id = uid then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not private.payments_available() then raise exception 'payment_required'; end if;
  if exists (select 1 from public.payments where payer_id = uid and status = 'pending' and membership_id = m.id) then
    raise exception 'too_many_pending';
  end if;
  insert into public.payments (reference, payer_id, purpose, membership_id, label, meta, amount, fee, expires_at)
  values (private.new_reference(), uid, 'membership', m.id,
    left(m.name || ', ' || case m.period when 'month' then '1 month' else '1 year' end, 160),
    jsonb_build_object('organizerId', o.id), m.price,
    round(m.price * (private.settings()).membership_fee_bps / 10000.0)::int, now() + interval '24 hours')
  returning id into v_payment;
  return v_payment;
end;
$$;

create function public.my_memberships() returns table (organizer_id uuid, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select organizer_id, max(expires_at) from public.member_passes
  where user_id = (select auth.uid()) and expires_at > now()
  group by organizer_id
$$;

create or replace function private.settle_payment(p_payment_id uuid, p_provider text, p_provider_ref text, p_by uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  b public.venue_bookings;
  r public.resale_listings;
  t public.tickets;
  e public.events;
  m public.memberships;
  v_buyer_email text;
  v_start timestamptz;
  v_months int;
  v_owner uuid;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if p.status in ('paid', 'refund_due', 'refunded') then return p.status; end if;

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
    insert into public.tickets (code, order_id, event_id, tier_id, owner_id, holder_name, transferred_from)
    values (private.new_ticket_code(), t.order_id, t.event_id, t.tier_id, r.buyer_id, r.buyer_name, t.id);
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

  elsif p.purpose = 'membership' then
    select * into m from public.memberships where id = p.membership_id;
    select owner_id into v_owner from public.organizers where id = m.organizer_id;
    insert into public.member_passes (membership_id, organizer_id, user_id, expires_at, payment_id)
    values (m.id, m.organizer_id, p.payer_id,
      greatest(now(), coalesce((select max(expires_at) from public.member_passes where user_id = p.payer_id and organizer_id = m.organizer_id), now()))
        + case m.period when 'month' then interval '1 month' else interval '1 year' end,
      p.id);
    -- A week before it can be withdrawn, in case the payment is disputed.
    insert into public.ledger (user_id, amount, kind, memo, payment_id, available_at)
    values (v_owner, p.amount - p.fee, 'sale', left('Membership: ' || m.name, 200), p.id, now() + interval '7 days');
    perform private.notify(p.payer_id, 'payment', 'You’re a member', m.name || ': early access and member prices are on.',
      '/organizer/' || (select slug from public.organizers where id = m.organizer_id));
  end if;

  return 'paid';
end;
$$;

-- ---------------------------------------------------------------------------
-- Door: show the seat
-- ---------------------------------------------------------------------------

create or replace function public.check_in(p_code text) returns jsonb
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
    'seat', v_ticket.seat_label,
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

-- ---------------------------------------------------------------------------
-- Trust: payout checks and scam alerts
-- ---------------------------------------------------------------------------

-- Flags withdrawals an admin should look at closely: an account name that
-- doesn't match the verified name, or someone's first ever withdrawal.
create or replace function public.request_payout() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  a public.payout_accounts;
  v public.verifications;
  v_available bigint;
  v_flags text[] := '{}';
  v_id uuid;
  norm text;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = uid and verified_at is not null and suspended_at is null) then
    raise exception 'not_verified';
  end if;
  select * into a from public.payout_accounts where user_id = uid;
  if not found then raise exception 'no_payout_account'; end if;
  if a.changed_at > now() - interval '48 hours' then raise exception 'account_cooling_off'; end if;
  if exists (select 1 from public.payouts where user_id = uid and status = 'requested') then raise exception 'payout_pending'; end if;
  perform pg_advisory_xact_lock(hashtext('payout:' || uid::text));
  select available into v_available from private.balance(uid);
  if v_available < (private.settings()).min_payout then raise exception 'below_min_payout'; end if;

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

  insert into public.payouts (user_id, amount, account, flags)
  values (uid, v_available, jsonb_build_object('bank', a.bank, 'accountName', a.account_name, 'accountNumber', a.account_number,
    'verifiedName', coalesce(v.business_name, v.legal_name)), v_flags)
  returning id into v_id;
  insert into public.ledger (user_id, amount, kind, memo, payout_id, available_at)
  values (uid, -v_available, 'payout', 'Withdrawal to ' || a.bank || ' ' || right(a.account_number, 4), v_id, now());
  return v_id;
end;
$$;

-- Taking an event down tells everyone who might be targeted: ticket holders,
-- people who saved it, and the organiser's followers.
create or replace function public.admin_takedown_event(p_id text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
  e public.events;
begin
  perform private.require_admin();
  if char_length(v_reason) not between 2 and 500 then raise exception 'note_required'; end if;
  select * into e from public.events where id = p_id;
  if not found then raise exception 'not_found'; end if;
  update public.events set status = 'cancelled', notice = 'Removed by Tikkit: ' || v_reason, payout_hold = true
  where id = p_id and status <> 'cancelled';
  if not found then raise exception 'not_found'; end if;
  insert into public.announcements (event_id, author_id, kind, body)
  values (p_id, auth.uid(), 'cancelled', 'This event was removed by Tikkit. Everyone who paid gets a full refund.');
  update public.venue_bookings set status = 'cancelled', cancelled_by = 'owner', decided_at = now()
  where event_id = p_id and own_use;
  update public.reports set status = 'upheld', resolution_note = v_reason, resolved_by = auth.uid(), resolved_at = now()
  where target_kind = 'event' and target_id = p_id and status = 'open';

  insert into public.notifications (user_id, kind, title, body, link)
  select distinct u, 'alert', 'Scam alert: ' || left(e.title, 90),
    'We removed this event. If anyone asks you to pay for it outside Tikkit, don’t. Anyone who paid through Tikkit is refunded.',
    '/help/safety'
  from (
    select owner_id as u from public.tickets where event_id = p_id and owner_id is not null
    union select user_id from public.saved_events where event_id = p_id
    union select user_id from public.follows where organizer_id = e.organizer_id
  ) people
  where u is not null and u <> e.owner_id;
end;
$$;

-- The checkout config gains the membership fee.
create or replace function public.payment_config() returns jsonb
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
    'membershipFeeBps', s.membership_fee_bps,
    'promotedDayPrice', s.promoted_day_price,
    'proMonthPrice', s.pro_month_price,
    'proYearPrice', s.pro_year_price,
    'holdDays', s.hold_days
  )
  from private.settings s
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
  public.active_promotions(),
  public.seat_map(text)
to anon, authenticated;

grant execute on function
  public.create_event(jsonb),
  public.purchase(text, jsonb, text, text, jsonb, text, jsonb, uuid[]),
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
  public.admin_overview(),
  public.review_organizer(text, int, text),
  public.set_public_sale(text, timestamptz),
  public.save_seating(text, uuid, jsonb),
  public.clear_seating(text, uuid),
  public.save_membership(uuid, jsonb),
  public.buy_membership(uuid),
  public.my_memberships()
to authenticated;

grant execute on function public.gateway_settle(uuid, text, text, int) to service_role;

grant execute on function
  private.owns_event(text), private.is_event_staff(text), private.my_email(),
  private.owns_venue(uuid), private.holds_ticket(text), private.is_admin()
to authenticated;
