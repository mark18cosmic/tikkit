// Event types shared by the app. Events come from the server (src/lib/api.ts).
import type { Currency } from '@/lib/format';

export type Category =
  | 'Music'
  | 'Nightlife'
  | 'Culture'
  | 'Food'
  | 'Water'
  | 'Sport'
  | 'Art'
  | 'Comedy'
  | 'Film'
  | 'Wellness'
  | 'Talks'
  | 'Workshop'
  | 'Family'
  | 'Festival'
  | 'Charity';

// In the order filters and the event form show them: the most common first.
export const categories: Category[] = [
  'Music',
  'Nightlife',
  'Culture',
  'Food',
  'Water',
  'Sport',
  'Art',
  'Comedy',
  'Film',
  'Wellness',
  'Talks',
  'Workshop',
  'Family',
  'Festival',
  'Charity',
];

export type Tier = {
  id: string;
  name: string;
  description: string;
  price: number; // minor units of the event's currency
  capacity: number;
  sold: number;
  remaining: number;
  // Bought by picking seats on a map.
  seated: boolean;
};

export type EventStatus = 'scheduled' | 'rescheduled' | 'cancelled';

// Review state. Only approved events are public; owners see their own drafts.
export type Listing = 'draft' | 'pending' | 'approved' | 'rejected';

export type EventItem = {
  id: string;
  status?: EventStatus;
  notice?: string;
  ownerId?: string;
  title: string;
  category: Category;
  startsAt: string;
  endsAt: string;
  // `area` is the island or atoll people search by.
  venue: { name: string; area: string; address: string; lat: number; lng: number };
  // How to reach it: ferry, speedboat, walk. Islands make this matter more than a map pin.
  access?: string;
  image: string;
  organizer: string;
  // The organiser's page (missing on events from before organiser pages).
  organizerId?: string;
  organizerSlug?: string;
  organizerAvatar?: string;
  // Set when the event is at a venue on Tikkit.
  venueId?: string;
  // When it was published, for "Just announced".
  createdAt?: string;
  description: string;
  lineup?: string[];
  tiers: Tier[];
  listing: Listing;
  reviewNote?: string;
  // Everything bought for the event is in this currency.
  currency: Currency;
  // Who pays the booking fee: the buyer on top, or the organiser from the price.
  feeMode: 'pass' | 'absorb';
  organizerVerified?: boolean;
  payoutHold?: boolean;
  editedAfterReview?: boolean;
  // Dates of a recurring event share this.
  seriesId?: string;
  // Members-only presale until then.
  publicSaleAt?: string;
  reviewFlags: string[];
};

export const inPresale = (e: EventItem, now = new Date()) => !!e.publicSaleAt && new Date(e.publicSaleAt) > now;

export const lowestPrice = (e: EventItem) => Math.min(...e.tiers.map((t) => t.price));

export const isPast = (e: EventItem, now = new Date()) => new Date(e.endsAt) <= now;

// Starts more than `ms` from now (resale closes an hour before doors).
export const startsAfter = (e: EventItem, ms: number, now = new Date()) => new Date(e.startsAt).getTime() - now.getTime() > ms;

// On Explore: approved, not cancelled, not over.
export const isListed = (e: EventItem, now = new Date()) => e.listing === 'approved' && e.status !== 'cancelled' && !isPast(e, now);
