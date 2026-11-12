import { router, useLocalSearchParams } from 'expo-router';
import { Buildings } from '@/components/icons';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { DateField, TimeField } from '@/components/DateTimeField';
import { Field } from '@/components/Field';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { SignInRequired } from '@/components/SignInRequired';
import { Stepper } from '@/components/Stepper';
import { formatRate } from '@/components/VenueCards';
import type { BusySlot, Venue } from '@/data/venues';
import { fetchBusy, fetchVenue, requestBooking } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney, formatRange, nextFridayMv, parseMv } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { useRemote } from '@/lib/useRemote';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function BookScreen() {
  return (
    <SignInRequired title="Sign in to book a space" body="The owner replies to your account, and you’ll see their contact details once they approve.">
      <Book />
    </SignInRequired>
  );
}

function Book() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { userId } = useAuth();
  const load = useCallback(async () => {
    const [venue, busy] = await Promise.all([fetchVenue(id), fetchBusy(id)]);
    return venue ? { venue, busy } : null;
  }, [id]);
  const { data, loading, error, reload } = useRemote(load);

  if (data === undefined) {
    return (
      <View style={styles.center}>
        {loading ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : (
          <EmptyState icon={Buildings} title="Couldn’t load this space" body={error ?? ''} action={{ label: 'Try again', onPress: reload }} />
        )}
      </View>
    );
  }
  if (!data || !data.venue.forRent || data.venue.archived) {
    return <EmptyState icon={Buildings} title="Not available" body="This space isn’t taking bookings right now." />;
  }
  if (data.venue.ownerId === userId) {
    return <EmptyState icon={Buildings} title="This is your space" body="Create an event there directly from your organiser page." />;
  }
  return <BookForm venue={data.venue} busy={data.busy} />;
}

function BookForm({ venue, busy }: { venue: Venue; busy: BusySlot[] }) {
  const colors = useColors();
  const { displayName } = useAuth();
  const [date, setDate] = useState(nextFridayMv());
  const [time, setTime] = useState('18:00');
  const [hours, setHours] = useState(Math.max(venue.minHours, 3));
  // Null until edited, so it can follow the profile name as that loads.
  const [nameInput, setName] = useState<string | null>(null);
  const name = nameInput ?? displayName;
  const [message, setMessage] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const start = parseMv(date, time);
  const end = new Date(start.getTime() + hours * 3_600_000);
  const clash = !isNaN(start.getTime())
    ? busy.find((b) => new Date(b.startsAt) < end && new Date(b.endsAt) > start)
    : undefined;
  const errors = {
    date: !/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(start.getTime())
      ? 'Use the format 2026-10-23.'
      : start <= new Date()
        ? 'Pick a date in the future.'
        : undefined,
    time: !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? 'Use 24-hour time, like 18:00.' : undefined,
    name: name.trim().length < 2 ? 'Enter your name or your organisation’s.' : undefined,
  };
  const valid = Object.values(errors).every((x) => !x) && !clash;
  const e = (k: keyof typeof errors) => (showErrors ? errors[k] : undefined);
  const total = (venue.hourlyRate ?? 0) * hours;

  const send = async () => {
    setShowErrors(true);
    setFailure(null);
    if (!valid) {
      errorFeedback();
      return;
    }
    setSending(true);
    try {
      const bookingId = await requestBooking(venue.id, start.toISOString(), hours, name.trim(), message.trim());
      successFeedback();
      router.replace({ pathname: '/bookings/[id]', params: { id: bookingId } });
    } catch (err) {
      errorFeedback();
      setFailure(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setSending(false);
    }
  };

  return (
    <KeyboardScreen
      footer={
        <Container>
          <Button label="Send request" loading={sending} onPress={send} />
        </Container>
      }
    >
      <Container style={styles.gap}>
        <View>
          <AppText variant="title2" accessibilityRole="header">
            {venue.name}
          </AppText>
          <AppText variant="subhead" muted>
            {venue.area}, {formatRate(venue)}
          </AppText>
        </View>

        <View style={styles.pair}>
          <View style={styles.fill}>
            <DateField label="Date" value={date} onChange={setDate} helper="Maldives time" error={e('date')} />
          </View>
          <View style={styles.fill}>
            <TimeField label="From" value={time} onChange={setTime} error={e('time')} />
          </View>
        </View>

        <View style={styles.inline}>
          <View style={styles.fill}>
            <AppText variant="subhead" style={styles.bold}>
              How long
            </AppText>
            <AppText variant="subhead" muted>
              {hours} {hours === 1 ? 'hour' : 'hours'}
              {venue.minHours > 1 ? `, at least ${venue.minHours}` : ''}
            </AppText>
          </View>
          <Stepper label="hour" value={hours} min={venue.minHours} max={24} onChange={setHours} />
        </View>

        {clash && (
          <AppText variant="subhead" color={colors.danger} accessibilityLiveRegion="polite">
            Already booked {formatRange(clash.startsAt, clash.endsAt)}. Pick another time.
          </AppText>
        )}

        <Field
          label="Your name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          maxLength={80}
          helper="The owner sees this and your email."
          error={e('name')}
        />
        <Field
          label="Message (optional)"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={1000}
          textAlignVertical="top"
          placeholder="What’s the event, and roughly how many people?"
          style={styles.multiline}
        />

        <View style={[styles.summary, { backgroundColor: colors.surface }]}>
          <View style={styles.inline}>
            <AppText style={styles.fill}>
              {formatMoney(venue.hourlyRate ?? 0)} × {hours} {hours === 1 ? 'hour' : 'hours'}
            </AppText>
            <AppText variant="headline">{formatMoney(total)}</AppText>
          </View>
          <AppText variant="footnote" muted>
            Nothing is charged now. If the owner approves, you’ll get their contact details and pay them directly.
          </AppText>
        </View>

        {failure && (
          <AppText variant="subhead" color={colors.danger} accessibilityLiveRegion="polite">
            {failure}
          </AppText>
        )}
      </Container>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bold: { fontWeight: '600' },
  gap: { gap: space.lg },
  pair: { flexDirection: 'row', gap: space.sm + 4, alignItems: 'flex-start' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  multiline: { minHeight: 100, paddingTop: space.sm + 4 },
  summary: { padding: space.md, borderRadius: radius.control, gap: space.sm },
});
