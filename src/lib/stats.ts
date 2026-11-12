import type { EventItem } from '@/data/events';
import { ticketStatus, type Ticket } from '@/data/tickets';

export type EventStats = { sold: number; checkedIn: number; revenue: number; capacity: number; refunds: number };

// Sales from the event's guest list (tickets the organiser can read).
// `revenue` is what orders actually took (after promo codes) when the server
// has reported it; otherwise it's estimated from ticket prices.
export function eventStats(event: EventItem, tickets: Ticket[], revenue?: Record<string, number>): EventStats {
  const mine = tickets.filter((t) => t.eventId === event.id);
  const price = (tierId: string) => event.tiers.find((t) => t.id === tierId)?.price ?? 0;
  // A transfer closes the sender's ticket and issues a new one, so only the
  // new one counts.
  const counted = mine.filter((t) => ticketStatus(t) === 'active' || ticketStatus(t) === 'checkedIn');
  return {
    sold: counted.length,
    checkedIn: counted.filter((t) => !!t.checkedInAt).length,
    revenue: revenue?.[event.id] ?? counted.reduce((sum, t) => sum + price(t.tierId), 0),
    capacity: event.tiers.reduce((sum, t) => sum + t.capacity, 0),
    refunds: mine.filter((t) => ticketStatus(t) === 'refundRequested').length,
  };
}
