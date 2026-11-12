export type TicketStatus = 'active' | 'checkedIn' | 'transferred' | 'refundRequested';

export type Ticket = {
  id: string;
  code: string;
  eventId: string;
  tierId: string;
  holderName: string;
  orderId: string;
  purchasedAt: string;
  checkedInAt?: string;
  transferredTo?: { name: string; email: string; at: string };
  refundRequestedAt?: string;
  listedForResale: boolean;
  // "Stalls, row B, seat 4" for seated events.
  seatLabel?: string;
};

export const ticketStatus = (t: Ticket): TicketStatus =>
  t.transferredTo ? 'transferred' : t.refundRequestedAt ? 'refundRequested' : t.checkedInAt ? 'checkedIn' : 'active';

// QR payload: the code, the 30-second window, and a token only the holder can
// make. Door staff's check_in refuses tokens older than about two minutes.
export const QR_WINDOW_MS = 30_000;
export const qrWindow = (now = Date.now()) => Math.floor(now / QR_WINDOW_MS);

// What the door sees after a scan. Comes from the server's check_in function.
export type CheckInResult =
  | { status: 'unknown' }
  | { status: 'expired_qr'; code: string; holderName: string }
  | {
      status: 'admitted' | 'already' | 'void';
      code: string;
      holderName: string;
      tierName: string;
      seat?: string;
      eventTitle: string;
      checkedInAt?: string;
      transferredToName?: string;
      refundRequested: boolean;
      listedForResale: boolean;
      eventCancelled: boolean;
      // Typed in rather than scanned: check the holder's name against ID.
      typed: boolean;
    };
