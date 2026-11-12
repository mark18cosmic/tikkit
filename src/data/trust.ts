// Verification, reports and the caller's standing.

export type Verification = {
  id: string;
  userId: string;
  kind: 'identity' | 'venue';
  status: 'pending' | 'approved' | 'rejected';
  legalName: string;
  phone?: string;
  idKind?: 'national_id' | 'passport' | 'business';
  idNumber?: string;
  businessName?: string;
  documentPath?: string;
  selfiePath?: string;
  venueId?: string;
  proofPath?: string;
  lat?: number;
  lng?: number;
  note: string;
  reviewNote: string;
  createdAt: string;
};

export type MyStatus = {
  admin: boolean;
  verified: boolean;
  trusted: boolean;
  suspended: boolean;
  proUntil?: string;
  verification?: { id: string; status: Verification['status']; reviewNote: string; createdAt: string };
  unread: number;
};

export const isPro = (s: MyStatus | null | undefined) => !!s?.proUntil && new Date(s.proUntil) > new Date();

export const idKinds: { id: NonNullable<Verification['idKind']>; label: string; hint: string }[] = [
  { id: 'national_id', label: 'National ID card', hint: 'Maldivian ID, front side' },
  { id: 'passport', label: 'Passport', hint: 'The photo page' },
  { id: 'business', label: 'Business registration', hint: 'Registration certificate from the Ministry' },
];

export type ReportReason = 'scam' | 'fake' | 'wrong_info' | 'unsafe' | 'offensive' | 'other';

export const reportReasons: { id: ReportReason; label: string; hint: string }[] = [
  { id: 'scam', label: 'Scam or asking for payment elsewhere', hint: 'Asked you to transfer money directly, or sent a slip' },
  { id: 'fake', label: 'Event isn’t real', hint: 'The venue, date or lineup doesn’t exist' },
  { id: 'wrong_info', label: 'Wrong details', hint: 'Time, price or place is wrong' },
  { id: 'unsafe', label: 'Unsafe', hint: 'Boats, crowds or something dangerous' },
  { id: 'offensive', label: 'Offensive', hint: 'Hateful or inappropriate content' },
  { id: 'other', label: 'Something else', hint: 'Tell us below' },
];

export type Report = {
  id: string;
  targetKind: 'event' | 'venue' | 'organizer';
  targetId: string;
  subjectId?: string;
  reason: ReportReason;
  details: string;
  status: 'open' | 'upheld' | 'dismissed';
  createdAt: string;
};

export type AppNotification = { id: string; kind: string; title: string; body: string; link?: string; readAt?: string; createdAt: string };
