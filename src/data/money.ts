// Payments, wallets and the things people pay for. Amounts are in minor units
// (laari or cents) of the payment's currency.
import type { Currency } from '@/lib/format';

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'refund_due' | 'refunded';
export type PaymentMethod = 'card' | 'transfer';
export type PaymentPurpose = 'order' | 'booking' | 'resale' | 'promotion' | 'subscription' | 'membership';

export type Payment = {
  id: string;
  reference: string;
  purpose: PaymentPurpose;
  orderId?: string;
  bookingId?: string;
  label: string;
  amount: number;
  fee: number;
  currency: Currency;
  method?: PaymentMethod;
  status: PaymentStatus;
  expiresAt: string;
  paidAt?: string;
  createdAt: string;
  note: string;
  bankRef?: string;
  payerId?: string;
};

export type PaymentConfig = {
  card: boolean;
  provider: 'none' | 'mock' | 'bml';
  transfer: boolean;
  // Transfers for USD payments go to Tikkit's USD account.
  transferUsd: boolean;
  bank?: { name: string; accountName: string; accountNumber: string };
  bankUsd?: { name: string; accountName: string; accountNumber: string };
  ticketFeeBps: number;
  // The fixed part of the booking fee per paid ticket, per currency.
  ticketFeeFixed: number;
  ticketFeeFixedUsd: number;
  proTicketFeeBps: number;
  feeCapBps: number;
  rentalFeeBps: number;
  resaleFeeBps: number;
  resaleCapBps: number;
  membershipFeeBps: number;
  promotedDayPrice: number;
  proMonthPrice: number;
  proYearPrice: number;
  holdDays: number;
  minPayout: number;
  minPayoutUsd: number;
};

export const fixedFee = (cfg: PaymentConfig, currency: Currency) => (currency === 'USD' ? cfg.ticketFeeFixedUsd : cfg.ticketFeeFixed);
export const bankFor = (cfg: PaymentConfig, currency: Currency) =>
  currency === 'USD' ? (cfg.transferUsd ? cfg.bankUsd : undefined) : cfg.transfer ? cfg.bank : undefined;

// Mirrors private.ticket_fee so checkout can show the fee before the server
// confirms it. The server's number is the one charged.
export function ticketFee(cfg: PaymentConfig, base: number, paidTickets: number, currency: Currency = 'MVR', pro = false) {
  if (base <= 0) return 0;
  const bps = pro ? cfg.proTicketFeeBps : cfg.ticketFeeBps;
  return Math.min(Math.round((base * bps) / 10000) + fixedFee(cfg, currency) * paidTickets, Math.round((base * cfg.feeCapBps) / 10000));
}

export const resaleCap = (cfg: PaymentConfig, face: number) => Math.round((face * cfg.resaleCapBps) / 10000);

export const percent = (bps: number) => `${(bps / 100).toLocaleString('en-GB', { maximumFractionDigits: 1 })}%`;

export type Addon = {
  id: string;
  eventId: string;
  kind: 'transfer' | 'extra';
  name: string;
  description: string;
  price: number;
  capacity: number;
  sold: number;
  remaining: number;
  departsAt?: string;
};

export type PromoterStat = {
  id: string;
  code: string;
  name: string;
  email?: string;
  pct: number;
  active: boolean;
  orders: number;
  tickets: number;
  commission: number;
  hasAccount: boolean;
};

export type EventSales = {
  gross: number;
  net: number;
  fees: number;
  refunded: number;
  pending: number;
  promoters: PromoterStat[];
  addons: { id: string; name: string; sold: number; capacity: number; price: number }[];
  // Pro only.
  byDay?: { day: string; tickets: number; net: number }[];
};

export type ResaleOffer = { id: string; tierId: string; tierName: string; price: number; facePrice: number };

// One currency's money.
export type Balance = {
  currency: Currency;
  available: number;
  pending: number;
  held: number;
  minPayout: number;
};

export type Wallet = {
  // MVR first; USD only once there's been any.
  balances: Balance[];
  account?: { bank: string; accountName: string; accountNumber: string; usdAccountNumber?: string; changedAt: string };
};

export type LedgerLine = { id: number; amount: number; currency: Currency; kind: string; memo: string; availableAt: string; createdAt: string };

export type Payout = {
  id: string;
  amount: number;
  currency: Currency;
  status: 'requested' | 'paid' | 'rejected';
  bankRef?: string;
  note: string;
  createdAt: string;
  decidedAt?: string;
  account: { bank: string; accountName: string; accountNumber: string; verifiedName?: string };
  userId: string;
  // name_mismatch, first_payout: worth a closer look before paying.
  flags: string[];
};

export const banks = ['BML', 'MIB', 'SBI', 'CBM', 'Other'] as const;

export type Collection = { id: string; slug: string; title: string; subtitle: string; position: number; active: boolean; eventIds: string[] };

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  pending: 'Waiting for payment',
  paid: 'Paid',
  expired: 'Expired',
  cancelled: 'Cancelled',
  refund_due: 'Refund on the way',
  refunded: 'Refunded',
};
