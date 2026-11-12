// Every read and write against the backend. Screens go through the store,
// which calls these.
import type { EventItem } from '@/data/events';
import type { CheckInResult, Ticket } from '@/data/tickets';
import { averageRating, type Announcement, type Organizer, type Promo, type Review } from '@/data/community';
import type { Booking, BusySlot, Venue } from '@/data/venues';
import type { Database } from './database.types';
import { toCurrency, type Currency } from './format';
import { IMAGE_BUCKET, PROFILE_BUCKET, supabase } from './supabase';

type EventRow = Database['public']['Tables']['events']['Row'] & {
  tiers: Database['public']['Tables']['tiers']['Row'][];
  organizer?: { slug: string; verified: boolean; avatar_path: string | null } | null;
};
type OrganizerRow = Database['public']['Tables']['organizers']['Row'];
type ReviewRow = Database['public']['Tables']['venue_reviews']['Row'];
type TicketRow = Database['public']['Tables']['tickets']['Row'];
type VenueRow = Database['public']['Tables']['venues']['Row'];
type BookingRow = Database['public']['Tables']['venue_bookings']['Row'] & {
  venue: Pick<VenueRow, 'name' | 'area' | 'image_url' | 'image_path' | 'owner_id'> | null;
};

// Error codes raised by the database functions, in words people can act on.
const messages: Record<string, string> = {
  not_signed_in: 'Sign in to continue.',
  invalid_name: 'Enter a name between 2 and 80 characters.',
  invalid_email: 'Enter a valid email address.',
  event_not_found: 'This event no longer exists.',
  event_closed: 'This event has ended or was cancelled.',
  invalid_lines: 'Choose between 1 and 8 tickets.',
  limit_reached: 'You already hold the most tickets one person can have for this event.',
  sold_out: 'Those tickets just sold out. Pick another ticket type or a smaller number.',
  payment_required: 'Paid tickets open once card payments are switched on. Free events work now.',
  ticket_not_found: 'That ticket isn’t in your account.',
  ticket_not_active: 'This ticket has already been used, sent or refunded.',
  cannot_send_to_self: 'That’s your own email. Enter your friend’s email.',
  too_many_events: 'You’ve created a lot of events today. Try again tomorrow.',
  invalid_start: 'Pick a start time in the future.',
  invalid_length: 'Events can run from 1 to 12 hours.',
  invalid_tiers: 'Add between 1 and 5 ticket types.',
  invalid_image: 'That photo couldn’t be used. Choose another one.',
  has_upcoming_events: 'You have upcoming events. Cancel or finish them before deleting your account.',
  not_allowed: 'Only the event’s organiser can do that.',
  too_many_staff: 'An event can have up to 50 door staff.',
  invalid_rate: 'Set an hourly price to rent out this space.',
  invalid_amenities: 'Choose up to 12 features.',
  too_many_venues: 'You can list up to 20 venues.',
  venue_not_found: 'This space isn’t available any more.',
  own_venue: 'This is your space. Create an event there directly.',
  already_requested: 'You already asked for this time. Wait for the owner’s reply.',
  too_many_requests: 'You have a lot of requests waiting. Wait for replies, or cancel some first.',
  venue_unavailable: 'That time is already booked. Pick another time.',
  venue_not_verified: 'This space needs to be verified before it can be rented out.',
  invalid_message: 'Keep the message under 1,000 characters.',
  booking_not_found: 'That booking isn’t available.',
  booking_not_pending: 'This request has already been answered.',
  booking_not_active: 'This booking is already over or cancelled.',
  booking_in_use: 'An event is using this booking. Cancel the event first.',
  outside_booking: 'The event has to fit inside your booked time.',
  organizer_name_taken: 'You already have an organiser page with that name.',
  too_many_saved: 'You’ve saved a lot of events. Remove some first.',
  too_many_follows: 'You’re following a lot of organisers. Unfollow some first.',
  too_many_announcements: 'That’s a lot of announcements for one day. Try again tomorrow.',
  tier_price_locked: 'Tickets of that type have sold, so its price can’t change.',
  capacity_below_sold: 'You can’t offer fewer tickets than you’ve already sold.',
  tier_has_sales: 'A ticket type that has sold can’t be removed.',
  invalid_code: 'Codes are 4 to 20 letters or numbers.',
  invalid_percent: 'Choose a discount from 1 to 100%.',
  invalid_uses: 'Enter how many times it can be used, or leave it empty.',
  too_many_codes: 'An event can have up to 50 codes.',
  code_taken: 'That code already exists for this event.',
  invalid_promo: 'That code doesn’t work for this event, or it’s been used up.',
  too_many_attempts: 'Too many wrong codes. Try again in an hour.',
  review_not_open: 'You can review a space once your booking is over.',
  invalid_rating: 'Choose from 1 to 5 stars.',
  already_reviewed: 'You’ve already reviewed this booking.',
  has_upcoming_bookings: 'People have upcoming bookings at your spaces. Cancel those before deleting your account.',
  account_suspended: 'This account is suspended. Contact support@eventspace.mv.',
  too_many_drafts: 'You have 3 drafts waiting. Get verified so they can go to review, then create more.',
  already_verified: 'You’re already verified.',
  verification_pending: 'Your verification is already with our team. We’ll let you know soon.',
  invalid_document: 'That document didn’t upload properly. Add it again.',
  invalid_id: 'Choose the kind of ID you’re sending.',
  invalid_business: 'Enter the registered business name.',
  invalid_verification: 'Some details aren’t valid. Check the phone number and ID number.',
  not_verified: 'Verify your identity first. It takes a few minutes.',
  invalid_reason: 'Choose a reason.',
  not_found: 'That isn’t available any more.',
  already_reported: 'You’ve already reported this. Our team is looking at it.',
  note_required: 'Add a short note explaining the decision.',
  already_decided: 'Someone has already dealt with this.',
  payment_not_found: 'That payment isn’t in your account.',
  payment_not_pending: 'This payment is already finished or expired.',
  method_unavailable: 'That way to pay isn’t available for this.',
  transfer_too_late: 'It’s too close to the event for a bank transfer to clear. Pay by card instead.',
  too_many_pending: 'You have unpaid checkouts open. Finish or cancel them first.',
  invalid_addons: 'Check the extras you picked.',
  addon_sold_out: 'One of the extras just sold out. Pick fewer or remove it.',
  invalid_fee_mode: 'Choose who pays the booking fee.',
  invalid_currency: 'Choose MVR or USD.',
  currency_locked: 'Tickets have already been sold in this currency, so it can’t change now.',
  no_usd_account: 'Add your USD account number in payout details to withdraw dollars.',
  invalid_usd_account: 'Check the USD account number. It should be 7 to 20 digits and different from your MVR account.',
  pro_required: 'That’s an Organiser Pro feature.',
  ticket_listed: 'This ticket is on resale. Take it off resale first.',
  not_resellable: 'Free tickets can’t be resold. Send it to a friend instead.',
  resale_price_cap: 'Resale prices can be at most 10% over the original price.',
  resale_not_active: 'Someone else got there first. That resale ticket is gone.',
  not_approved: 'You can promote an event once it’s approved and live.',
  invalid_days: 'Choose 1 to 14 days.',
  invalid_plan: 'Choose monthly or yearly.',
  invalid_bank: 'Choose your bank.',
  invalid_account: 'Account numbers are 7 to 20 digits.',
  no_payout_account: 'Add the bank account to pay you into first.',
  account_cooling_off: 'For your safety, withdrawals open 48 hours after changing bank details.',
  payout_pending: 'You already have a withdrawal on its way.',
  below_min_payout: 'There isn’t enough available to withdraw yet.',
  has_balance: 'You still have money in your wallet. Withdraw it before deleting your account.',
  booking_unpaid: 'Pay for the booking before putting an event in it.',
  too_late_to_cancel: 'Paid bookings can be cancelled up to 3 days before. Contact the owner.',
  bank_ref_required: 'Enter the bank statement reference.',
  bank_ref_used: 'That statement reference already confirmed another payment.',
  amount_mismatch: 'The amount paid doesn’t match.',
  gateway_not_configured: 'Card payments aren’t switched on yet. Pay by bank transfer.',
  members_only: 'Tickets are members-only for now. Join to buy early, or come back when general sale opens.',
  invalid_seats: 'Pick up to 8 seats.',
  choose_seats: 'Pick your seats on the map.',
  seat_taken: 'Someone just took one of those seats. Pick another.',
  invalid_seating: 'Rows: up to 26 rows of 60 seats. Tables: up to 200 tables of 2 to 20 seats. 2,000 seats at most.',
  not_a_member: 'You’re not a member of this organiser right now.',
  invalid_recurrence: 'Repeat weekly, every two weeks or monthly, for 2 to 12 dates.',
  booking_single: 'A rented booking holds one date. Make a single event for it.',
  invalid_presale: 'General sale has to open before the event starts, and in the future.',
  invalid_membership: 'Check the membership name and price.',
};

