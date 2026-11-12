import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { EventWizard, type Place, type WizardResult, type WizardValues } from '@/components/EventWizard';
import { SignInRequired } from '@/components/SignInRequired';
import type { Organizer } from '@/data/community';
import { isUsableBooking, type Booking, type Venue } from '@/data/venues';
import { fetchBookings, fetchMyOrganizers, fetchMyVenues } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { nextFridayMv } from '@/lib/format';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { useColors } from '@/theme/useTheme';

export default function NewEventScreen() {
  return (
    <SignInRequired title="Sign in to create events" body="Events you create are tied to your account, so only you can manage them.">
      <NewEvent />
    </SignInRequired>
  );
}

// Loads the organiser's venues, bookings and organiser pages first, so the
// flow can start with the place it was opened for.
function NewEvent() {
  const params = useLocalSearchParams<{ venue?: string; booking?: string }>();
  const { userId, displayName } = useAuth();
  const { createEvent } = useAppStore();
  const colors = useColors();
  const load = useCallback(async () => {
    if (!userId) return { venues: [] as Venue[], bookings: [] as Booking[], organizers: [] as Organizer[] };
    // A failure here only hides the shortcuts; typing a venue still works.
    const [venues, bookings, organizers] = await Promise.all([
      fetchMyVenues(userId).catch(() => [] as Venue[]),
      fetchBookings().catch(() => [] as Booking[]),
      fetchMyOrganizers(userId).catch(() => [] as Organizer[]),
    ]);
    return { venues, bookings: bookings.filter((b) => isUsableBooking(b, userId)), organizers };
  }, [userId]);
  const { data } = useRemote(load);
  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  const place: Place =
    params.booking && data.bookings.some((b) => b.id === params.booking)
      ? { kind: 'booking', id: params.booking }
      : params.venue && data.venues.some((v) => v.id === params.venue)
        ? { kind: 'venue', id: params.venue }
        : { kind: 'other' };
  const initial: WizardValues = {
    title: '',
    organizer: data.organizers[0]?.name ?? displayName,
    category: 'Music',
    date: nextFridayMv(),
    time: '19:30',
    hours: 3,
    place,
    venueName: '',
    area: '',
    address: '',
    access: '',
    description: '',
    tiers: [{ key: 't1', name: 'General admission', price: '150', quantity: '100' }],
    currency: 'MVR',
    repeat: 'none',
    repeatCount: 4,
    presaleDays: 0,
  };

  const submit = async (r: WizardResult) => {
    const id = await createEvent(
      {
        title: r.title.trim(),
        category: r.category,
        startsAt: r.start.toISOString(),
        hours: r.hours,
        venueName: r.venue?.name ?? r.booking?.venue?.name ?? r.venueName.trim(),
        venueArea: r.venue?.area ?? r.booking?.venue?.area ?? r.area.trim(),
        venueAddress: r.venue?.address ?? r.address.trim(),
        venueId: r.venue?.id,
        bookingId: r.booking?.id,
        access: r.access.trim() || undefined,
        organizerName: r.organizer.trim(),
        description: r.description.trim(),
        currency: r.currency,
        tiers: r.tiers.map((t) => ({ name: t.name.trim(), price: Math.round(Number(t.price) * 100), capacity: Number(t.quantity) })),
        recurrence: r.repeat && r.repeat !== 'none' && !r.booking ? { every: r.repeat, count: r.repeatCount ?? 4 } : undefined,
        publicSaleAt: presaleEnd(r.presaleDays, r.start),
      },
      r.photo,
    );
    router.replace({ pathname: '/event/[id]', params: { id } });
  };

  return (
    <EventWizard
      mode="create"
      initial={initial}
      venues={data.venues}
      bookings={data.bookings}
      organizers={data.organizers.map((o) => o.name)}
      onSubmit={submit}
    />
  );
}

// General sale opens N days from now, but always at least a day before the event.
function presaleEnd(days: number | undefined, start: Date) {
  if (!days) return undefined;
  const at = Math.min(Date.now() + days * 86_400_000, start.getTime() - 86_400_000);
  return at > Date.now() + 3_600_000 ? new Date(at).toISOString() : undefined;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
