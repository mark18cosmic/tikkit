// Organisers, announcements, promo codes and space reviews.
export type Organizer = {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  bio: string;
  // Storage paths, and their public URLs for display.
  avatarPath?: string;
  bannerPath?: string;
  avatar?: string;
  banner?: string;
};

export type Announcement = {
  id: string;
  eventId: string;
  kind: 'message' | 'rescheduled' | 'cancelled';
  body: string;
  createdAt: string;
};

export type Promo = {
  id: string;
  code: string;
  percentOff: number;
  maxUses?: number;
  used: number;
  active: boolean;
};

export type Review = {
  id: string;
  bookingId: string;
  venueId: string;
  authorName: string;
  rating: number;
  body: string;
  reply: string;
  createdAt: string;
};

export const averageRating = (reviews: Pick<Review, 'rating'>[]) =>
  reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