export function friendlyError(error: unknown): string {
  const e = error as { message?: string; code?: string; status?: number } | null;
  const msg = e?.message ?? '';
  for (const key of Object.keys(messages)) if (msg.includes(key)) return messages[key];
  if (e?.status === 429 || /rate limit|too many/i.test(msg)) return 'Too many tries. Wait a minute, then try again.';
  if (/expired|invalid.*(otp|token)|otp.*invalid/i.test(msg)) return 'That code is wrong or has expired. Check it or send a new one.';
  if (/Network request failed|Failed to fetch|fetch failed/i.test(msg)) return 'Can’t reach Tikkit. Check your connection and try again.';
  if (/provider is not enabled|Unsupported provider/i.test(msg)) return 'Google sign-in isn’t set up on this server yet. Use an email code instead.';
  if (/violates (check|not-null) constraint/i.test(msg)) return 'Some details aren’t valid. Check the form and try again.';
  if (/JWT expired|refresh token|not_signed_in|session/i.test(msg)) return 'You’ve been signed out. Sign in again to carry on.';
  if (e?.code === '42501' || /permission denied/i.test(msg)) return 'You don’t have access to that.';
  if (/payload too large|exceeded the maximum allowed size|entity too large/i.test(msg)) return 'That file is too big. Choose one under 5 MB.';
  return 'Something went wrong. Try again.';
}

