-- Organiser pages, synced saves and follows, announcements, editing and
-- cancelling events, promo codes, and space reviews.
--
-- Same model as before: clients read through RLS, every write goes through a
-- SECURITY DEFINER function that checks the caller and validates input.

-- ---------------------------------------------------------------------------
-- Organisers
-- ---------------------------------------------------------------------------

-- The public face of whoever runs events. Owned by an account, so nobody can
-- publish under someone else's organiser page by typing the same name.
create table public.organizers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  name text not null check (char_length(name) between 2 and 80),
  bio text not null default '' check (char_length(bio) <= 1000),
  created_at timestamptz not null default now()
);
create unique index organizers_owner_name_idx on public.organizers (owner_id, lower(name));

alter table public.events add column organizer_id uuid references public.organizers (id) on delete set null;
create index events_organizer_idx on public.events (organizer_id);

-- Finds the caller's organiser with this name, or creates it.
create function private.organizer_for(p_owner uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
  v_slug text;
begin
  select id into v_id from public.organizers where owner_id = p_owner and lower(name) = lower(v_name);
  if found then return v_id; end if;
  -- Accented letters (Hulhumalé) keep their base letter in the address.
  v_slug := translate(lower(v_name), 'áàâäãåéèêëíìîïóòôöõúùûüñç', 'aaaaaaeeeeiiiiooooouuuunc');
  v_slug := left(trim(both '-' from regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g')), 40);
  if char_length(v_slug) < 3 then v_slug := 'organiser'; end if;
  if exists (select 1 from public.organizers where slug = v_slug) then
    v_slug := v_slug || '-' || encode(extensions.gen_random_bytes(3), 'hex');
  end if;
  insert into public.organizers (owner_id, slug, name) values (p_owner, v_slug, v_name) returning id into v_id;
  return v_id;
end;
$$;

-- Every new event is filed under its owner's organiser of that name.
create function private.link_event_organizer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.organizer_id is null and new.owner_id is not null then
    new.organizer_id := private.organizer_for(new.owner_id, new.organizer_name);
  end if;
  return new;
end;
$$;
create trigger events_link_organizer before insert on public.events
for each row execute function private.link_event_organizer();

-- Existing events.
update public.events set organizer_id = private.organizer_for(owner_id, organizer_name)
where owner_id is not null and organizer_id is null;

-- ---------------------------------------------------------------------------
-- Saved events and follows (synced across devices)
-- ---------------------------------------------------------------------------

create table public.saved_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table public.follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, organizer_id)
);
create index follows_organizer_idx on public.follows (organizer_id);

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  kind text not null default 'message' check (kind in ('message', 'rescheduled', 'cancelled')),
  body text not null check (char_length(body) between 2 and 1000),
  created_at timestamptz not null default now()
);
create index announcements_event_idx on public.announcements (event_id, created_at desc);

-- Holds a live ticket for the event (not one they sent on).
create function private.holds_ticket(p_event_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tickets t
    where t.event_id = p_event_id and t.owner_id = (select auth.uid()) and t.transferred_at is null
  )
$$;

-- ---------------------------------------------------------------------------
-- Promo codes
-- ---------------------------------------------------------------------------

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{4,20}$'),
  percent_off integer not null check (percent_off between 1 and 100),
  max_uses integer check (max_uses between 1 and 100000),
  used integer not null default 0 check (used >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (event_id, code),
  check (max_uses is null or used <= max_uses)
);

-- Failed code guesses, to stop people trying codes until one works.
create table private.promo_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index promo_attempts_user_idx on private.promo_attempts (user_id, at);

alter table public.orders
  add column promo_id uuid references public.promo_codes (id) on delete set null,
  add column discount integer not null default 0 check (discount >= 0);

-- ---------------------------------------------------------------------------
-- Space reviews
-- ---------------------------------------------------------------------------

