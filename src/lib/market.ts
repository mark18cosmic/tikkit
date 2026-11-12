// Payments, trust, growth features and admin tools. Same rules as api.ts:
// reads go through RLS, writes through database functions.
import type { EventItem } from '@/data/events';
import type {
  Addon,
  Balance,
  Collection,
  EventSales,
  LedgerLine,
  Payment,
  PaymentConfig,
  Payout,
  ResaleOffer,
  Wallet,
} from '@/data/money';
import type { AppNotification, MyStatus, Report, ReportReason, Verification } from '@/data/trust';
import type { Organizer } from '@/data/community';
import { EVENT_SELECT, must, run, toEvent, toOrganizer } from './api';
import { toCurrency, type Currency } from './format';
import type { Database } from './database.types';
import { supabase } from './supabase';

type PaymentRow = Database['public']['Tables']['payments']['Row'];
type VerificationRow = Database['public']['Tables']['verifications']['Row'];
type PayoutRow = Database['public']['Tables']['payouts']['Row'];

export const DOCS_BUCKET = 'verification-docs';

// --- Standing -------------------------------------------------------------------

export async function fetchMyStatus(): Promise<MyStatus> {
  const s = (await must(supabase.rpc('my_status'))) as Record<string, unknown> | null;
  const v = s?.verification as MyStatus['verification'] | null;
  return {
    admin: !!s?.admin,
    verified: !!s?.verified,
    trusted: !!s?.trusted,
    suspended: !!s?.suspended,
    proUntil: (s?.proUntil as string | null) ?? undefined,
    verification: v ?? undefined,
    unread: Number(s?.unread ?? 0),
  };
}

// --- Payments -------------------------------------------------------------------

let configCache: { at: number; value: PaymentConfig } | null = null;

export async function fetchPaymentConfig(): Promise<PaymentConfig> {
  if (configCache && Date.now() - configCache.at < 5 * 60_000) return configCache.value;
  const value = (await must(supabase.rpc('payment_config'))) as unknown as PaymentConfig;
  configCache = { at: Date.now(), value };
  return value;
}

export const toPayment = (r: PaymentRow): Payment => ({
  id: r.id,
  reference: r.reference,
  purpose: r.purpose as Payment['purpose'],
  orderId: r.order_id ?? undefined,
  bookingId: r.booking_id ?? undefined,
  label: r.label,
  amount: r.amount,
  fee: r.fee,
  currency: toCurrency(r.currency),
  method: (r.method as Payment['method']) ?? undefined,
  status: r.status as Payment['status'],
  expiresAt: r.expires_at,
  paidAt: r.paid_at ?? undefined,
  createdAt: r.created_at,
  note: r.note,
  bankRef: r.bank_ref ?? undefined,
  payerId: r.payer_id ?? undefined,
});

export async function fetchPayment(id: string): Promise<Payment | null> {
  const row = await run(supabase.from('payments').select('*').eq('id', id).maybeSingle());
  return row ? toPayment(row) : null;
}

// Filtered by user explicitly: admins can read everyone's rows through RLS.
async function me(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Sign in to continue.');
  return id;
}

export async function fetchMyPayments(): Promise<Payment[]> {
  const uid = await me();
  const rows = await must(supabase.from('payments').select('*').eq('payer_id', uid).order('created_at', { ascending: false }).limit(50));
  return rows.map(toPayment);
}

export async function refreshPaymentStatus(id: string): Promise<Payment['status']> {
  const s = (await must(supabase.rpc('payment_status', { p_payment_id: id }))) as { status: Payment['status'] };
  return s.status;
}

export const choosePaymentMethod = (id: string, method: 'card' | 'transfer') =>
  must(supabase.rpc('choose_payment_method', { p_payment_id: id, p_method: method }));

export const cancelPayment = (id: string) => run(supabase.rpc('cancel_payment', { p_payment_id: id }));

export const mockGatewayComplete = (id: string, success: boolean) =>
  must(supabase.rpc('mock_gateway_complete', { p_payment_id: id, p_success: success })) as Promise<string>;

// BML Connect via the payments Edge Function.
export async function gatewayCall(body: { action: 'start' | 'verify'; paymentId: string; returnUrl?: string }) {
  const { data, error } = await supabase.functions.invoke('payments', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? ((await ctx.json().catch(() => ({}))) as { error?: string }).error : undefined;
    throw new Error(detail === 'gateway_not_configured' ? 'Card payments aren’t switched on yet. Pay by bank transfer.' : 'The card gateway didn’t respond. Try again.');
  }
  return data as { url?: string; status?: string };
}

