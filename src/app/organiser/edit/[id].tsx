import { router, useLocalSearchParams } from 'expo-router';
import { LockSimple } from 'phosphor-react-native';

import { EmptyState } from '@/components/EmptyState';
import { EventWizard, type WizardResult, type WizardValues } from '@/components/EventWizard';
import { SignInRequired } from '@/components/SignInRequired';
import { isPast } from '@/data/events';
import { updateEvent, uploadPhoto } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { mvDateInput } from '@/lib/format';
import { useAppStore } from '@/store/AppStore';

export default function EditEventScreen() {
  return (
    <SignInRequired title="Sign in to edit this event" body="Only the organiser can change an event.">
      <EditEvent />
    </SignInRequired>
  );
}

function EditEvent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getEvent, loadEvent } = useAppStore();
  const { userId } = useAuth();
  const event = getEvent(id);

  if (!event || event.ownerId !== userId) {
    return <EmptyState icon={LockSimple} title="Not your event" body="Only the organiser can change an event." />;
  }
  if (event.status === 'cancelled' || isPast(event)) {
    return <EmptyState icon={LockSimple} title="Can’t edit this event" body="It has ended or was cancelled." />;
  }

  const at = mvDateInput(event.startsAt);
  const initial: WizardValues = {
    title: event.title,
    organizer: event.organizer,
    category: event.category,
    date: at.date,
    time: at.time,
    hours: Math.max(1, Math.round((new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) / 3_600_000)),
    place: { kind: 'other' },
    venueName: event.venue.name,
    area: event.venue.area,
    address: event.venue.address,
    access: event.access ?? '',
    description: event.description,
    currency: event.currency,
    tiers: event.tiers.map((t) => ({
      key: t.id,
      id: t.id,
      sold: t.sold,
      name: t.name,
      price: String(t.price / 100),
      quantity: String(t.capacity),
    })),
  };

  const submit = async (r: WizardResult) => {
    const imagePath = r.photo && userId ? await uploadPhoto(userId, r.photo.uri, r.photo.mimeType) : undefined;
    await updateEvent(event.id, {
      title: r.title.trim(),
      category: r.category,
      startsAt: r.start.toISOString(),
      hours: r.hours,
      venueName: r.venueName.trim(),
      venueArea: r.area.trim(),
      venueAddress: r.address.trim(),
      access: r.access.trim() || undefined,
      description: r.description.trim(),
      imagePath,
      currency: r.currency,
      tiers: r.tiers.map((t) => ({
        id: t.id,
        name: t.name.trim(),
        price: Math.round(Number(t.price) * 100),
        capacity: Number(t.quantity),
      })),
    });
    await loadEvent(event.id).catch(() => null);
    router.back();
  };

  return (
    <EventWizard
      mode="edit"
      initial={initial}
      imageUri={event.image || undefined}
      venues={[]}
      bookings={[]}
      organizers={[]}
      fixedPlace={event.venueId ? `${event.venue.name}, ${event.venue.area}` : undefined}
      onSubmit={submit}
    />
  );
}