create table public.venue_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.venue_bookings (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 80),
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 1000),
  reply text not null default '' check (char_length(reply) <= 1000),
  created_at timestamptz not null default now(),
  replied_at timestamptz
);
create index venue_reviews_venue_idx on public.venue_reviews (venue_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Read access
-- ---------------------------------------------------------------------------

alter table public.organizers enable row level security;
alter table public.saved_events enable row level security;
alter table public.follows enable row level security;
alter table public.announcements enable row level security;
alter table public.promo_codes enable row level security;
alter table public.venue_reviews enable row level security;
alter table private.promo_attempts enable row level security;

create policy "Organisers are public" on public.organizers
  for select to anon, authenticated using (true);

create policy "Read own saves" on public.saved_events
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Read own follows" on public.follows
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Ticket holders and event staff read announcements" on public.announcements
  for select to authenticated
  using (private.holds_ticket(event_id) or private.is_event_staff(event_id));

create policy "Organisers read their promo codes" on public.promo_codes
  for select to authenticated using (private.owns_event(event_id));

create policy "Reviews of visible spaces are public" on public.venue_reviews
  for select to anon, authenticated
  using (exists (
    select 1 from public.venues v
    where v.id = venue_id and ((v.for_rent and not v.archived) or v.owner_id = (select auth.uid()))
  ));

revoke all on public.organizers, public.saved_events, public.follows, public.announcements,
  public.promo_codes, public.venue_reviews from anon, authenticated;
grant select on public.organizers, public.venue_reviews to anon, authenticated;
grant select on public.saved_events, public.follows, public.announcements, public.promo_codes to authenticated;

-- Follower count and event count for an organiser page.
create function public.organizer_stats(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'followers', (select count(*) from public.follows where organizer_id = p_id),
    'events', (select count(*) from public.events where organizer_id = p_id)
  )
$$;

-- ---------------------------------------------------------------------------
-- Write API
-- ---------------------------------------------------------------------------

create function public.update_organizer(p_id uuid, p_name text, p_bio text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_bio text := trim(coalesce(p_bio, ''));
begin
  if char_length(v_name) not between 2 and 80 then raise exception 'invalid_name'; end if;
  if char_length(v_bio) > 1000 then raise exception 'invalid_message'; end if;
  begin
    update public.organizers set name = v_name, bio = v_bio
    where id = p_id and owner_id = (select auth.uid());
  exception when unique_violation then
    raise exception 'organizer_name_taken';
  end;
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.events set organizer_name = v_name where organizer_id = p_id;
end;
$$;

create function public.set_saved(p_event_id text, p_saved boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if p_saved then
    if (select count(*) from public.saved_events where user_id = uid) >= 500 then raise exception 'too_many_saved'; end if;
    insert into public.saved_events (user_id, event_id)
    select uid, id from public.events where id = p_event_id
    on conflict do nothing;
  else
    delete from public.saved_events where user_id = uid and event_id = p_event_id;
  end if;
end;
$$;

create function public.set_follow(p_organizer_id uuid, p_follow boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if p_follow then
    if (select count(*) from public.follows where user_id = uid) >= 500 then raise exception 'too_many_follows'; end if;
    insert into public.follows (user_id, organizer_id)
    select uid, id from public.organizers where id = p_organizer_id
    on conflict do nothing;
  else
    delete from public.follows where user_id = uid and organizer_id = p_organizer_id;
  end if;
end;
$$;

create function public.post_announcement(p_event_id text, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if not private.owns_event(p_event_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if char_length(v_body) not between 2 and 1000 then raise exception 'invalid_message'; end if;
  if (select count(*) from public.announcements
      where event_id = p_event_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_announcements';
  end if;
  insert into public.announcements (event_id, author_id, body) values (p_event_id, auth.uid(), v_body)
  returning id into v_id;
  return v_id;
end;
$$;

-- Edits a published event. Ticket holders get an announcement when the time
-- changes. Ticket types that have sold keep their price and can't drop below
-- what's sold; unsold ones can be changed or removed.
--   p: { title, category, description, access, startsAt, hours,
--        venueName, venueArea, venueAddress, imagePath,
--        tiers: [{ id?, name, price, capacity }] }
create function public.update_event(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_event public.events;
  v_booking public.venue_bookings;
  v_start timestamptz := (p ->> 'startsAt')::timestamptz;
  v_hours int := (p ->> 'hours')::int;
  v_end timestamptz;
  v_image text := nullif(p ->> 'imagePath', '');
  v_tier jsonb;
  v_existing public.tiers;
  v_keep uuid[] := '{}';
  v_pos int := 0;
  v_moved boolean;
begin
  select * into v_event from public.events where id = p_id and owner_id = uid for update;
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_event.status = 'cancelled' or v_event.ends_at <= now() then raise exception 'event_closed'; end if;

  if v_start is null or v_start <= now() or v_start > now() + interval '2 years' then raise exception 'invalid_start'; end if;
  if v_hours is null or v_hours not between 1 and 12 then raise exception 'invalid_length'; end if;
  v_end := v_start + make_interval(hours => v_hours);
  if v_image is not null and split_part(v_image, '/', 1) <> uid::text then raise exception 'invalid_image'; end if;
  if jsonb_typeof(p -> 'tiers') <> 'array' or jsonb_array_length(p -> 'tiers') not between 1 and 5 then
    raise exception 'invalid_tiers';
  end if;
  v_moved := v_start <> v_event.starts_at or v_end <> v_event.ends_at;

  -- A venue's calendar has to follow the event.
  if v_moved and v_event.venue_id is not null then
    select * into v_booking from public.venue_bookings where event_id = p_id for update;
    if found and v_booking.own_use then
      begin
        update public.venue_bookings set starts_at = v_start, ends_at = v_end where id = v_booking.id;
      exception when exclusion_violation then
        raise exception 'venue_unavailable';
      end;
    elsif found and (v_start < v_booking.starts_at or v_end > v_booking.ends_at) then
      raise exception 'outside_booking';
    end if;
  end if;

  update public.events set
    title = trim(p ->> 'title'),
    category = (p ->> 'category')::public.event_category,
    description = trim(p ->> 'description'),
    access = nullif(trim(coalesce(p ->> 'access', '')), ''),
    starts_at = v_start,
    ends_at = v_end,
    -- Venue details come from the venue when there is one.
    venue_name = case when venue_id is null then trim(p ->> 'venueName') else venue_name end,
    venue_area = case when venue_id is null then trim(p ->> 'venueArea') else venue_area end,
    venue_address = case when venue_id is null then trim(p ->> 'venueAddress') else venue_address end,
    image_path = coalesce(v_image, image_path),
    image_url = case when v_image is not null then null else image_url end,
    status = case when v_moved then 'rescheduled'::public.event_status else status end,
    notice = case when v_moved
      then 'New time: ' || to_char(v_start at time zone 'Indian/Maldives', 'Dy DD Mon, HH24:MI') || '. Your tickets still work.'
      else notice end
  where id = p_id;

  for v_tier in select * from jsonb_array_elements(p -> 'tiers') loop
    if nullif(v_tier ->> 'id', '') is not null then
      select * into v_existing from public.tiers where id = (v_tier ->> 'id')::uuid and event_id = p_id for update;
      if not found then raise exception 'invalid_tiers'; end if;
      if v_existing.sold > 0 and (v_tier ->> 'price')::int <> v_existing.price then raise exception 'tier_price_locked'; end if;
      if (v_tier ->> 'capacity')::int < v_existing.sold then raise exception 'capacity_below_sold'; end if;
      update public.tiers set
        name = trim(v_tier ->> 'name'),
        price = (v_tier ->> 'price')::int,
        capacity = (v_tier ->> 'capacity')::int,
        position = v_pos
      where id = v_existing.id;
      v_keep := v_keep || v_existing.id;
    else
      insert into public.tiers (event_id, position, name, description, price, capacity)
      values (
        p_id, v_pos, trim(v_tier ->> 'name'),
        case when (v_tier ->> 'price')::int = 0 then 'Free entry' else 'Standard ticket' end,
        (v_tier ->> 'price')::int, (v_tier ->> 'capacity')::int
      )
      returning id into v_existing.id;
      v_keep := v_keep || v_existing.id;
    end if;
    v_pos := v_pos + 1;
  end loop;

  if exists (select 1 from public.tiers where event_id = p_id and not (id = any (v_keep)) and sold > 0) then
    raise exception 'tier_has_sales';
  end if;
  delete from public.tiers where event_id = p_id and not (id = any (v_keep));

  if v_moved then
    insert into public.announcements (event_id, author_id, kind, body)
    values (p_id, uid, 'rescheduled',
      'The event has moved to ' || to_char(v_start at time zone 'Indian/Maldives', 'FMDay DD FMMonth, HH24:MI')
      || '. Your tickets still work.');
  end if;
end;
$$;

create function public.cancel_event(p_id text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_event public.events;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  select * into v_event from public.events where id = p_id and owner_id = uid for update;
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_event.status = 'cancelled' or v_event.ends_at <= now() then raise exception 'event_closed'; end if;
  if char_length(v_reason) not between 2 and 500 then raise exception 'invalid_message'; end if;

  update public.events set status = 'cancelled', notice = v_reason where id = p_id;
  insert into public.announcements (event_id, author_id, kind, body) values (p_id, uid, 'cancelled', v_reason);

  -- Free the venue: the owner's own slot is released; a renter keeps their
  -- booking and can put another event in it.
  update public.venue_bookings set status = 'cancelled', cancelled_by = 'owner', decided_at = now()
  where event_id = p_id and own_use;
  update public.venue_bookings set event_id = null where event_id = p_id and not own_use;
end;
$$;

create function public.create_promo(p_event_id text, p_code text, p_percent int, p_max_uses int default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));
  v_id uuid;
begin
  if not private.owns_event(p_event_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_code !~ '^[A-Z0-9]{4,20}$' then raise exception 'invalid_code'; end if;
  if p_percent is null or p_percent not between 1 and 100 then raise exception 'invalid_percent'; end if;
  if p_max_uses is not null and p_max_uses not between 1 and 100000 then raise exception 'invalid_uses'; end if;
  if (select count(*) from public.promo_codes where event_id = p_event_id) >= 50 then raise exception 'too_many_codes'; end if;
  begin
    insert into public.promo_codes (event_id, code, percent_off, max_uses)
    values (p_event_id, v_code, p_percent, p_max_uses)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'code_taken';
  end;
  return v_id;
end;
$$;

create function public.set_promo_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.promo_codes set active = p_active
  where id = p_id and private.owns_event(event_id);
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
end;
$$;

-- Looks up a code for checkout. Wrong guesses are counted, and after 20 in an
-- hour the caller has to wait.
create function private.find_promo(p_event_id text, p_code text) returns public.promo_codes
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_promo public.promo_codes;
begin
  if (select count(*) from private.promo_attempts where user_id = uid and at > now() - interval '1 hour') >= 20 then
    raise exception 'too_many_attempts';
  end if;
  select * into v_promo from public.promo_codes
  where event_id = p_event_id and code = upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));
  if not found or not v_promo.active or (v_promo.max_uses is not null and v_promo.used >= v_promo.max_uses) then
    insert into private.promo_attempts (user_id) values (uid);
    return null;
  end if;
  return v_promo;
end;
$$;

create function public.check_promo(p_event_id text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_promo public.promo_codes;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  v_promo := private.find_promo(p_event_id, p_code);
  if v_promo.id is null then return jsonb_build_object('valid', false); end if;
  return jsonb_build_object('valid', true, 'code', v_promo.code, 'percentOff', v_promo.percent_off);
end;
$$;

-- purchase gains an optional promo code. A 100% code makes paid tickets free,
-- which works even before payments are switched on (guest lists).
drop function public.purchase(text, jsonb, text);
create function public.purchase(p_event_id text, p_lines jsonb, p_holder_name text, p_promo text default null)
returns uuid
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
  v_discount int := 0;
  v_promo public.promo_codes;
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

  if nullif(trim(coalesce(p_promo, '')), '') is not null then
    v_promo := private.find_promo(p_event_id, p_promo);
    if v_promo.id is null then raise exception 'invalid_promo'; end if;
    -- Lock the code so its last use can't be spent twice.
    select * into v_promo from public.promo_codes where id = v_promo.id for update;
    if not v_promo.active or (v_promo.max_uses is not null and v_promo.used >= v_promo.max_uses) then
      raise exception 'invalid_promo';
    end if;
    v_discount := round(v_total * v_promo.percent_off / 100.0)::int;
    update public.promo_codes set used = used + 1 where id = v_promo.id;
  end if;

  if v_total - v_discount > 0 and not (select allow_unpaid_orders from private.settings) then
    raise exception 'payment_required';
  end if;

  insert into public.orders (user_id, event_id, holder_name, email, total, status, promo_id, discount)
  values (uid, p_event_id, v_name, v_email, v_total - v_discount, 'confirmed', v_promo.id, v_discount)
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

-- Organisers review a space once their booking is over; the owner can reply.
create function public.review_booking(p_booking_id uuid, p_rating int, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.venue_bookings;
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  select * into v_booking from public.venue_bookings
  where id = p_booking_id and requester_id = (select auth.uid());
  if not found or v_booking.own_use then raise exception 'booking_not_found'; end if;
  if v_booking.status <> 'approved' or v_booking.ends_at > now() then raise exception 'review_not_open'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'invalid_rating'; end if;
  if char_length(v_body) > 1000 then raise exception 'invalid_message'; end if;
  begin
    insert into public.venue_reviews (booking_id, venue_id, author_id, author_name, rating, body)
    values (v_booking.id, v_booking.venue_id, auth.uid(), v_booking.requester_name, p_rating, v_body)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_reviewed';
  end;
  return v_id;
end;
$$;

create function public.reply_review(p_review_id uuid, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_reply text := trim(coalesce(p_reply, ''));
begin
  if char_length(v_reply) not between 2 and 1000 then raise exception 'invalid_message'; end if;
  update public.venue_reviews r set reply = v_reply, replied_at = now()
  where r.id = p_review_id and private.owns_venue(r.venue_id);
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function
  public.venue_busy(uuid, timestamptz, timestamptz),
  public.organizer_stats(uuid)
to anon, authenticated;

grant execute on function
  public.create_event(jsonb),
  public.purchase(text, jsonb, text, text),
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
  public.reply_review(uuid, text)
to authenticated;

-- Used inside RLS policies, which run as the caller.
grant execute on function
  private.owns_event(text), private.is_event_staff(text), private.my_email(),
  private.owns_venue(uuid), private.holds_ticket(text)
to authenticated;

-- What each of the caller's events actually took, after promo codes. Organisers
-- get totals only, never other people's orders.
create function public.my_event_revenue()
returns table (event_id text, revenue bigint, discounts bigint)
language sql stable security definer set search_path = '' as $$
  select o.event_id, sum(o.total)::bigint, sum(o.discount)::bigint
  from public.orders o
  join public.events e on e.id = o.event_id
  where e.owner_id = (select auth.uid()) and o.status = 'confirmed'
  group by o.event_id
$$;
revoke execute on function public.my_event_revenue() from public, anon, authenticated;
grant execute on function public.my_event_revenue() to authenticated;