// Order with its payment, for the confirmation screen.
export async function fetchOrder(id: string) {
  return run(supabase.from('orders').select('*, payment:payments!orders_payment_fk(*)').eq('id', id).maybeSingle());
}

// --- Event extras -----------------------------------------------------------------

export async function fetchAddons(eventId: string): Promise<Addon[]> {
  const rows = await must(supabase.from('event_addons').select('*').eq('event_id', eventId).order('position'));
  return rows.map((r) => ({
    id: r.id,
    eventId: r.event_id,
    kind: r.kind as Addon['kind'],
    name: r.name,
    description: r.description,
    price: r.price,
    capacity: r.capacity,
    sold: r.sold,
    remaining: Math.max(0, r.capacity - r.sold),
    departsAt: r.departs_at ?? undefined,
  }));
}

export type AddonDraft = { id?: string; kind: Addon['kind']; name: string; description: string; price: number; capacity: number; departsAt?: string };

export const saveAddons = (eventId: string, addons: AddonDraft[]) =>
  run(supabase.rpc('save_addons', { p_event_id: eventId, p: addons }));

export const setFeeMode = (eventId: string, mode: 'pass' | 'absorb') =>
  run(supabase.rpc('set_fee_mode', { p_event_id: eventId, p_mode: mode }));

export const savePromoterLink = (eventId: string, name: string, code: string, email: string, pct: number) =>
  must(supabase.rpc('save_promoter_link', { p_event_id: eventId, p_name: name, p_code: code, p_email: email, p_pct: pct }));

export const setPromoterActive = (id: string, active: boolean) =>
  run(supabase.rpc('set_promoter_active', { p_id: id, p_active: active }));

export async function fetchEventSales(eventId: string): Promise<EventSales> {
  const s = (await must(supabase.rpc('event_sales', { p_event_id: eventId }))) as unknown as EventSales & { byDay: EventSales['byDay'] | null };
  return { ...s, byDay: s.byDay ?? undefined };
}

export async function fetchManifest(eventId: string) {
  const rows = await must(supabase.rpc('addon_manifest', { p_event_id: eventId }));
  return rows.map((r) => ({ addonId: r.addon_id, addonName: r.addon_name, holderName: r.holder_name, quantity: r.quantity }));
}

// --- Resale -----------------------------------------------------------------------

export async function fetchResaleOffers(eventId: string): Promise<ResaleOffer[]> {
  const rows = await must(supabase.rpc('resale_offers', { p_event_id: eventId }));
  return rows.map((r) => ({ id: r.id, tierId: r.tier_id, tierName: r.tier_name, price: r.price, facePrice: r.face_price }));
}

export async function fetchMyListing(ticketId: string) {
  return run(
    supabase.from('resale_listings').select('id, price, status').eq('ticket_id', ticketId).in('status', ['active', 'reserved']).maybeSingle(),
  );
}

export const listResale = (code: string, price: number) => must(supabase.rpc('list_resale', { p_code: code, p_price: price }));
export const cancelResale = (id: string) => run(supabase.rpc('cancel_resale', { p_id: id }));
export const buyResale = (id: string, holderName: string) =>
  must(supabase.rpc('buy_resale', { p_id: id, p_holder_name: holderName })) as Promise<string>;

// --- Promotion, Pro, broadcasts ----------------------------------------------------

export async function fetchActivePromotions(): Promise<string[]> {
  const rows = await must(supabase.rpc('active_promotions'));
  return rows as unknown as string[];
}

export async function fetchMyPromotions(eventId: string) {
  return must(supabase.from('promotions').select('*').eq('event_id', eventId).order('created_at', { ascending: false }));
}

export const buyPromotion = (eventId: string, days: number) =>
  must(supabase.rpc('buy_promotion', { p_event_id: eventId, p_days: days })) as Promise<string>;

export const buyPro = (months: 1 | 12) => must(supabase.rpc('buy_pro', { p_months: months })) as Promise<string>;

export const broadcast = (organizerId: string, title: string, body: string, eventId?: string) =>
  must(supabase.rpc('broadcast', { p_organizer_id: organizerId, p_title: title, p_body: body, ...(eventId ? { p_event_id: eventId } : {}) }));

// --- Wallet -------------------------------------------------------------------------

