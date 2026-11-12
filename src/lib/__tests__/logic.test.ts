import type { EventItem } from '@/data/events';
import type { Ticket } from '@/data/tickets';
import { isUsableBooking, type Booking } from '@/data/venues';
import { formatMoney, formatRange, formatTime, isThisWeekend, mvDateInput, mvInstant, parseMv } from '../format';
import { eventStats } from '../stats';

const event: EventItem = {
  id: 'sunset-dolphin-cruise',
  title: 'Sunset Dolphin Cruise',
  category: 'Water',
  startsAt: '2026-10-10T12:00:00Z',
  endsAt: '2026-10-10T14:00:00Z',
  venue: { name: 'Jetty 5', area: 'Malé', address: 'North Harbour, Malé', lat: 4.1787, lng: 73.5094 },
  image: '',
  organizer: 'Blue Dhoni Trips',
  description: 'Two hours on a traditional dhoni along the reef edge.',
  listing: 'approved',
  currency: 'MVR',
  feeMode: 'pass',
  reviewFlags: [],
  tiers: [
    { id: 'adult', name: 'Adult', description: 'Seat', price: 45000, capacity: 18, sold: 3, remaining: 15, seated: false },
    { id: 'child', name: 'Child', description: 'Seat', price: 25000, capacity: 8, sold: 1, remaining: 7, seated: false },
  ],
};
const ticket = (over: Partial<Ticket>): Ticket => ({
  id: over.code ?? 'X',
  code: 'X',
  eventId: event.id,
  tierId: 'adult',
  holderName: 'Aishath Shifa',
  orderId: 'o1',
  purchasedAt: '2026-10-01T10:00:00Z',
  listedForResale: false,
  ...over,
});

test('stats exclude refund requests from sales but count check-ins', () => {
  const s = eventStats(event, [
    ticket({ code: 'A', checkedInAt: '2026-10-04T15:00:00Z' }),
    ticket({ code: 'B', tierId: 'child' }),
    ticket({ code: 'C', refundRequestedAt: '2026-10-02T10:00:00Z' }),
    ticket({ code: 'D', eventId: 'other-event' }),
  ]);
  expect(s.sold).toBe(2);
  expect(s.checkedIn).toBe(1);
  expect(s.refunds).toBe(1);
  expect(s.revenue).toBe(45000 + 25000);
  expect(s.capacity).toBe(26);
});

test('a transferred ticket is counted once, on the new holder', () => {
  const s = eventStats(event, [
    ticket({ code: 'A', transferredTo: { name: 'Hassan', email: 'h@example.mv', at: '2026-10-02T10:00:00Z' } }),
    ticket({ code: 'B', holderName: 'Hassan' }),
  ]);
  expect(s.sold).toBe(1);
  expect(s.revenue).toBe(45000);
});

test('Maldivian weekend is Friday and Saturday, in Maldives time', () => {
  const wednesday = mvInstant(2026, 9, 7, 12); // Wed 7 Oct 2026, noon in Malé
  expect(isThisWeekend(mvInstant(2026, 9, 9, 20).toISOString(), wednesday)).toBe(true); // Fri
  expect(isThisWeekend(mvInstant(2026, 9, 10, 23, 30).toISOString(), wednesday)).toBe(true); // Sat late
  expect(isThisWeekend(mvInstant(2026, 9, 11, 9).toISOString(), wednesday)).toBe(false); // Sun is a workday
  const saturday = mvInstant(2026, 9, 10, 15);
  expect(isThisWeekend(mvInstant(2026, 9, 9, 20).toISOString(), saturday)).toBe(false); // Fri already gone
  expect(isThisWeekend(mvInstant(2026, 9, 10, 19).toISOString(), saturday)).toBe(true);
});

test('times render in Maldives time regardless of device zone', () => {
  // 14:00 UTC is 19:00 in Malé.
  expect(formatTime('2026-10-09T14:00:00Z')).toBe('19:00');
});

test('money renders in rufiyaa', () => {
  expect(formatMoney(45000)).toBe('MVR 450');
  expect(formatMoney(12050)).toBe('MVR 120.50');
  expect(formatMoney(185000)).toBe('MVR 1,850');
  expect(formatMoney(0)).toBe('Free');
  expect(formatMoney(12000, 'USD')).toBe('USD 120');
  expect(formatMoney(1050, 'USD')).toBe('USD 10.50');
});

test('booking times round-trip through Maldives form values', () => {
  const at = mvInstant(2026, 10, 5, 18, 30);
  expect(mvDateInput(at.toISOString())).toEqual({ date: '2026-11-05', time: '18:30' });
  expect(parseMv('2026-11-05', '18:30').getTime()).toBe(at.getTime());
  expect(isNaN(parseMv('5/11/2026', '18:30').getTime())).toBe(true);
  expect(formatRange(at.toISOString(), mvInstant(2026, 10, 5, 22).toISOString())).toBe('Thu 5 Nov, 18:30 to 22:00');
});

test('only your own approved, unused, upcoming bookings can hold an event', () => {
  const now = new Date('2026-10-11T00:00:00Z');
  const b: Booking = {
    id: 'b1', venueId: 'v1', requesterId: 'me', requesterName: 'Me', requesterEmail: 'me@example.mv',
    startsAt: '2026-11-05T12:00:00Z', endsAt: '2026-11-05T18:00:00Z', status: 'approved',
    message: '', reply: '', total: 0, ownUse: false, createdAt: '2026-10-01T00:00:00Z',
  };
  expect(isUsableBooking(b, 'me', now)).toBe(true);
  expect(isUsableBooking(b, 'someone-else', now)).toBe(false);
  expect(isUsableBooking({ ...b, status: 'pending' }, 'me', now)).toBe(false);
  expect(isUsableBooking({ ...b, eventId: 'e1' }, 'me', now)).toBe(false);
  expect(isUsableBooking({ ...b, ownUse: true }, 'me', now)).toBe(false);
  expect(isUsableBooking(b, 'me', new Date('2026-11-06T00:00:00Z'))).toBe(false);
});
