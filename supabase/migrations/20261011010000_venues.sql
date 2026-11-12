-- Venues and space rentals.
--
--   * Anyone can list spaces they own. Organisers with several venues pick one
--     when creating an event.
--   * Owners can open a space for rent. Organisers send a booking request for a
--     time slot; the owner approves or declines it.
--   * An approved booking blocks its time slot. Two approved bookings for the
--     same space can never overlap (exclusion constraint), even under races.
--   * Events at a venue always hold an approved booking: owners get one
--     automatically, renters must already have one covering the event.
--   * Payment for rentals is arranged between the two people until in-app
--     payments exist. The quoted total is stored on the booking.
--
-- Same security model as the init migration: clients read through RLS and
-- write only through the SECURITY DEFINER functions below.

create extension if not exists btree_gist with schema extensions;

create type public.booking_status as enum ('pending', 'approved', 'declined', 'cancelled');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  area text not null check (char_length(area) between 2 and 80),
  address text not null check (char_length(address) between 5 and 200),
  lat double precision not null default 4.1755 check (lat between -90 and 90),
  lng double precision not null default 73.5093 check (lng between -180 and 180),
  access text check (char_length(access) <= 300),
  capacity integer not null check (capacity between 1 and 100000),
  description text not null default '' check (char_length(description) <= 2000),
  amenities text[] not null default '{}' check (cardinality(amenities) <= 12),
  image_path text check (image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'),
  image_url text check (image_url ~ '^https://'),
  for_rent boolean not null default false,
  hourly_rate integer check (hourly_rate between 0 and 10000000), -- laari
  min_hours smallint not null default 1 check (min_hours between 1 and 24),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  check (not for_rent or hourly_rate is not null)
);
create index venues_owner_idx on public.venues (owner_id);
create index venues_for_rent_idx on public.venues (area) where for_rent and not archived;