export async function fetchWallet(): Promise<{ wallet: Wallet; lines: LedgerLine[]; payouts: Payout[] }> {
  const uid = await me();
  const [w, lines, payouts] = await Promise.all([
    must(supabase.rpc('my_wallet')),
    must(supabase.from('ledger').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(100)),
    must(supabase.from('payouts').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(20)),
  ]);
  type Raw = Omit<Balance, 'currency'> & { usd: Omit<Balance, 'currency'> | null; account: (Wallet['account'] & { usdAccountNumber: string | null }) | null };
  const raw = w as unknown as Raw;
  const balances: Balance[] = [
    { currency: 'MVR', available: raw.available, pending: raw.pending, held: raw.held, minPayout: raw.minPayout },
  ];
  if (raw.usd) balances.push({ currency: 'USD', ...raw.usd });
  return {
    wallet: {
      balances,
      account: raw.account ? { ...raw.account, usdAccountNumber: raw.account.usdAccountNumber ?? undefined } : undefined,
    },
    lines: lines.map((l) => ({
      id: l.id,
      amount: l.amount,
      currency: toCurrency(l.currency),
      kind: l.kind,
      memo: l.memo,
      availableAt: l.available_at,
      createdAt: l.created_at,
    })),
    payouts: payouts.map(toPayout),
  };
}

const toPayout = (p: PayoutRow): Payout => ({
  id: p.id,
  amount: p.amount,
  currency: toCurrency(p.currency),
  status: p.status as Payout['status'],
  bankRef: p.bank_ref ?? undefined,
  note: p.note,
  createdAt: p.created_at,
  decidedAt: p.decided_at ?? undefined,
  account: p.account as Payout['account'],
  userId: p.user_id,
  flags: p.flags ?? [],
});

// usdNumber: the USD account at the same bank, for money from USD events.
export const setPayoutAccount = (bank: string, name: string, number: string, usdNumber?: string) =>
  run(supabase.rpc('set_payout_account', { p_bank: bank, p_name: name, p_number: number, p_usd_number: usdNumber || undefined }));

export const requestPayout = (currency: Currency = 'MVR') => must(supabase.rpc('request_payout', { p_currency: currency }));

// --- Waitlist and collections ---------------------------------------------------------

export async function fetchMyWaitlist(): Promise<{ eventId: string; tierId: string }[]> {
  const rows = await must(supabase.from('waitlist').select('event_id, tier_id'));
  return rows.map((r) => ({ eventId: r.event_id, tierId: r.tier_id }));
}

export const setWaitlist = (tierId: string, on: boolean) => run(supabase.rpc('set_waitlist', { p_tier_id: tierId, p_on: on }));

export async function fetchCollections(): Promise<Collection[]> {
  const rows = await must(
    supabase.from('collections').select('*, collection_events(event_id, position)').order('position').limit(20),
  );
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    subtitle: c.subtitle,
    position: c.position,
    active: c.active,
    eventIds: [...c.collection_events].sort((a, b) => a.position - b.position).map((x) => x.event_id),
  }));
}

// --- Notifications ----------------------------------------------------------------------

export async function fetchNotifications(): Promise<AppNotification[]> {
  const rows = await must(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100));
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link ?? undefined,
    readAt: n.read_at ?? undefined,
    createdAt: n.created_at,
  }));
}

export const markNotificationsRead = () => run(supabase.rpc('mark_notifications_read', {}));

// --- Rotating QR -------------------------------------------------------------------------

export async function fetchTicketSecrets(): Promise<Record<string, string>> {
  const rows = await must(supabase.rpc('my_ticket_secrets'));
  return Object.fromEntries(rows.map((r) => [r.code, r.secret]));
}

// --- Verification and reports ----------------------------------------------------------

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

// Private bucket, own folder only. Admins read through signed links.
export async function uploadDocument(userId: string, uri: string, mimeType = 'image/jpeg', name = 'doc'): Promise<string> {
  const type = EXT[mimeType] ? mimeType : 'image/jpeg';
  const path = `${userId}/${name}-${Date.now().toString(36)}.${EXT[type]}`;
  const body = await (await fetch(uri)).arrayBuffer();
  if (body.byteLength > 10 * 1024 * 1024) throw new Error('That file is over 10 MB. Take a smaller photo.');
  const { error } = await supabase.storage.from(DOCS_BUCKET).upload(path, body, { contentType: type, upsert: false });
  if (error) throw new Error('The document didn’t upload. Try again.');
  return path;
}

export async function documentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw new Error('That document couldn’t be opened. It may not have uploaded.');
  return data.signedUrl;
}

