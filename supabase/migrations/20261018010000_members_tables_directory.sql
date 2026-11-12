-- Leaving a membership, table seating, held seats and a browsable list of organisers.
--
--   * Memberships: members can leave at any time. Within 7 days of paying, and
--     before using a member perk (presale or member price), they get their money
--     back. That matches the 7 days the organiser's share waits before it can be
--     withdrawn, so a refund never chases money that's already gone.
--   * Seating: besides rows, a section can be round tables ("Table 4, seat 2"),
--     for galas, weddings and iftars. Organisers can hold seats back (sponsors,
--     wheelchair spaces, family) so they're never sold.
--   * Organisers: a public directory, only of pages with at least one listed
--     event, so empty pages and squatted names don't show up.

-- ---------------------------------------------------------------------------
-- Leaving a membership
-- ---------------------------------------------------------------------------

alter table public.member_passes add column cancelled_at timestamptz;

-- What leaving would mean right now: refund amount (0 if none) and when it ends.
create function private.membership_exit(p_uid uuid, p_organizer_id uuid)
returns table (refund int, payment_id uuid, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with active as (
    select mp.* from public.member_passes mp
    where mp.user_id = p_uid and mp.organizer_id = p_organizer_id and mp.expires_at > now() and mp.cancelled_at is null
  ), latest as (
    select a.*, pay.amount, pay.paid_at, pay.status as pay_status from active a
    left join public.payments pay on pay.id = a.payment_id
    order by a.created_at desc limit 1
  )
  select
    case when l.pay_status = 'paid' and l.paid_at > now() - interval '7 days'
      -- Used a perk: bought from this organiser since joining.
      and not exists (
        select 1 from public.orders o join public.events e on e.id = o.event_id
        where o.user_id = p_uid and e.organizer_id = p_organizer_id and o.created_at >= l.created_at
          and o.status in ('confirmed', 'pending_payment')
      )
      -- Only a first-time join: renewals stacked on older passes don't refund.
      and (select count(*) from active) = 1
    then l.amount else 0 end,
    l.payment_id,
    (select max(a.expires_at) from active a)
  from latest l
$$;

create function public.membership_exit_terms(p_organizer_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  x record;
begin
  if (select auth.uid()) is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  select * into x from private.membership_exit((select auth.uid()), p_organizer_id);
  if not found then raise exception 'not_a_member'; end if;
  return jsonb_build_object('refund', x.refund, 'expiresAt', x.expires_at);
end;
$$;

create function public.cancel_membership(p_organizer_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  x record;
  v_name text;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  -- One at a time per person, so a double tap can't refund twice.
  perform pg_advisory_xact_lock(hashtext('membership:' || uid::text || p_organizer_id::text));
  select * into x from private.membership_exit(uid, p_organizer_id);
  if not found then raise exception 'not_a_member'; end if;

  update public.member_passes set cancelled_at = now(), expires_at = least(expires_at, now())
  where user_id = uid and organizer_id = p_organizer_id and expires_at > now() and cancelled_at is null;

  select m.name into v_name from public.memberships m where m.organizer_id = p_organizer_id;
  if x.refund > 0 then
    perform private.refund_payment(x.payment_id, 'Left the membership within 7 days');
  else
    perform private.notify(uid, 'payment', 'Membership ended',
      coalesce(v_name, 'Your membership') || ' has ended. You can join again any time.', null);
  end if;
  return jsonb_build_object('refund', x.refund);
end;
$$;

-- ---------------------------------------------------------------------------
-- Table seating and held seats
-- ---------------------------------------------------------------------------

-- 'row': row_label is a letter. 'table': row_label is the table number.
alter table public.seats add column kind text not null default 'row' check (kind in ('row', 'table'));

-- Lays out seats for a ticket type that hasn't sold yet. Each section is one of
--   { "section": "Stalls", "rows": 10, "seatsPerRow": 20 }               (rows lettered A, B, C...)
--   { "section": "Garden", "layout": "tables", "tables": 12, "seatsPerTable": 8 }
create or replace function public.save_seating(p_event_id text, p_tier_id uuid, p jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  t public.tiers;
  s jsonb;
  v_groups int;
  v_per int;
  v_pos int := 0;
  v_total int := 0;
  v_tables boolean;
  v_offset int;
begin
  if not private.owns_event(p_event_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into t from public.tiers where id = p_tier_id and event_id = p_event_id for update;
  if not found then raise exception 'invalid_tiers'; end if;
  if t.sold > 0 then raise exception 'tier_has_sales'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between 1 and 8 then raise exception 'invalid_seating'; end if;

  delete from public.seats where tier_id = p_tier_id;
  for s in select * from jsonb_array_elements(p) loop
    v_tables := coalesce(s ->> 'layout', 'rows') = 'tables';
    v_groups := (s ->> case when v_tables then 'tables' else 'rows' end)::int;
    v_per := (s ->> case when v_tables then 'seatsPerTable' else 'seatsPerRow' end)::int;
    if char_length(trim(coalesce(s ->> 'section', ''))) not between 1 and 30 or v_groups is null or v_per is null
       or (not v_tables and (v_groups not between 1 and 26 or v_per not between 1 and 60))
       or (v_tables and (v_groups not between 1 and 200 or v_per not between 2 and 20)) then
      raise exception 'invalid_seating';
    end if;
    -- Table numbers run on across sections of the same event, like a real floor plan.
    v_offset := case when v_tables then coalesce((
      select max(row_label::int) from public.seats where event_id = p_event_id and kind = 'table'), 0) else 0 end;
    for g in 0..v_groups - 1 loop
      for n in 1..v_per loop
        insert into public.seats (event_id, tier_id, section, row_label, number, position, kind)
        values (p_event_id, p_tier_id, trim(s ->> 'section'),
          case when v_tables then (v_offset + g + 1)::text else chr(65 + g) end, n, v_pos,
          case when v_tables then 'table' else 'row' end);
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

-- Holds seats back from sale, or releases them. Held seats don't count
-- towards what can be sold.
create function public.set_seats_held(p_event_id text, p_seat_ids uuid[], p_held boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if not private.owns_event(p_event_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(cardinality(p_seat_ids), 0) not between 1 and 500 then raise exception 'invalid_seats'; end if;
  update public.seats set status = case when p_held then 'blocked' else 'available' end
  where event_id = p_event_id and id = any (p_seat_ids)
    and status = case when p_held then 'available' else 'blocked' end;
  get diagnostics v_n = row_count;
  -- Capacity follows the seats that can actually be sold.
  update public.tiers t set capacity = (select count(*) from public.seats s where s.tier_id = t.id and s.status <> 'blocked')
  where t.event_id = p_event_id and t.seated;
  return v_n;
end;
$$;

-- Tickets for a table seat read "Garden, table 4, seat 2".
create function private.tickets_table_label() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s public.seats;
begin
  if new.seat_id is not null then
    select * into s from public.seats where id = new.seat_id;
    if found and s.kind = 'table' then
      new.seat_label := left(s.section || ', table ' || s.row_label || ', seat ' || s.number, 40);
    end if;
  end if;
  return new;
end;
$$;
create trigger tickets_table_label before insert on public.tickets
for each row execute function private.tickets_table_label();

-- Which seats are free. Never says who holds a taken one. The organiser also
-- sees which seats they've held back.
drop function public.seat_map(text);
create function public.seat_map(p_event_id text)
returns table (id uuid, tier_id uuid, section text, row_label text, seat_number smallint, seat_position int, free boolean, kind text, held boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.tier_id, s.section, s.row_label, s.number, s.position, s.status = 'available', s.kind,
    case when e.owner_id = (select auth.uid()) then s.status = 'blocked' else false end
  from public.seats s join public.events e on e.id = s.event_id
  where s.event_id = p_event_id and (e.listing = 'approved' or e.owner_id = (select auth.uid()))
  order by s.position
$$;

-- ---------------------------------------------------------------------------
-- Organiser directory
-- ---------------------------------------------------------------------------

create function public.browse_organizers(p_query text default null, p_limit int default 60)
returns table (id uuid, slug text, name text, bio text, avatar_path text, banner_path text, verified boolean,
               followers bigint, upcoming bigint, rating numeric)
language sql stable security definer set search_path = '' as $$
  select o.id, o.slug, o.name, o.bio, o.avatar_path, o.banner_path, o.verified,
    (select count(*) from public.follows f where f.organizer_id = o.id),
    (select count(*) from public.events e where e.organizer_id = o.id and e.listing = 'approved'
       and e.status <> 'cancelled' and e.ends_at > now()),
    (select round(avg(r.rating)::numeric, 1) from public.organizer_reviews r where r.organizer_id = o.id)
  from public.organizers o
  where exists (select 1 from public.events e where e.organizer_id = o.id and e.listing = 'approved')
    and (coalesce(trim(p_query), '') = '' or o.name ilike '%' || trim(p_query) || '%' or o.bio ilike '%' || trim(p_query) || '%')
  order by o.verified desc,
    (select count(*) from public.events e where e.organizer_id = o.id and e.listing = 'approved' and e.ends_at > now()) > 0 desc,
    (select count(*) from public.follows f where f.organizer_id = o.id) desc,
    o.name
  limit least(greatest(coalesce(p_limit, 60), 1), 100)
$$;

revoke execute on function public.seat_map(text), public.browse_organizers(text, int),
  public.membership_exit_terms(uuid), public.cancel_membership(uuid), public.set_seats_held(text, uuid[], boolean)
from public, anon, authenticated;
grant execute on function public.seat_map(text), public.browse_organizers(text, int) to anon, authenticated;
grant execute on function public.membership_exit_terms(uuid), public.cancel_membership(uuid), public.set_seats_held(text, uuid[], boolean)
to authenticated;
