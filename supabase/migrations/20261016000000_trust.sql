-- Trust and safety.
--
--   * Admins (private.admins) review people, spaces and listings.
--   * Identity verification: a one-time check of who someone is (ID or
--     business registration, phone). Verified people can sell.
--   * Venue verification: proof the person may rent the space out, plus an
--     on-site location check that also pins the space on the map. Spaces are
--     only listed for rent once verified, and lose it if the address changes.
--   * Listings: anyone can draft an event. Drafts from unverified people wait
--     for verification; listings from verified people wait for review; people
--     with a clean track record (trusted) publish straight away and are spot
--     checked. Nothing unapproved is visible to the public or can be bought.
--   * Reports: anyone signed in can report an event, space or organiser.
--     Several scam reports freeze the organiser's payouts automatically.
--   * Notifications: an in-app inbox for decisions, payments and waitlists.
--
-- Same security model as before: clients read through RLS and write only
-- through SECURITY DEFINER functions that check the caller.

-- ---------------------------------------------------------------------------
-- Admins and account state
-- ---------------------------------------------------------------------------

create table private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table private.admins enable row level security;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admins where user_id = (select auth.uid()))
$$;

alter table public.profiles
  add column verified_at timestamptz,
  add column suspended_at timestamptz,
  add column pro_until timestamptz;

-- Verified badge on organiser pages, kept in step with the owner's profile.
alter table public.organizers add column verified boolean not null default false;

create function private.organizer_inherit_verified() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.verified := exists (select 1 from public.profiles p where p.id = new.owner_id and p.verified_at is not null);
  return new;
end;
$$;
create trigger organizers_inherit_verified before insert on public.organizers
for each row execute function private.organizer_inherit_verified();

-- ---------------------------------------------------------------------------
-- Listing review for events
-- ---------------------------------------------------------------------------

create type public.listing_status as enum ('draft', 'pending', 'approved', 'rejected');

-- Existing events stay approved. New events get their status from the
-- trigger below, which runs for every insert made on behalf of a person.
alter table public.events
  add column listing public.listing_status not null default 'approved',
  add column review_note text check (char_length(review_note) <= 500),
  add column reviewed_at timestamptz,
  add column auto_approved boolean not null default false,
  -- A non-trusted organiser changed the title, description or photo after approval.
  add column edited_after_review boolean not null default false,
  -- Reports or an admin froze the money for this event.
  add column payout_hold boolean not null default false;
create index events_listing_idx on public.events (listing) where listing <> 'approved';
create index events_review_idx on public.events (created_at) where edited_after_review or auto_approved;

create function private.events_set_listing() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_profile public.profiles;
begin
  -- Server-side inserts (seed data, admin tools) set the status themselves.
  if uid is null or new.owner_id is distinct from uid then return new; end if;
  select * into v_profile from public.profiles where id = uid;
  if v_profile.suspended_at is not null then raise exception 'account_suspended'; end if;
  if v_profile.verified_at is null then
    -- Unverified people can keep a few drafts, not an unlimited queue.
    if (select count(*) from public.events where owner_id = uid and listing = 'draft' and ends_at > now()) >= 3 then
      raise exception 'too_many_drafts';
    end if;
    new.listing := 'draft';
  elsif private.is_trusted(uid) then
    new.listing := 'approved';
    new.auto_approved := true;
    new.reviewed_at := now();
  else
    new.listing := 'pending';
  end if;
  return new;
end;
$$;
create trigger events_set_listing before insert on public.events
for each row execute function private.events_set_listing();