export const imageFor = (row: Pick<EventRow, 'image_url' | 'image_path'>) =>
  row.image_url ?? (row.image_path ? supabase.storage.from(IMAGE_BUCKET).getPublicUrl(row.image_path).data.publicUrl : '');

export function toEvent(row: EventRow): EventItem {
  return {
    id: row.id,
    status: row.status,
    notice: row.notice ?? undefined,
    ownerId: row.owner_id ?? undefined,
    title: row.title,
    category: row.category,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    venue: { name: row.venue_name, area: row.venue_area, address: row.venue_address, lat: row.lat, lng: row.lng },
    access: row.access ?? undefined,
    image: imageFor(row),
    organizer: row.organizer_name,
    organizerId: row.organizer_id ?? undefined,
    organizerSlug: row.organizer?.slug ?? undefined,
    organizerAvatar: profileImage(row.organizer?.avatar_path),
    venueId: row.venue_id ?? undefined,
    createdAt: row.created_at,
    description: row.description,
    lineup: row.lineup.length ? row.lineup : undefined,
    listing: row.listing,
    reviewNote: row.review_note ?? undefined,
    currency: toCurrency(row.currency),
    feeMode: row.fee_mode === 'absorb' ? 'absorb' : 'pass',
    organizerVerified: row.organizer?.verified ?? false,
    payoutHold: row.payout_hold,
    editedAfterReview: row.edited_after_review,
    seriesId: row.series_id ?? undefined,
    publicSaleAt: row.public_sale_at ?? undefined,
    reviewFlags: row.review_flags ?? [],
    tiers: [...row.tiers]
      .sort((a, b) => a.position - b.position)
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        price: t.price,
        capacity: t.capacity,
        sold: t.sold,
        remaining: Math.max(0, t.capacity - t.sold),
        seated: t.seated,
      })),
  };
}

export function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    code: row.code,
    eventId: row.event_id,
    tierId: row.tier_id,
    holderName: row.holder_name,
    orderId: row.order_id,
    purchasedAt: row.purchased_at,
    checkedInAt: row.checked_in_at ?? undefined,
    transferredTo: row.transferred_at
      ? { name: row.transferred_to_name ?? '', email: row.transferred_to_email ?? '', at: row.transferred_at }
      : undefined,
    refundRequestedAt: row.refund_requested_at ?? undefined,
    listedForResale: row.listed_for_resale,
    seatLabel: row.seat_label ?? undefined,
  };
}

export async function run<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(friendlyError(error));
  return data;
}

// For calls that must return something (a new id, a list).
export async function must<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const data = await run(p);
  if (data === null || data === undefined) throw new Error(friendlyError(null));
  return data;
}

export const EVENT_SELECT = '*, tiers(*), organizer:organizers(slug, verified, avatar_path)';

