// Venues people own, and booking requests to rent them.
export type Venue = {
  id: string;
  ownerId: string;
  name: string;
  area: string;
  address: string;
  access?: string;
  capacity: number;
  description: string;
  amenities: string[];
  image: string;
  forRent: boolean;
  hourlyRate?: number; // laari
  minHours: number;
  archived: boolean;
  // Checked by Tikkit; only verified spaces are listed for rent.
  verified: boolean;
  // From reviews; missing until a space has one.
  rating?: { average: number; count: number };
};

export type BookingStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

export type Booking = {
  id: string;
  venueId: string;
  // Missing when the venue is no longer visible to this person.
  venue?: Pick<Venue, 'name' | 'area' | 'image' | 'ownerId'>;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  ownerEmail?: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  message: string;
  reply: string;
  total: number; // laari
  ownUse: boolean;
  eventId?: string;
  cancelledBy?: 'requester' | 'owner';
  createdAt: string;
  // Rentals are paid in the app once approved.
  paymentId?: string;
  paidAt?: string;
};

// Approved but the renter hasn't paid yet.
export const awaitingPayment = (b: Booking) => b.status === 'approved' && !b.ownUse && b.total > 0 && !b.paidAt;

export type BusySlot = { startsAt: string; endsAt: string };

// Offered as quick picks; owners choose from these.
export const amenityOptions = [
  'Stage',
  'Sound system',
  'Lighting',
  'Projector',
  'Bar',
  'Kitchen',
  'Air conditioning',
  'Wi-Fi',
  'Parking',
  'Toilets',
  'Outdoor space',
  'Step-free access',
] as const;

export const bookingHours = (b: Pick<Booking, 'startsAt' | 'endsAt'>) =>
  Math.round((new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime()) / 3_600_000);

// Upcoming approved bookings the requester can still put an event in.
export const isUsableBooking = (b: Booking, userId: string | null, now = new Date()) =>
  b.status === 'approved' && b.requesterId === userId && !b.ownUse && !b.eventId && new Date(b.endsAt) > now && !awaitingPayment(b);

export const statusLabel: Record<BookingStatus, string> = {
  pending: 'Waiting for reply',
  approved: 'Approved',
  declined: 'Declined',
  cancelled: 'Cancelled',
};
