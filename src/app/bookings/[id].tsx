import { router, useLocalSearchParams } from 'expo-router';
import { CalendarBlank, CalendarX, CreditCard, EnvelopeSimple, Money, Plus } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { usePullRefresh } from '@/components/PullRefresh';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { Cover } from '@/components/Cover';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { SignInRequired } from '@/components/SignInRequired';
import { ReviewForm } from '@/components/Reviews';
import { Stars } from '@/components/Stars';
import { StatusPill } from '@/components/VenueCards';
import { awaitingPayment, bookingHours, isUsableBooking, type Booking } from '@/data/venues';
import { cancelBooking, fetchBooking, fetchReviewForBooking, respondBooking } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { formatMoney, formatRange } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { useRemote } from '@/lib/useRemote';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function BookingScreen() {
  return (
    <SignInRequired title="Sign in to see this booking" body="Bookings are visible to the person who asked and the space’s owner.">
      <BookingDetail />
    </SignInRequired>
  );
}

function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { userId } = useAuth();
  const load = useCallback(async () => {
    const booking = await fetchBooking(id);
    const review = booking ? await fetchReviewForBooking(booking.id).catch(() => null) : null;
    return booking && { ...booking, review };
  }, [id]);
  const { data: b, loading, error, reload } = useRemote(load);
  const refresh = usePullRefresh(reload, { failed: !!error });
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState<'approve' | 'decline' | 'cancel' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (b === undefined) {
    return (
      <View style={styles.center}>
        {loading ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : (
          <EmptyState icon={CalendarX} title="Couldn’t load this booking" body={error ?? ''} action={{ label: 'Try again', onPress: reload }} />
        )}
      </View>
    );
  }
  if (b === null) {
    return <EmptyState icon={CalendarX} title="Booking not found" body="Only the person who asked and the space’s owner can see a booking." />;
  }

  const isRequester = b.requesterId === userId;
  const isOwner = !isRequester || b.ownUse;
  const now = new Date();
  const upcoming = new Date(b.endsAt) > now;
  const canAnswer = isOwner && !b.ownUse && b.status === 'pending' && new Date(b.startsAt) > now;
  // Owners decline pending requests instead of cancelling them.
  const canCancel =
    upcoming && !b.eventId && (b.status === 'approved' || (b.status === 'pending' && isRequester));

  const act = async (kind: 'approve' | 'decline' | 'cancel') => {
    setBusy(kind);
    setFailure(null);
    try {
      if (kind === 'cancel') await cancelBooking(b.id);
      else await respondBooking(b.id, kind === 'approve', reply.trim());
      successFeedback();
      await reload();
    } catch (err) {
      errorFeedback();
      setFailure(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const askCancel = () =>
    confirm(
      'Cancel this booking?',
      isRequester ? 'The owner will see it was cancelled and the time opens up again.' : 'The organiser will see you cancelled it.',
      'Cancel booking',
      () => act('cancel'),
    );

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      refreshControl={refresh.control}
        onScroll={refresh.onScroll}
        scrollEventThrottle={refresh.scrollEventThrottle}
    >
      <Container style={styles.gap}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${b.venue?.name ?? 'the space'}`}
          disabled={!b.venue}
          onPress={() => router.push({ pathname: '/venues/[id]', params: { id: b.venueId } })}
          style={({ pressed }) => [styles.venue, pressed && { opacity: 0.8 }]}
        >
          {b.venue && <Cover uri={b.venue.image} seed={b.venueId} style={[styles.thumb, { backgroundColor: colors.surface }]} />}
          <View style={styles.fill}>
            <AppText variant="title2" accessibilityRole="header">
              {b.venue?.name ?? 'A space'}
            </AppText>
            {b.venue && (
              <AppText variant="subhead" muted>
                {b.venue.area}
              </AppText>
            )}
          </View>
          <StatusPill status={b.status} />
        </Pressable>

        <AppText>{explain(b, isRequester)}</AppText>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Row icon={CalendarBlank} text={`${formatRange(b.startsAt, b.endsAt)} (${bookingHours(b)} hours)`} />
          {!b.ownUse && (
            <Row
              icon={Money}
              text={
                b.total === 0
                  ? 'Free'
                  : b.paidAt
                    ? `${formatMoney(b.total)}, paid through Tikkit`
                    : b.status === 'approved'
                      ? `${formatMoney(b.total)}, waiting for payment`
                      : `${formatMoney(b.total)}, paid in the app once approved`
              }
            />
          )}
          {isOwner && !b.ownUse && <Contact label={`${b.requesterName}, ${b.requesterEmail}`} email={b.requesterEmail} />}
          {isRequester && !b.ownUse && b.ownerEmail && <Contact label={`Owner: ${b.ownerEmail}`} email={b.ownerEmail} />}
        </View>

        {!!b.message && <Quote who={isRequester ? 'You wrote' : `${b.requesterName} wrote`} text={b.message} />}
        {!!b.reply && <Quote who={isRequester ? 'The owner replied' : 'You replied'} text={b.reply} />}

        {canAnswer && (
          <View style={styles.gapSm}>
            <Field
              label="Reply (optional)"
              value={reply}
              onChangeText={setReply}
              multiline
              maxLength={1000}
              textAlignVertical="top"
              placeholder="Access times, deposit, anything they should know"
              style={styles.multiline}
            />
            <Button label="Approve" loading={busy === 'approve'} disabled={busy !== null} onPress={() => act('approve')} />
            <Button label="Decline" variant="secondary" loading={busy === 'decline'} disabled={busy !== null} onPress={() => act('decline')} />
            <AppText variant="footnote" muted>
              Approving books this time for them. Other requests that overlap it are declined for you.
            </AppText>
          </View>
        )}

        {isRequester && awaitingPayment(b) && b.paymentId && upcoming && (
          <View style={styles.gapSm}>
            <Button label={`Pay ${formatMoney(b.total)} to confirm`} icon={CreditCard} onPress={() => router.push({ pathname: '/pay/[id]', params: { id: b.paymentId! } })} />
            <AppText variant="footnote" muted>
              The slot is held for 48 hours. The owner is paid after your booking, and you’re refunded in full if they cancel.
            </AppText>
          </View>
        )}
        {isRequester && isUsableBooking(b, userId) && (
          <Button
            label="Create event in this booking"
            icon={Plus}
            onPress={() => router.push({ pathname: '/organiser/new', params: { booking: b.id } })}
          />
        )}
        {b.eventId && (
          <Button
            label="Open the event"
            variant="secondary"
            onPress={() => router.push({ pathname: '/event/[id]', params: { id: b.eventId! } })}
          />
        )}

        {isRequester && !b.ownUse && b.status === 'approved' && !upcoming && (
          b.review ? (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <AppText variant="subhead" muted>
                Your review
              </AppText>
              <Stars value={b.review.rating} />
              {!!b.review.body && <AppText>{b.review.body}</AppText>}
            </View>
          ) : (
            <ReviewForm bookingId={b.id} onDone={reload} />
          )
        )}

        {failure && (
          <AppText variant="subhead" color={colors.danger} accessibilityLiveRegion="polite">
            {failure}
          </AppText>
        )}

        {canCancel && !b.ownUse && (
          <Button label="Cancel booking" variant="plain" loading={busy === 'cancel'} disabled={busy !== null} onPress={askCancel} />
        )}
      </Container>
    </ScrollView>
  );
}

function explain(b: Booking, isRequester: boolean): string {
  if (b.ownUse) return 'Your own event at your space. This time is blocked for others.';
  switch (b.status) {
    case 'pending':
      return isRequester
        ? 'Sent. The owner will approve or decline it. Check back here for their reply.'
        : 'New request. Approve it to book this time for them, or decline.';
    case 'approved':
      if (b.eventId) return 'Booked, and an event is set up in it.';
      if (awaitingPayment(b)) {
        return isRequester
          ? 'Approved. Pay within 48 hours to confirm, or the slot is released.'
          : 'Approved. Waiting for the organiser to pay. If they don’t within 48 hours, the slot opens again.';
      }
      return isRequester
        ? 'Booked and paid. Contact the owner to plan access, then create your event.'
        : 'Booked and paid. You’ll be paid, less the commission, the day after the booking.';
    case 'declined':
      return isRequester ? 'The owner declined this request. Try another time or space.' : 'You declined this request.';
    case 'cancelled':
      if (b.cancelledBy === 'requester') return isRequester ? 'You cancelled this booking.' : 'The organiser cancelled this booking.';
      return isRequester ? 'The owner cancelled this booking.' : 'You cancelled this booking.';
  }
}

function Row({ icon: IconCmp, text }: { icon: typeof Money; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <IconCmp size={20} color={colors.textMuted} />
      <AppText style={styles.fill}>{text}</AppText>
    </View>
  );
}

function Contact({ label, email }: { label: string; email: string }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Email ${email}`}
      onPress={() => Linking.openURL(`mailto:${encodeURIComponent(email)}`).catch(() => {})}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <EnvelopeSimple size={20} color={colors.accent} />
      <AppText color={colors.accent} style={styles.fill}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Quote({ who, text }: { who: string; text: string }) {
  const colors = useColors();
  return (
    <View style={[styles.quote, { borderColor: colors.border }]}>
      <AppText variant="footnote" muted style={styles.bold}>
        {who}
      </AppText>
      <AppText>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bold: { fontWeight: '600' },
  scroll: { paddingVertical: space.lg },
  gap: { gap: space.lg },
  gapSm: { gap: space.sm + 4 },
  venue: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  thumb: { width: 64, height: 64, borderRadius: radius.control },
  card: { padding: space.md, borderRadius: radius.control, gap: space.sm + 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm + 4 },
  quote: { borderLeftWidth: 3, paddingLeft: space.sm + 4, gap: space.xxs },
  multiline: { minHeight: 90, paddingTop: space.sm + 4 },
});