// Upcoming and recent events. Past events stay a week so tickets still resolve.
export async function fetchEvents(): Promise<EventItem[]> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const rows = await must(
    supabase.from('events').select(EVENT_SELECT).gte('ends_at', since).order('starts_at').limit(500),
  );
  return rows.map(toEvent);
}

export async function fetchEvent(id: string): Promise<EventItem | null> {
  const row = await run(supabase.from('events').select(EVENT_SELECT).eq('id', id).maybeSingle());
  return row ? toEvent(row) : null;
}

export async function fetchMyTickets(userId: string): Promise<Ticket[]> {
  const rows = await must(
    supabase.from('tickets').select('*').eq('owner_id', userId).order('purchased_at', { ascending: false }),
  );
  return rows.map(toTicket);
}

// Guest list for organisers and door staff (RLS limits it to events they run).
export async function fetchEventTickets(eventIds: string[]): Promise<Ticket[]> {
  if (eventIds.length === 0) return [];
  const rows = await must(supabase.from('tickets').select('*').in('event_id', eventIds));
  return rows.map(toTicket);
}

export async function fetchStaffEventIds(email: string): Promise<string[]> {
  const rows = await must(supabase.from('event_staff').select('event_id').eq('email', email.toLowerCase()));
  return rows.map((r) => r.event_id);
}

export async function fetchStaff(eventId: string): Promise<string[]> {
  const rows = await must(supabase.from('event_staff').select('email').eq('event_id', eventId).order('added_at'));
  return rows.map((r) => r.email);
}

export const addStaff = (eventId: string, email: string) =>
  run(supabase.rpc('add_event_staff', { p_event_id: eventId, p_email: email.trim() }));

export const removeStaff = (eventId: string, email: string) =>
  run(supabase.rpc('remove_event_staff', { p_event_id: eventId, p_email: email }));

export type PurchaseInput = {
  eventId: string;
  lines: { tierId: string; quantity: number }[];
  holderName: string;
  promo?: string;
  addons?: { addonId: string; quantity: number }[];
  // Promoter link code from ?ref=
  ref?: string;
  // Send the tickets to a friend instead.
  gift?: { name: string; email: string };
  // Chosen seats, for seated ticket types.
  seats?: string[];
};

export const purchase = (i: PurchaseInput) =>
  must(
    supabase.rpc('purchase', {
      p_event_id: i.eventId,
      p_lines: i.lines,
      p_holder_name: i.holderName,
      ...(i.promo ? { p_promo: i.promo } : {}),
      ...(i.addons?.length ? { p_addons: i.addons } : {}),
      ...(i.ref ? { p_ref: i.ref } : {}),
      ...(i.gift ? { p_gift: i.gift } : {}),
      ...(i.seats?.length ? { p_seats: i.seats } : {}),
    }),
  );

export async function checkIn(code: string): Promise<CheckInResult> {
  const data = (await must(supabase.rpc('check_in', { p_code: code }))) as Record<string, unknown>;
  if (data.status === 'unknown') return { status: 'unknown' };
  if (data.status === 'expired_qr') return { status: 'expired_qr', code: String(data.code), holderName: String(data.holderName) };
  return {
    status: data.status as 'admitted' | 'already' | 'void',
    code: String(data.code),
    holderName: String(data.holderName),
    tierName: String(data.tierName ?? ''),
    seat: (data.seat as string | null) ?? undefined,
    eventTitle: String(data.eventTitle ?? ''),
    checkedInAt: (data.checkedInAt as string | null) ?? undefined,
    transferredToName: (data.transferredToName as string | null) ?? undefined,
    refundRequested: !!data.refundRequested,
    listedForResale: !!data.listedForResale,
    eventCancelled: !!data.eventCancelled,
    typed: !!data.typed,
  };
}

export const transferTicket = (code: string, name: string, email: string) =>
  run(supabase.rpc('transfer_ticket', { p_code: code, p_name: name, p_email: email }));

export const requestRefund = (code: string) => run(supabase.rpc('request_refund', { p_code: code }));

export const deleteAccount = () => run(supabase.rpc('delete_account'));

export type EventDraft = {
  title: string;
  category: EventItem['category'];
  startsAt: string;
  hours: number;
  venueName: string;
  venueArea: string;
  venueAddress: string;
  access?: string;
  organizerName: string;
  description: string;
  tiers: { name: string; price: number; capacity: number }[];
  // At a venue the caller owns, or in a space they have an approved booking for.
  venueId?: string;
  bookingId?: string;
  recurrence?: { every: 'week' | 'fortnight' | 'month'; count: number };
  // Members-only presale until then.
  publicSaleAt?: string;
  currency?: Currency;
};

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