export const toVerification = (r: VerificationRow): Verification => ({
  id: r.id,
  userId: r.user_id,
  kind: r.kind as Verification['kind'],
  status: r.status as Verification['status'],
  legalName: r.legal_name,
  phone: r.phone ?? undefined,
  idKind: (r.id_kind as Verification['idKind']) ?? undefined,
  idNumber: r.id_number ?? undefined,
  businessName: r.business_name ?? undefined,
  documentPath: r.document_path ?? undefined,
  selfiePath: r.selfie_path ?? undefined,
  venueId: r.venue_id ?? undefined,
  proofPath: r.proof_path ?? undefined,
  lat: r.lat ?? undefined,
  lng: r.lng ?? undefined,
  note: r.note,
  reviewNote: r.review_note,
  createdAt: r.created_at,
});

export async function fetchMyVerifications(): Promise<Verification[]> {
  const uid = await me();
  const rows = await must(supabase.from('verifications').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(50));
  return rows.map(toVerification);
}

export type IdentityDraft = {
  legalName: string;
  phone: string;
  idKind: NonNullable<Verification['idKind']>;
  idNumber: string;
  businessName?: string;
  documentPath: string;
  selfiePath?: string;
  note?: string;
};

export const submitIdentity = (d: IdentityDraft) => must(supabase.rpc('submit_identity_verification', { p: d }));

export const submitVenueVerification = (d: { venueId: string; proofPath: string; lat?: number; lng?: number; note?: string }) =>
  must(supabase.rpc('submit_venue_verification', { p: d }));

export const report = (kind: 'event' | 'venue' | 'organizer', id: string, reason: ReportReason, details: string) =>
  must(supabase.rpc('report', { p_kind: kind, p_id: id, p_reason: reason, p_details: details }));

// --- Admin ----------------------------------------------------------------------------------

export type AdminOverview = {
  verifications: number;
  listings: number;
  reports: number;
  transfers: number;
  refunds: number;
  payouts: number;
  // Per currency; never added together.
  revenue30d: number;
  gmv30d: number;
  revenue30dUsd: number;
  gmv30dUsd: number;
};

export const fetchAdminOverview = async () => (await must(supabase.rpc('admin_overview'))) as unknown as AdminOverview;

export async function fetchPendingVerifications(): Promise<Verification[]> {
  const rows = await must(supabase.from('verifications').select('*').eq('status', 'pending').order('created_at').limit(100));
  return rows.map(toVerification);
}

export async function fetchVerification(id: string): Promise<Verification | null> {
  const row = await run(supabase.from('verifications').select('*').eq('id', id).maybeSingle());
  return row ? toVerification(row) : null;
}

// Pending listings, and approved ones that were edited or auto-approved recently (spot checks).
export async function fetchReviewQueue(): Promise<EventItem[]> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const now = new Date().toISOString();
  const rows = await must(
    supabase
      .from('events')
      .select(EVENT_SELECT)
      .gt('ends_at', now)
      .or(`listing.eq.pending,edited_after_review.eq.true,and(auto_approved.eq.true,created_at.gt.${since})`)
      .order('created_at')
      .limit(100),
  );
  return rows.map(toEvent);
}

export async function fetchOpenReports(): Promise<Report[]> {
  const rows = await must(supabase.from('reports').select('*').eq('status', 'open').order('created_at').limit(100));
  return rows.map((r) => ({
    id: r.id,
    targetKind: r.target_kind as Report['targetKind'],
    targetId: r.target_id,
    subjectId: r.subject_id ?? undefined,
    reason: r.reason as ReportReason,
    details: r.details,
    status: r.status as Report['status'],
    createdAt: r.created_at,
  }));
}

export async function fetchMoneyQueue(): Promise<{ transfers: Payment[]; refunds: Payment[]; payouts: Payout[] }> {
  const [transfers, refunds, payouts] = await Promise.all([
    must(supabase.from('payments').select('*').eq('status', 'pending').eq('method', 'transfer').order('created_at').limit(100)),
    must(supabase.from('payments').select('*').eq('status', 'refund_due').order('created_at').limit(100)),
    must(supabase.from('payouts').select('*').eq('status', 'requested').order('created_at').limit(100)),
  ]);
  return { transfers: transfers.map(toPayment), refunds: refunds.map(toPayment), payouts: payouts.map(toPayout) };
}

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  joinedAt: string;
  verified: boolean;
  trusted: boolean;
  suspended: boolean;
  events: number;
  upheldReports: number;
  openReports: number;
  legalName?: string;
};