-- Edits by the organiser: a rejected listing goes back for review; an approved
-- listing from someone not yet trusted is flagged for a second look when what
-- buyers see changes (stays live, so ticket holders aren't affected).
create function private.events_on_owner_edit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or uid is distinct from old.owner_id or private.is_admin() then return new; end if;
  if (new.title, new.description, new.image_path) is distinct from (old.title, old.description, old.image_path) then
    if old.listing = 'rejected' then
      new.listing := 'pending';
      new.review_note := null;
    elsif old.listing = 'approved' and not private.is_trusted(uid) then
      new.edited_after_review := true;
    end if;
  end if;
  return new;
end;
$$;
create trigger events_on_owner_edit before update on public.events
for each row execute function private.events_on_owner_edit();

-- ---------------------------------------------------------------------------
-- Venue verification state
-- ---------------------------------------------------------------------------

alter table public.venues add column verified_at timestamptz;
-- Existing sample spaces were listed before verification existed.
update public.venues set verified_at = now() where for_rent;

-- Moving or renaming a space needs a fresh check.
create function private.venues_reset_verification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not private.is_admin()
     and (new.name, new.area, new.address) is distinct from (old.name, old.area, old.address) then
    new.verified_at := null;
  end if;
  return new;
end;
$$;
create trigger venues_reset_verification before update on public.venues
for each row execute function private.venues_reset_verification();

-- ---------------------------------------------------------------------------
-- Verifications
-- ---------------------------------------------------------------------------

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('identity', 'venue')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  legal_name text not null check (char_length(legal_name) between 2 and 120),
  phone text check (phone ~ '^\+?[0-9 ]{7,16}$'),
  id_kind text check (id_kind in ('national_id', 'passport', 'business')),
  id_number text check (char_length(id_number) between 4 and 40),
  business_name text check (char_length(business_name) between 2 and 120),
  -- Files in the private verification-docs bucket, inside the person's folder.
  document_path text check (document_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'),
  selfie_path text check (selfie_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'),
  -- Venue checks: which space, proof of the right to rent it, and where the
  -- person stood when they submitted (the space's real location).
  venue_id uuid references public.venues (id) on delete cascade,
  proof_path text check (proof_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  note text not null default '' check (char_length(note) <= 1000),
  review_note text not null default '' check (char_length(review_note) <= 1000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (kind <> 'identity' or (id_kind is not null and id_number is not null and document_path is not null and phone is not null)),
  check (kind <> 'venue' or (venue_id is not null and proof_path is not null))
);
create index verifications_user_idx on public.verifications (user_id, created_at desc);
create index verifications_pending_idx on public.verifications (created_at) where status = 'pending';
create unique index verifications_one_pending_identity on public.verifications (user_id) where status = 'pending' and kind = 'identity';
create unique index verifications_one_pending_venue on public.verifications (venue_id) where status = 'pending' and kind = 'venue';

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id) on delete set null,
  target_kind text not null check (target_kind in ('event', 'venue', 'organizer')),
  target_id text not null check (char_length(target_id) <= 80),
  -- Whose listing it is, so trust and payouts can follow the person.
  subject_id uuid references auth.users (id) on delete set null,
  reason text not null check (reason in ('scam', 'fake', 'wrong_info', 'unsafe', 'offensive', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'upheld', 'dismissed')),
  resolution_note text not null default '' check (char_length(resolution_note) <= 1000),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_open_idx on public.reports (created_at) where status = 'open';
create index reports_target_idx on public.reports (target_kind, target_id);
create unique index reports_one_open_per_person on public.reports (reporter_id, target_kind, target_id) where status = 'open';

-- Has run at least 3 approved events that finished without being cancelled,
-- and has no upheld reports in the last 6 months.
create function private.is_trusted(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.verified_at is not null and p.suspended_at is null
      and (select count(*) from public.events e
           where e.owner_id = p_uid and e.listing = 'approved' and e.status <> 'cancelled' and e.ends_at < now()) >= 3
      and not exists (
        select 1 from public.reports r
        where r.subject_id = p_uid and r.status = 'upheld' and r.resolved_at > now() - interval '180 days'
      )
    from public.profiles p where p.id = p_uid
  ), false)
$$;

-- ---------------------------------------------------------------------------
-- Notifications (in-app inbox)
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (char_length(kind) <= 40),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 500),
  -- An in-app path, e.g. /event/abc or /wallet.
  link text check (link ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create function private.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select p_user, p_kind, left(p_title, 120), left(coalesce(p_body, ''), 500), p_link
  where p_user is not null
$$;

-- ---------------------------------------------------------------------------
-- Read access
-- ---------------------------------------------------------------------------

alter table public.verifications enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;

-- Events: the public sees approved listings; owners and admins see the rest.
-- Anonymous visitors can't call private helpers, so they get their own policy.
drop policy "Events are public" on public.events;
create policy "Approved events are public" on public.events
  for select to anon using (listing = 'approved');
create policy "Approved, own, or admin events" on public.events
  for select to authenticated
  using (listing = 'approved' or owner_id = (select auth.uid()) or private.is_admin());

-- Tiers follow their event.
drop policy "Tiers are public" on public.tiers;
create policy "Tiers of visible events" on public.tiers
  for select to anon, authenticated
  using (exists (select 1 from public.events e where e.id = event_id));

-- Spaces are listed for rent only once verified.
drop policy "Rentable venues are public" on public.venues;
create policy "Verified rentable venues are public" on public.venues
  for select to anon
  using (for_rent and not archived and verified_at is not null);
create policy "Rentable, own, or admin venues" on public.venues
  for select to authenticated
  using ((for_rent and not archived and verified_at is not null) or owner_id = (select auth.uid()) or private.is_admin());

drop policy "Reviews of visible spaces are public" on public.venue_reviews;
create policy "Reviews of visible spaces are public" on public.venue_reviews
  for select to anon, authenticated
  using (exists (select 1 from public.venues v where v.id = venue_id));

create policy "Admins read profiles" on public.profiles
  for select to authenticated using (private.is_admin());

create policy "Own or admin verifications" on public.verifications
  for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());

create policy "Own or admin reports" on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()) or private.is_admin());