// Uploads into the caller's own folder; storage policy rejects anything else.
// Venue photos share the bucket and the rule; profile pictures have their own.
export async function uploadPhoto(userId: string, uri: string, mimeType = 'image/jpeg', bucket = IMAGE_BUCKET): Promise<string> {
  const type = EXT[mimeType] ? mimeType : 'image/jpeg';
  const path = `${userId}/${Date.now().toString(36)}.${EXT[type]}`;
  const body = await (await fetch(uri)).arrayBuffer();
  if (body.byteLength > 5 * 1024 * 1024) throw new Error('That photo is over 5 MB. Choose a smaller one.');
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: type, upsert: false });
  if (error) throw new Error('The photo didn’t upload. Try again or skip the photo.');
  return path;
}

export const createEvent = (draft: EventDraft & { imagePath?: string }) =>
  must(supabase.rpc('create_event', { p: draft }));

// --- Venues and rentals -------------------------------------------------------

export function toVenue(row: VenueRow & { venue_reviews?: { rating: number }[] }): Venue {
  const reviews = row.venue_reviews ?? [];
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    area: row.area,
    address: row.address,
    access: row.access ?? undefined,
    capacity: row.capacity,
    description: row.description,
    amenities: row.amenities,
    image: imageFor(row),
    forRent: row.for_rent,
    hourlyRate: row.hourly_rate ?? undefined,
    minHours: row.min_hours,
    archived: row.archived,
    verified: !!row.verified_at,
    rating: reviews.length ? { average: averageRating(reviews), count: reviews.length } : undefined,
  };
}

function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    venueId: row.venue_id,
    venue: row.venue
      ? { name: row.venue.name, area: row.venue.area, image: imageFor(row.venue), ownerId: row.venue.owner_id }
      : undefined,
    requesterId: row.requester_id,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    ownerEmail: row.owner_email ?? undefined,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    message: row.message,
    reply: row.reply,
    total: row.total,
    ownUse: row.own_use,
    eventId: row.event_id ?? undefined,
    cancelledBy: (row.cancelled_by as Booking['cancelledBy']) ?? undefined,
    createdAt: row.created_at,
    paymentId: row.payment_id ?? undefined,
    paidAt: row.paid_at ?? undefined,
  };
}

export async function fetchRentableVenues(): Promise<Venue[]> {
  const rows = await must(
    supabase.from('venues').select('*, venue_reviews(rating)').eq('for_rent', true).eq('archived', false).not('verified_at', 'is', null).order('area').order('name').limit(500),
  );
  return rows.map(toVenue);
}

export async function fetchMyVenues(userId: string): Promise<Venue[]> {
  const rows = await must(
    supabase.from('venues').select('*').eq('owner_id', userId).eq('archived', false).order('created_at'),
  );
  return rows.map(toVenue);
}

export async function fetchVenue(id: string): Promise<Venue | null> {
  const row = await run(supabase.from('venues').select('*, venue_reviews(rating)').eq('id', id).maybeSingle());
  return row ? toVenue(row) : null;
}

// Times already taken over the next 90 days.
export async function fetchBusy(venueId: string): Promise<BusySlot[]> {
  const from = new Date();
  const to = new Date(from.getTime() + 90 * 86_400_000);
  const rows = await must(
    supabase.rpc('venue_busy', { p_venue_id: venueId, p_from: from.toISOString(), p_to: to.toISOString() }),
  );
  return rows.map((r) => ({ startsAt: r.starts_at, endsAt: r.ends_at }));
}

const BOOKING_SELECT = '*, venue:venues(name, area, image_url, image_path, owner_id)';

// Requests the person sent, and requests for spaces they own (RLS returns both).
export async function fetchBookings(): Promise<Booking[]> {
  const rows = await must(
    supabase.from('venue_bookings').select(BOOKING_SELECT).order('starts_at', { ascending: true }).limit(500),
  );
  return rows.map(toBooking);
}