export const fetchAdminUser = async (id: string) => (await must(supabase.rpc('admin_user', { p_user: id }))) as unknown as AdminUser;

export const reviewVerification = (id: string, approve: boolean, note: string) =>
  run(supabase.rpc('admin_review_verification', { p_id: id, p_approve: approve, p_note: note }));
export const reviewEvent = (id: string, approve: boolean, note: string) =>
  run(supabase.rpc('admin_review_event', { p_id: id, p_approve: approve, p_note: note }));
export const resolveReport = (id: string, upheld: boolean, note: string) =>
  run(supabase.rpc('admin_resolve_report', { p_id: id, p_upheld: upheld, p_note: note }));
export const takedownEvent = (id: string, reason: string) => run(supabase.rpc('admin_takedown_event', { p_id: id, p_reason: reason }));
export const setPayoutHold = (id: string, hold: boolean) => run(supabase.rpc('admin_set_payout_hold', { p_event_id: id, p_hold: hold }));
export const suspendUser = (id: string, suspend: boolean, note: string) =>
  run(supabase.rpc('admin_suspend', { p_user: id, p_suspend: suspend, p_note: note }));
export const confirmTransfer = (id: string, bankRef: string) =>
  must(supabase.rpc('admin_confirm_transfer', { p_payment_id: id, p_bank_ref: bankRef }));
export const markRefunded = (id: string, note: string) => run(supabase.rpc('admin_mark_refunded', { p_payment_id: id, p_note: note }));
export const decidePayout = (id: string, paid: boolean, ref: string) =>
  run(supabase.rpc('admin_decide_payout', { p_id: id, p_paid: paid, p_ref: ref }));
export const saveCollection = (c: Omit<Collection, 'id'> & { id?: string }) =>
  must(supabase.rpc('admin_save_collection', { p: c }));
export const deleteCollection = (id: string) => run(supabase.rpc('admin_delete_collection', { p_id: id }));

export async function fetchAllCollections(): Promise<Collection[]> {
  return fetchCollections();
}

// --- Seats ---------------------------------------------------------------------------------

// `row` is a row letter, or a table number when kind is 'table'. `held`: kept
// back by the organiser (only the organiser sees this; buyers just see taken).
export type Seat = { id: string; tierId: string; section: string; row: string; number: number; position: number; free: boolean; kind: 'row' | 'table'; held: boolean };

export async function fetchSeatMap(eventId: string): Promise<Seat[]> {
  const rows = await must(supabase.rpc('seat_map', { p_event_id: eventId }));
  return rows.map((r) => ({
    id: r.id,
    tierId: r.tier_id,
    section: r.section,
    row: r.row_label,
    number: r.seat_number,
    position: r.seat_position,
    free: r.free,
    kind: r.kind === 'table' ? 'table' : 'row',
    held: !!r.held,
  }));
}

export type SectionDraft =
  | { section: string; layout?: 'rows'; rows: number; seatsPerRow: number }
  | { section: string; layout: 'tables'; tables: number; seatsPerTable: number };

export const setSeatsHeld = (eventId: string, seatIds: string[], held: boolean) =>
  must(supabase.rpc('set_seats_held', { p_event_id: eventId, p_seat_ids: seatIds, p_held: held }));

export const saveSeating = (eventId: string, tierId: string, sections: SectionDraft[]) =>
  must(supabase.rpc('save_seating', { p_event_id: eventId, p_tier_id: tierId, p: sections }));

export const clearSeating = (eventId: string, tierId: string) => run(supabase.rpc('clear_seating', { p_event_id: eventId, p_tier_id: tierId }));

// --- Presale and memberships ----------------------------------------------------------------

export const setPublicSale = (eventId: string, at: string | null) =>
  run(supabase.rpc('set_public_sale', { p_event_id: eventId, ...(at ? { p_at: at } : {}) }));

export type Membership = { id: string; name: string; perks: string; price: number; period: 'month' | 'year'; discountPct: number; active?: boolean };

export async function fetchMyMembershipPlan(organizerId: string): Promise<Membership | null> {
  const row = await run(supabase.from('memberships').select('*').eq('organizer_id', organizerId).maybeSingle());
  return row
    ? { id: row.id, name: row.name, perks: row.perks, price: row.price, period: row.period as Membership['period'], discountPct: row.discount_pct, active: row.active }
    : null;
}