create policy "Own notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.verifications, public.reports, public.notifications from anon, authenticated;
grant select on public.verifications, public.reports, public.notifications to authenticated;

-- Taken slots only for spaces the caller can see.
create or replace function public.venue_busy(p_venue_id uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.starts_at, b.ends_at
  from public.venue_bookings b
  join public.venues v on v.id = b.venue_id
  where b.venue_id = p_venue_id
    and b.status = 'approved'
    and b.ends_at > p_from and b.starts_at < least(p_to, p_from + interval '1 year')
    and ((v.for_rent and not v.archived and v.verified_at is not null) or v.owner_id = (select auth.uid()))
  order by b.starts_at
  limit 500
$$;

-- Booking requests go only to verified spaces.
create function private.bookings_require_verified() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.own_use and not exists (select 1 from public.venues where id = new.venue_id and verified_at is not null) then
    raise exception 'venue_not_found';
  end if;
  return new;
end;
$$;
create trigger bookings_require_verified before insert on public.venue_bookings
for each row execute function private.bookings_require_verified();

-- ---------------------------------------------------------------------------
-- Storage: verification documents (private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-docs', 'verification-docs', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "Upload verification docs to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Read own verification docs, admins read all" on storage.objects
  for select to authenticated
  using (bucket_id = 'verification-docs' and ((storage.foldername(name))[1] = (select auth.uid())::text or private.is_admin()));

-- ---------------------------------------------------------------------------
-- Write API: people
-- ---------------------------------------------------------------------------

-- Everything the app needs to know about the caller's standing.
create function public.my_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'admin', private.is_admin(),
    'verified', p.verified_at is not null,
    'trusted', private.is_trusted(p.id),
    'suspended', p.suspended_at is not null,
    'proUntil', p.pro_until,
    'verification', (
      select jsonb_build_object('id', v.id, 'status', v.status, 'reviewNote', v.review_note, 'createdAt', v.created_at)
      from public.verifications v where v.user_id = p.id and v.kind = 'identity'
      order by v.created_at desc limit 1
    ),
    'unread', (select count(*) from public.notifications n where n.user_id = p.id and n.read_at is null)
  )
  from public.profiles p where p.id = (select auth.uid())
$$;

-- p: { legalName, phone, idKind, idNumber, businessName?, documentPath, selfiePath?, note? }
create function public.submit_identity_verification(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_doc text := nullif(p ->> 'documentPath', '');
  v_selfie text := nullif(p ->> 'selfiePath', '');
begin
  if uid is null or private.my_email() is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = uid and suspended_at is not null) then raise exception 'account_suspended'; end if;
  if exists (select 1 from public.profiles where id = uid and verified_at is not null) then raise exception 'already_verified'; end if;
  if exists (select 1 from public.verifications where user_id = uid and kind = 'identity' and status = 'pending') then
    raise exception 'verification_pending';
  end if;
  if (select count(*) from public.verifications where user_id = uid and created_at > now() - interval '30 days') >= 5 then
    raise exception 'too_many_requests';
  end if;
  if v_doc is null or split_part(v_doc, '/', 1) <> uid::text
     or (v_selfie is not null and split_part(v_selfie, '/', 1) <> uid::text) then
    raise exception 'invalid_document';
  end if;
  if coalesce(p ->> 'idKind', '') not in ('national_id', 'passport', 'business') then raise exception 'invalid_id'; end if;
  if (p ->> 'idKind') = 'business' and char_length(trim(coalesce(p ->> 'businessName', ''))) < 2 then
    raise exception 'invalid_business';
  end if;

  begin
    insert into public.verifications (
      user_id, kind, legal_name, phone, id_kind, id_number, business_name, document_path, selfie_path, note
    ) values (
      uid, 'identity', trim(p ->> 'legalName'), regexp_replace(trim(coalesce(p ->> 'phone', '')), '\s+', ' ', 'g'),
      p ->> 'idKind', upper(trim(coalesce(p ->> 'idNumber', ''))), nullif(trim(coalesce(p ->> 'businessName', '')), ''),
      v_doc, v_selfie, trim(coalesce(p ->> 'note', ''))
    ) returning id into v_id;
  exception when check_violation then
    raise exception 'invalid_verification';
  end;
  return v_id;
end;
$$;

-- p: { venueId, proofPath, lat?, lng?, note? }
create function public.submit_venue_verification(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_venue public.venues;
  v_proof text := nullif(p ->> 'proofPath', '');
  v_id uuid;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = uid and verified_at is not null and suspended_at is null) then
    raise exception 'not_verified';
  end if;
  select * into v_venue from public.venues where id = (p ->> 'venueId')::uuid and owner_id = uid and not archived;
  if not found then raise exception 'venue_not_found'; end if;
  if v_venue.verified_at is not null then raise exception 'already_verified'; end if;
  if exists (select 1 from public.verifications where venue_id = v_venue.id and status = 'pending') then
    raise exception 'verification_pending';
  end if;
  if v_proof is null or split_part(v_proof, '/', 1) <> uid::text then raise exception 'invalid_document'; end if;
  if (select count(*) from public.verifications where user_id = uid and created_at > now() - interval '30 days') >= 10 then
    raise exception 'too_many_requests';
  end if;

  insert into public.verifications (user_id, kind, legal_name, venue_id, proof_path, lat, lng, note)
  select uid, 'venue', v.legal_name, v_venue.id, v_proof,
    (p ->> 'lat')::double precision, (p ->> 'lng')::double precision, trim(coalesce(p ->> 'note', ''))
  from public.verifications v
  where v.user_id = uid and v.kind = 'identity' and v.status = 'approved'
  order by v.created_at desc limit 1
  returning id into v_id;
  return v_id;
end;
$$;

create function public.report(p_kind text, p_id text, p_reason text, p_details text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_subject uuid;
  v_details text := trim(coalesce(p_details, ''));
  v_id uuid;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if char_length(v_details) > 1000 then raise exception 'invalid_message'; end if;
  if coalesce(p_reason, '') not in ('scam', 'fake', 'wrong_info', 'unsafe', 'offensive', 'other') then raise exception 'invalid_reason'; end if;
  if (select count(*) from public.reports where reporter_id = uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many_requests';
  end if;

  v_subject := case p_kind
    when 'event' then (select owner_id from public.events where id = p_id and listing = 'approved')
    when 'venue' then (select owner_id from public.venues where id::text = p_id)
    when 'organizer' then (select owner_id from public.organizers where id::text = p_id)
  end;
  if v_subject is null then raise exception 'not_found'; end if;
  if v_subject = uid then raise exception 'not_allowed' using errcode = '42501'; end if;

  begin
    insert into public.reports (reporter_id, target_kind, target_id, subject_id, reason, details)
    values (uid, p_kind, p_id, v_subject, p_reason, v_details)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_reported';
  end;

  -- Three different people saying "scam" or "fake" freezes the event's money
  -- until an admin looks.
  if p_kind = 'event' and (
    select count(distinct reporter_id) from public.reports
    where target_kind = 'event' and target_id = p_id and status = 'open' and reason in ('scam', 'fake')
  ) >= 3 then
    update public.events set payout_hold = true where id = p_id;
  end if;
  return v_id;
end;
$$;

create function public.mark_notifications_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any (p_ids))
$$;

-- ---------------------------------------------------------------------------
-- Admin API
-- ---------------------------------------------------------------------------

create function private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
end;
$$;

create function public.admin_review_verification(p_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.verifications;
  v_note text := trim(coalesce(p_note, ''));
begin
  perform private.require_admin();
  if not p_approve and char_length(v_note) < 2 then raise exception 'note_required'; end if;
  select * into v from public.verifications where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v.status <> 'pending' then raise exception 'already_decided'; end if;

  update public.verifications
  set status = case when p_approve then 'approved' else 'rejected' end,
      review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_id;

  if not p_approve then
    perform private.notify(v.user_id, 'verification', 'Verification not approved',
      v_note, case v.kind when 'identity' then '/verify' else '/verify/space/' || v.venue_id end);
    return;
  end if;

  if v.kind = 'identity' then
    update public.profiles set verified_at = now() where id = v.user_id;
    update public.organizers set verified = true where owner_id = v.user_id;
    -- Drafts made before verification now go to review.
    update public.events set listing = 'pending' where owner_id = v.user_id and listing = 'draft' and ends_at > now();
    perform private.notify(v.user_id, 'verification', 'You’re verified',
      'You can now publish events and get paid. Your drafts have gone to review.', '/organiser');
  else
    update public.venues set verified_at = now(),
      lat = coalesce(v.lat, lat), lng = coalesce(v.lng, lng)
    where id = v.venue_id;
    perform private.notify(v.user_id, 'verification', 'Your space is verified',
      'It can now be listed for rent under Find a space.', '/venues/' || v.venue_id);
  end if;
end;
$$;

create function public.admin_review_event(p_id text, p_approve boolean, p_note text) returns void
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
    review_note = nullif(v_note, ''), reviewed_at = now(), edited_after_review = false, auto_approved = false
  where id = p_id;

  if p_approve and v.listing <> 'approved' then
    perform private.notify(v.owner_id, 'listing', 'Your event is live', v.title || ' is now on Explore.', '/organiser/' || p_id);
  elsif not p_approve then
    perform private.notify(v.owner_id, 'listing', 'Changes needed', v.title || ': ' || v_note, '/organiser/' || p_id);
  end if;
end;
$$;

create function public.admin_resolve_report(p_id uuid, p_upheld boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.reports;
begin
  perform private.require_admin();
  select * into r from public.reports where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if r.status <> 'open' then raise exception 'already_decided'; end if;
  update public.reports
  set status = case when p_upheld then 'upheld' else 'dismissed' end,
      resolution_note = trim(coalesce(p_note, '')), resolved_by = auth.uid(), resolved_at = now()
  where id = p_id;
  -- Dismissing the last scam report on an event releases its money.
  if not p_upheld and r.target_kind = 'event' and not exists (
    select 1 from public.reports
    where target_kind = 'event' and target_id = r.target_id and status in ('open', 'upheld') and reason in ('scam', 'fake')
  ) then
    update public.events set payout_hold = false where id = r.target_id;
  end if;
end;
$$;

create function public.admin_set_payout_hold(p_event_id text, p_hold boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.events set payout_hold = p_hold where id = p_event_id;
  if not found then raise exception 'not_found'; end if;
end;
$$;

-- Suspending someone stops them publishing or selling, rejects what they
-- have waiting, and freezes the money from their upcoming events.
create function public.admin_suspend(p_user uuid, p_suspend boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_user = auth.uid() then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.profiles set suspended_at = case when p_suspend then now() end where id = p_user;
  if not found then raise exception 'not_found'; end if;
  if p_suspend then
    update public.events set listing = 'rejected', review_note = left(coalesce(nullif(trim(p_note), ''), 'Account suspended.'), 500)
    where owner_id = p_user and listing in ('draft', 'pending');
    update public.events set payout_hold = true where owner_id = p_user and ends_at > now() - interval '30 days';
    update public.venues set for_rent = false where owner_id = p_user;
  end if;
end;
$$;

-- Who is behind a listing, for review screens.
create function public.admin_user(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return (
    select jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'name', p.display_name,
      'joinedAt', u.created_at,
      'verified', p.verified_at is not null,
      'trusted', private.is_trusted(u.id),
      'suspended', p.suspended_at is not null,
      'events', (select count(*) from public.events where owner_id = u.id),
      'upheldReports', (select count(*) from public.reports where subject_id = u.id and status = 'upheld'),
      'openReports', (select count(*) from public.reports where subject_id = u.id and status = 'open'),
      'legalName', (select legal_name from public.verifications
                    where user_id = u.id and kind = 'identity' and status = 'approved' order by created_at desc limit 1)
    )
    from auth.users u join public.profiles p on p.id = u.id
    where u.id = p_user
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
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
  public.admin_user(uuid)
to authenticated;
-- Used inside RLS policies, which run as the caller.
grant execute on function
  private.owns_event(text), private.is_event_staff(text), private.my_email(),
  private.owns_venue(uuid), private.holds_ticket(text), private.is_admin()
to authenticated;