create table public.venue_bookings (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  requester_id uuid not null references auth.users (id) on delete cascade,
  -- The two sides' contact details. The owner's email is only filled in once
  -- they approve, so a request never reveals who owns a space.
  requester_name text not null check (char_length(requester_name) between 2 and 80),
  requester_email text not null,
  owner_email text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  during tstzrange generated always as (tstzrange(starts_at, ends_at)) stored,
  status public.booking_status not null default 'pending',
  message text not null default '' check (char_length(message) <= 1000),
  reply text not null default '' check (char_length(reply) <= 1000),
  total integer not null check (total >= 0), -- laari, quoted when requested
  -- True for the booking an owner gets when they put their own event on.
  own_use boolean not null default false,
  event_id text references public.events (id) on delete set null,
  cancelled_by text check (cancelled_by in ('requester', 'owner')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (ends_at > starts_at),
  constraint venue_bookings_no_overlap
    exclude using gist (venue_id with =, during with &&) where (status = 'approved')
);
create index venue_bookings_venue_idx on public.venue_bookings (venue_id, starts_at);
create index venue_bookings_requester_idx on public.venue_bookings (requester_id);
create unique index venue_bookings_event_idx on public.venue_bookings (event_id) where event_id is not null;

alter table public.events add column venue_id uuid references public.venues (id) on delete set null;
create index events_venue_idx on public.events (venue_id);

-- ---------------------------------------------------------------------------
-- Helpers and read access
-- ---------------------------------------------------------------------------

create function private.owns_venue(p_venue_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.venues v
    where v.id = p_venue_id and v.owner_id = (select auth.uid())
  )
$$;

alter table public.venues enable row level security;
alter table public.venue_bookings enable row level security;

-- Spaces for rent are public. Other venues are visible to their owner only.
create policy "Rentable venues are public" on public.venues
  for select to anon, authenticated
  using ((for_rent and not archived) or owner_id = (select auth.uid()));

create policy "Requester and venue owner read bookings" on public.venue_bookings
  for select to authenticated
  using (requester_id = (select auth.uid()) or private.owns_venue(venue_id));

-- Supabase grants everything on new tables by default; RLS would still block
-- writes, but tables here are read-only for clients at the privilege level too.
revoke all on public.venues, public.venue_bookings from anon, authenticated;
grant select on public.venues to anon, authenticated;
grant select on public.venue_bookings to authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Taken time slots for a space, without saying who booked them.
create function public.venue_busy(p_venue_id uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.starts_at, b.ends_at
  from public.venue_bookings b
  join public.venues v on v.id = b.venue_id
  where b.venue_id = p_venue_id
    and b.status = 'approved'
    and b.ends_at > p_from and b.starts_at < least(p_to, p_from + interval '1 year')
    and ((v.for_rent and not v.archived) or v.owner_id = (select auth.uid()))
  order by b.starts_at
  limit 500
$$;

-- ---------------------------------------------------------------------------
-- Write API
-- ---------------------------------------------------------------------------

-- Creates a venue, or updates one the caller owns when p.id is set.
create function public.save_venue(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_image text := nullif(p ->> 'imagePath', '');
  v_for_rent boolean := coalesce((p ->> 'forRent')::boolean, false);
  v_rate int := (p ->> 'hourlyRate')::int;
  v_amenities text[];
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if v_image is not null and split_part(v_image, '/', 1) <> uid::text then raise exception 'invalid_image'; end if;
  if v_for_rent and v_rate is null then raise exception 'invalid_rate'; end if;

  if jsonb_typeof(coalesce(p -> 'amenities', '[]')) <> 'array' then raise exception 'invalid_amenities'; end if;
  select coalesce(array_agg(distinct trim(a)), '{}') into v_amenities
  from jsonb_array_elements_text(coalesce(p -> 'amenities', '[]')) a;
  if cardinality(v_amenities) > 12 or exists (select 1 from unnest(v_amenities) a where char_length(a) not between 2 and 40) then
    raise exception 'invalid_amenities';
  end if;

  if v_id is null then
    if (select count(*) from public.venues where owner_id = uid and not archived) >= 20 then
      raise exception 'too_many_venues';
    end if;
    insert into public.venues (
      owner_id, name, area, address, access, capacity, description, amenities, image_path, image_url,
      for_rent, hourly_rate, min_hours
    ) values (
      uid, trim(p ->> 'name'), trim(p ->> 'area'), trim(p ->> 'address'),
      nullif(trim(coalesce(p ->> 'access', '')), ''),
      (p ->> 'capacity')::int, trim(coalesce(p ->> 'description', '')), v_amenities,
      v_image,
      null, -- no photo: the app draws a sunset cover
      v_for_rent, v_rate, coalesce((p ->> 'minHours')::smallint, 1)
    )
    returning id into v_id;
  else
    update public.venues set
      name = trim(p ->> 'name'),
      area = trim(p ->> 'area'),
      address = trim(p ->> 'address'),
      access = nullif(trim(coalesce(p ->> 'access', '')), ''),
      capacity = (p ->> 'capacity')::int,
      description = trim(coalesce(p ->> 'description', '')),
      amenities = v_amenities,
      -- A new photo replaces the old one; no photo keeps what is there.
      image_path = coalesce(v_image, image_path),
      image_url = case when v_image is not null then null else image_url end,
      for_rent = v_for_rent,
      hourly_rate = v_rate,
      min_hours = coalesce((p ->> 'minHours')::smallint, min_hours)
    where id = v_id and owner_id = uid and not archived;
    if not found then raise exception 'venue_not_found'; end if;
  end if;

  -- Taking a space off the market turns down requests still waiting.
  if not v_for_rent then
    update public.venue_bookings
    set status = 'declined', reply = 'This space is no longer for rent.', decided_at = now()
    where venue_id = v_id and status = 'pending';
  end if;

  return v_id;
end;
$$;

-- Hides a venue. Approved bookings stay valid; waiting requests are declined.
create function public.archive_venue(p_venue_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.venues set archived = true, for_rent = false
  where id = p_venue_id and owner_id = (select auth.uid()) and not archived;
  if not found then raise exception 'venue_not_found'; end if;
  update public.venue_bookings
  set status = 'declined', reply = 'This space is no longer for rent.', decided_at = now()
  where venue_id = p_venue_id and status = 'pending';
end;
$$;

create function public.request_booking(
  p_venue_id uuid, p_starts_at timestamptz, p_hours int, p_name text, p_message text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_email text := private.my_email();
  v_venue public.venues;
  v_name text := trim(coalesce(p_name, ''));
  v_message text := trim(coalesce(p_message, ''));
  v_end timestamptz;
  v_id uuid;
begin
  if uid is null or v_email is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'invalid_name'; end if;
  if char_length(v_message) > 1000 then raise exception 'invalid_message'; end if;

  select * into v_venue from public.venues where id = p_venue_id;
  if not found or not v_venue.for_rent or v_venue.archived then raise exception 'venue_not_found'; end if;
  if v_venue.owner_id = uid then raise exception 'own_venue'; end if;

  if p_starts_at is null or p_starts_at <= now() or p_starts_at > now() + interval '1 year' then
    raise exception 'invalid_start';
  end if;
  if p_hours is null or p_hours < v_venue.min_hours or p_hours > 24 then raise exception 'invalid_length'; end if;
  v_end := p_starts_at + make_interval(hours => p_hours);

  -- Keeps one person from flooding owners with requests.
  if (select count(*) from public.venue_bookings where requester_id = uid and status = 'pending') >= 10
     or (select count(*) from public.venue_bookings where requester_id = uid and created_at > now() - interval '1 day') >= 30
     or (select count(*) from public.venue_bookings
         where requester_id = uid and venue_id = p_venue_id and status = 'pending') >= 3 then
    raise exception 'too_many_requests';
  end if;

  if exists (
    select 1 from public.venue_bookings
    where venue_id = p_venue_id and status = 'approved' and during && tstzrange(p_starts_at, v_end)
  ) then
    raise exception 'venue_unavailable';
  end if;
  -- One open request per person per time slot (also stops double taps).
  if exists (
    select 1 from public.venue_bookings
    where venue_id = p_venue_id and requester_id = uid and status = 'pending' and during && tstzrange(p_starts_at, v_end)
  ) then
    raise exception 'already_requested';
  end if;

  insert into public.venue_bookings (
    venue_id, requester_id, requester_name, requester_email, starts_at, ends_at, message, total
  ) values (
    p_venue_id, uid, v_name, v_email, p_starts_at, v_end, v_message, v_venue.hourly_rate * p_hours
  )
  returning id into v_id;
  return v_id;
end;
$$;

create function public.respond_booking(p_booking_id uuid, p_approve boolean, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.venue_bookings;
  v_reply text := trim(coalesce(p_reply, ''));
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if char_length(v_reply) > 1000 then raise exception 'invalid_message'; end if;

  select * into v_booking from public.venue_bookings where id = p_booking_id for update;
  if not found or not private.owns_venue(v_booking.venue_id) then raise exception 'booking_not_found'; end if;
  if v_booking.status <> 'pending' then raise exception 'booking_not_pending'; end if;

  if not p_approve then
    update public.venue_bookings set status = 'declined', reply = v_reply, decided_at = now() where id = p_booking_id;
    return;
  end if;

  if v_booking.starts_at <= now() then raise exception 'invalid_start'; end if;
  begin
    update public.venue_bookings
    set status = 'approved', reply = v_reply, owner_email = private.my_email(), decided_at = now()
    where id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'venue_unavailable';
  end;

  -- The slot is gone, so overlapping requests are turned down straight away.
  update public.venue_bookings
  set status = 'declined', reply = 'The space was booked by someone else for this time.', decided_at = now()
  where venue_id = v_booking.venue_id and status = 'pending' and id <> p_booking_id
    and during && v_booking.during;
end;
$$;

-- Either side can cancel, unless an upcoming event is already using the booking.
create function public.cancel_booking(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_booking public.venue_bookings;
  v_side text;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  select * into v_booking from public.venue_bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  v_side := case
    when v_booking.requester_id = uid then 'requester'
    when private.owns_venue(v_booking.venue_id) then 'owner'
  end;
  if v_side is null then raise exception 'booking_not_found'; end if;
  if v_booking.status not in ('pending', 'approved') or v_booking.ends_at <= now() then
    raise exception 'booking_not_active';
  end if;
  if exists (
    select 1 from public.events e
    where e.id = v_booking.event_id and e.status <> 'cancelled' and e.ends_at > now()
  ) then
    raise exception 'booking_in_use';
  end if;
  update public.venue_bookings set status = 'cancelled', cancelled_by = v_side, decided_at = now()
  where id = p_booking_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Events at venues
-- ---------------------------------------------------------------------------

-- create_event gains two optional inputs:
--   venueId    a venue the caller owns; its time slot is booked automatically.
--   bookingId  an approved booking the caller holds; the event must fit inside it.
-- With either, the venue's details are used instead of the typed ones.
drop function public.create_event(jsonb);
create function public.create_event(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_id text;
  v_start timestamptz;
  v_end timestamptz;
  v_hours int;
  v_tier jsonb;
  v_pos int := 0;
  v_image text := nullif(p ->> 'imagePath', '');
  v_venue public.venues;
  v_booking public.venue_bookings;
  v_venue_id uuid := nullif(p ->> 'venueId', '')::uuid;
  v_booking_id uuid := nullif(p ->> 'bookingId', '')::uuid;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if (select count(*) from public.events where owner_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_events';
  end if;

  v_start := (p ->> 'startsAt')::timestamptz;
  v_hours := (p ->> 'hours')::int;
  if v_start is null or v_start <= now() or v_start > now() + interval '2 years' then raise exception 'invalid_start'; end if;
  if v_hours is null or v_hours not between 1 and 12 then raise exception 'invalid_length'; end if;
  v_end := v_start + make_interval(hours => v_hours);
  if jsonb_typeof(p -> 'tiers') <> 'array' or jsonb_array_length(p -> 'tiers') not between 1 and 5 then
    raise exception 'invalid_tiers';
  end if;
  -- Uploaded photos must live in the caller's own folder.
  if v_image is not null and split_part(v_image, '/', 1) <> uid::text then raise exception 'invalid_image'; end if;

  if v_booking_id is not null then
    select * into v_booking from public.venue_bookings
    where id = v_booking_id and requester_id = uid and status = 'approved'
    for update;
    if not found then raise exception 'booking_not_found'; end if;
    if v_booking.event_id is not null then raise exception 'booking_in_use'; end if;
    if v_start < v_booking.starts_at or v_end > v_booking.ends_at then raise exception 'outside_booking'; end if;
    select * into v_venue from public.venues where id = v_booking.venue_id;
  elsif v_venue_id is not null then
    select * into v_venue from public.venues where id = v_venue_id and owner_id = uid and not archived;
    if not found then raise exception 'venue_not_found'; end if;
  end if;

  v_id := left(trim(both '-' from regexp_replace(lower(coalesce(p ->> 'title', '')), '[^a-z0-9]+', '-', 'g')), 40);
  v_id := trim(both '-' from v_id) || '-' || encode(extensions.gen_random_bytes(4), 'hex');
  v_id := trim(both '-' from v_id);

  insert into public.events (
    id, owner_id, venue_id, title, category, starts_at, ends_at, venue_name, venue_area, venue_address,
    lat, lng, access, image_path, image_url, organizer_name, description
  ) values (
    v_id, uid, v_venue.id, trim(p ->> 'title'), (p ->> 'category')::public.event_category, v_start, v_end,
    coalesce(v_venue.name, trim(p ->> 'venueName')),
    coalesce(v_venue.area, trim(p ->> 'venueArea')),
    coalesce(v_venue.address, trim(p ->> 'venueAddress')),
    coalesce(v_venue.lat, 4.1755), coalesce(v_venue.lng, 73.5093), -- Malé until venues are geocoded.
    coalesce(nullif(trim(coalesce(p ->> 'access', '')), ''), v_venue.access),
    v_image,
    null, -- no photo: the app draws a sunset cover
    trim(p ->> 'organizerName'), trim(p ->> 'description')
  );

  if v_booking_id is not null then
    update public.venue_bookings set event_id = v_id where id = v_booking_id;
  elsif v_venue.id is not null then
    -- The owner's own event holds the slot like any other booking.
    begin
      insert into public.venue_bookings (
        venue_id, requester_id, requester_name, requester_email, owner_email, starts_at, ends_at,
        status, total, own_use, event_id, decided_at
      ) values (
        v_venue.id, uid, trim(p ->> 'organizerName'), coalesce(private.my_email(), ''), private.my_email(),
        v_start, v_end, 'approved', 0, true, v_id, now()
      );
    exception when exclusion_violation then
      raise exception 'venue_unavailable';
    end;
    update public.venue_bookings
    set status = 'declined', reply = 'The space was booked by someone else for this time.', decided_at = now()
    where venue_id = v_venue.id and status = 'pending' and during && tstzrange(v_start, v_end);
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

  return v_id;
end;
$$;

-- Owners whose spaces are booked by others for upcoming dates must cancel
-- those bookings first, so renters are never left without a venue silently.
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
  -- Keep organisers' sales records but drop the person's details.
  update public.tickets set holder_name = 'Deleted account' where owner_id = uid;
  update public.orders set holder_name = 'Deleted account', email = 'deleted' where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants (default privileges already revoke execute on new functions)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.venue_busy(uuid, timestamptz, timestamptz),
  public.save_venue(jsonb),
  public.archive_venue(uuid),
  public.request_booking(uuid, timestamptz, int, text, text),
  public.respond_booking(uuid, boolean, text),
  public.cancel_booking(uuid),
  public.create_event(jsonb),
  public.delete_account(),
  private.owns_venue(uuid)
from public, anon, authenticated;

grant execute on function public.venue_busy(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function
  public.save_venue(jsonb),
  public.archive_venue(uuid),
  public.request_booking(uuid, timestamptz, int, text, text),
  public.respond_booking(uuid, boolean, text),
  public.cancel_booking(uuid),
  public.create_event(jsonb),
  public.delete_account()
to authenticated;
grant execute on function private.owns_venue(uuid) to authenticated;