export const saveMembership = (organizerId: string, m: Omit<Membership, 'id'>) =>
  must(supabase.rpc('save_membership', { p_organizer_id: organizerId, p: m }));

export const buyMembership = (id: string) => must(supabase.rpc('buy_membership', { p_membership_id: id })) as Promise<string>;

// What leaving would mean right now: a refund (in laari, 0 if none) and when it would have ended.
export async function fetchMembershipExitTerms(organizerId: string): Promise<{ refund: number; expiresAt: string }> {
  const r = (await must(supabase.rpc('membership_exit_terms', { p_organizer_id: organizerId }))) as { refund: number; expiresAt: string };
  return { refund: r.refund ?? 0, expiresAt: r.expiresAt };
}

export async function cancelMembership(organizerId: string): Promise<{ refund: number }> {
  const r = (await must(supabase.rpc('cancel_membership', { p_organizer_id: organizerId }))) as { refund: number };
  return { refund: r.refund ?? 0 };
}

export type MyMembership = { organizer: Organizer; membership: Membership; until: string };

// Current memberships with their organiser and plan, for the Memberships screen.
export async function fetchMyMembershipDetails(): Promise<MyMembership[]> {
  const rows = await must(
    supabase
      .from('member_passes')
      .select('expires_at, organizer:organizers(*), membership:memberships(*)')
      .gt('expires_at', new Date().toISOString())
      .is('cancelled_at', null)
      .order('expires_at', { ascending: false }),
  );
  const seen = new Set<string>();
  const out: MyMembership[] = [];
  for (const r of rows) {
    if (!r.organizer || !r.membership || seen.has(r.organizer.id)) continue;
    seen.add(r.organizer.id);
    const m = r.membership;
    out.push({
      organizer: toOrganizer(r.organizer),
      membership: { id: m.id, name: m.name, perks: m.perks, price: m.price, period: m.period as Membership['period'], discountPct: m.discount_pct },
      until: r.expires_at,
    });
  }
  return out;
}

export async function fetchMyMemberships(): Promise<Record<string, string>> {
  const rows = await must(supabase.rpc('my_memberships'));
  return Object.fromEntries(rows.map((r) => [r.organizer_id, r.expires_at]));
}

// --- Organiser trust ------------------------------------------------------------------------

export type OrganizerTrust = {
  followers: number;
  events: number;
  eventsRun: number;
  cancelled: number;
  ticketsSold: number;
  rating?: number;
  reviews: number;
  since?: string;
  verified: boolean;
  membership?: Membership;
  members: number;
};

export async function fetchOrganizerTrust(organizerId: string): Promise<OrganizerTrust> {
  const s = (await must(supabase.rpc('organizer_stats', { p_id: organizerId }))) as Record<string, unknown>;
  return {
    followers: Number(s.followers ?? 0),
    events: Number(s.events ?? 0),
    eventsRun: Number(s.eventsRun ?? 0),
    cancelled: Number(s.cancelled ?? 0),
    ticketsSold: Number(s.ticketsSold ?? 0),
    rating: s.rating == null ? undefined : Number(s.rating),
    reviews: Number(s.reviews ?? 0),
    since: (s.since as string | null) ?? undefined,
    verified: !!s.verified,
    membership: (s.membership as Membership | null) ?? undefined,
    members: Number(s.members ?? 0),
  };
}

export type OrganizerReview = { id: string; eventId: string; authorName: string; rating: number; body: string; createdAt: string };

export async function fetchOrganizerReviews(organizerId: string): Promise<OrganizerReview[]> {
  const rows = await must(
    supabase.from('organizer_reviews').select('*').eq('organizer_id', organizerId).order('created_at', { ascending: false }).limit(50),
  );
  return rows.map((r) => ({ id: r.id, eventId: r.event_id, authorName: r.author_name, rating: r.rating, body: r.body, createdAt: r.created_at }));
}

export async function fetchMyOrganizerReview(eventId: string): Promise<OrganizerReview | null> {
  const uid = await me();
  const r = await run(supabase.from('organizer_reviews').select('*').eq('event_id', eventId).eq('user_id', uid).maybeSingle());
  return r ? { id: r.id, eventId: r.event_id, authorName: r.author_name, rating: r.rating, body: r.body, createdAt: r.created_at } : null;
}

export const reviewOrganizer = (eventId: string, rating: number, body: string) =>
  must(supabase.rpc('review_organizer', { p_event_id: eventId, p_rating: rating, p_body: body }));