export async function fetchBooking(id: string): Promise<Booking | null> {
  const row = await run(supabase.from('venue_bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle());
  return row ? toBooking(row) : null;
}

export type VenueDraft = {
  id?: string;
  name: string;
  area: string;
  address: string;
  access?: string;
  capacity: number;
  description: string;
  amenities: string[];
  forRent: boolean;
  hourlyRate?: number;
  minHours: number;
  imagePath?: string;
};

export const saveVenue = (draft: VenueDraft) => must(supabase.rpc('save_venue', { p: draft }));

export const archiveVenue = (id: string) => run(supabase.rpc('archive_venue', { p_venue_id: id }));

export const requestBooking = (venueId: string, startsAt: string, hours: number, name: string, message: string) =>
  must(
    supabase.rpc('request_booking', {
      p_venue_id: venueId,
      p_starts_at: startsAt,
      p_hours: hours,
      p_name: name,
      p_message: message,
    }),
  );

export const respondBooking = (id: string, approve: boolean, reply: string) =>
  run(supabase.rpc('respond_booking', { p_booking_id: id, p_approve: approve, p_reply: reply }));

export const cancelBooking = (id: string) => run(supabase.rpc('cancel_booking', { p_booking_id: id }));

// --- Organisers -----------------------------------------------------------------

export const profileImage = (path: string | null | undefined) =>
  path ? supabase.storage.from(PROFILE_BUCKET).getPublicUrl(path).data.publicUrl : undefined;

export const toOrganizer = (r: OrganizerRow): Organizer => ({
  id: r.id,
  ownerId: r.owner_id,
  slug: r.slug,
  name: r.name,
  bio: r.bio,
  avatarPath: r.avatar_path ?? undefined,
  bannerPath: r.banner_path ?? undefined,
  avatar: profileImage(r.avatar_path),
  banner: profileImage(r.banner_path),
});

export async function fetchOrganizerPage(slug: string) {
  const org = await run(supabase.from('organizers').select('*').eq('slug', slug).maybeSingle());
  if (!org) return null;
  const [rows, stats] = await Promise.all([
    must(supabase.from('events').select(EVENT_SELECT).eq('organizer_id', org.id).order('starts_at', { ascending: false }).limit(100)),
    must(supabase.rpc('organizer_stats', { p_id: org.id })),
  ]);
  const s = stats as { followers?: number; events?: number };
  return { organizer: toOrganizer(org), events: rows.map(toEvent), followers: s.followers ?? 0 };
}

export async function fetchMyOrganizers(userId: string): Promise<Organizer[]> {
  const rows = await must(supabase.from('organizers').select('*').eq('owner_id', userId).order('name'));
  return rows.map(toOrganizer);
}

export const updateOrganizer = (id: string, name: string, bio: string) =>
  run(supabase.rpc('update_organizer', { p_id: id, p_name: name, p_bio: bio }));

export type OrganizerListing = Organizer & { verified: boolean; followers: number; upcoming: number; rating?: number };

// Organisers with at least one listed event, verified and busiest first.
export async function browseOrganizers(query = ''): Promise<OrganizerListing[]> {
  const rows = await must(supabase.rpc('browse_organizers', { p_query: query.trim() || undefined }));
  return rows.map((r) => ({
    id: r.id,
    ownerId: '',
    slug: r.slug,
    name: r.name,
    bio: r.bio,
    avatarPath: r.avatar_path ?? undefined,
    bannerPath: r.banner_path ?? undefined,
    avatar: profileImage(r.avatar_path),
    banner: profileImage(r.banner_path),
    verified: r.verified,
    followers: Number(r.followers),
    upcoming: Number(r.upcoming),
    rating: r.rating == null ? undefined : Number(r.rating),
  }));
}

// Leaving a path out removes that picture.
export const setOrganizerImages = (id: string, avatarPath?: string, bannerPath?: string) =>
  run(supabase.rpc('set_organizer_images', { p_id: id, p_avatar_path: avatarPath, p_banner_path: bannerPath }));

// Best effort: a leftover file only costs storage.
export function removeProfileImage(path: string | undefined) {
  if (path) supabase.storage.from(PROFILE_BUCKET).remove([path]).then(() => {}, () => {});
}

// --- Saved events and follows (synced to the account) --------------------------

export async function fetchSaved(): Promise<string[]> {
  const rows = await must(supabase.from('saved_events').select('event_id').order('created_at', { ascending: false }));
  return rows.map((r) => r.event_id);
}

export const setSaved = (eventId: string, saved: boolean) =>
  run(supabase.rpc('set_saved', { p_event_id: eventId, p_saved: saved }));

export async function fetchFollows(): Promise<Organizer[]> {
  const rows = await must(supabase.from('follows').select('organizer:organizers(*)').order('created_at', { ascending: false }));
  return rows.flatMap((r) => (r.organizer ? [toOrganizer(r.organizer)] : []));
}

export const setFollow = (organizerId: string, follow: boolean) =>
  run(supabase.rpc('set_follow', { p_organizer_id: organizerId, p_follow: follow }));

// --- Announcements --------------------------------------------------------------

export async function fetchAnnouncements(eventIds: string[]): Promise<Announcement[]> {
  if (eventIds.length === 0) return [];
  const rows = await must(
    supabase.from('announcements').select('*').in('event_id', eventIds).order('created_at', { ascending: false }).limit(200),
  );
  return rows.map((r) => ({
    id: r.id,
    eventId: r.event_id,
    kind: r.kind as Announcement['kind'],
    body: r.body,
    createdAt: r.created_at,
  }));
}

export const postAnnouncement = (eventId: string, body: string) =>
  must(supabase.rpc('post_announcement', { p_event_id: eventId, p_body: body }));

// --- Editing and cancelling events ------------------------------------------------

export type EventEdit = Omit<EventDraft, 'tiers' | 'organizerName' | 'venueId' | 'bookingId' | 'recurrence' | 'publicSaleAt'> & {
  imagePath?: string;
  tiers: { id?: string; name: string; price: number; capacity: number }[];
};

export const updateEvent = (id: string, edit: EventEdit) => run(supabase.rpc('update_event', { p_id: id, p: edit }));

export const cancelEvent = (id: string, reason: string) => run(supabase.rpc('cancel_event', { p_id: id, p_reason: reason }));

// --- Promo codes ----------------------------------------------------------------

export async function fetchPromos(eventId: string): Promise<Promo[]> {
  const rows = await must(supabase.from('promo_codes').select('*').eq('event_id', eventId).order('created_at'));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    percentOff: r.percent_off,
    maxUses: r.max_uses ?? undefined,
    used: r.used,
    active: r.active,
  }));
}

export const createPromo = (eventId: string, code: string, percentOff: number, maxUses?: number) =>
  must(
    supabase.rpc('create_promo', {
      p_event_id: eventId,
      p_code: code,
      p_percent: percentOff,
      ...(maxUses ? { p_max_uses: maxUses } : {}),
    }),
  );

export const setPromoActive = (id: string, active: boolean) =>
  run(supabase.rpc('set_promo_active', { p_id: id, p_active: active }));

export async function checkPromo(eventId: string, code: string): Promise<{ code: string; percentOff: number } | null> {
  const data = (await must(supabase.rpc('check_promo', { p_event_id: eventId, p_code: code }))) as {
    valid?: boolean;
    code?: string;
    percentOff?: number;
  };
  return data.valid ? { code: data.code ?? code, percentOff: data.percentOff ?? 0 } : null;
}

// --- Space reviews --------------------------------------------------------------

const toReview = (r: ReviewRow): Review => ({
  id: r.id,
  bookingId: r.booking_id,
  venueId: r.venue_id,
  authorName: r.author_name,
  rating: r.rating,
  body: r.body,
  reply: r.reply,
  createdAt: r.created_at,
});

export async function fetchVenueReviews(venueId: string): Promise<Review[]> {
  const rows = await must(
    supabase.from('venue_reviews').select('*').eq('venue_id', venueId).order('created_at', { ascending: false }).limit(100),
  );
  return rows.map(toReview);
}

export async function fetchReviewForBooking(bookingId: string): Promise<Review | null> {
  const row = await run(supabase.from('venue_reviews').select('*').eq('booking_id', bookingId).maybeSingle());
  return row ? toReview(row) : null;
}

export const reviewBooking = (bookingId: string, rating: number, body: string) =>
  must(supabase.rpc('review_booking', { p_booking_id: bookingId, p_rating: rating, p_body: body }));

export const replyReview = (reviewId: string, reply: string) =>
  run(supabase.rpc('reply_review', { p_review_id: reviewId, p_reply: reply }));

// Takings per event for the caller's events, after discounts.
export async function fetchRevenue(): Promise<Record<string, number>> {
  const rows = await must(supabase.rpc('my_event_revenue'));
  return Object.fromEntries(rows.map((r) => [r.event_id, Number(r.revenue)]));
}
