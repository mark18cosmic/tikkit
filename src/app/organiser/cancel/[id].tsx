import { router, useLocalSearchParams } from 'expo-router';
import { LockSimple, Warning } from '@/components/icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { SignInRequired } from '@/components/SignInRequired';
import { isPast } from '@/data/events';
import { cancelEvent } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function CancelEventScreen() {
  return (
    <SignInRequired title="Sign in to cancel this event" body="Only the organiser can cancel an event.">
      <CancelEvent />
    </SignInRequired>
  );
}

function CancelEvent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getEvent, loadEvent } = useAppStore();
  const { userId } = useAuth();
  const colors = useColors();
  const event = getEvent(id);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!event || event.ownerId !== userId || event.status === 'cancelled' || isPast(event)) {
    return <EmptyState icon={LockSimple} title="Can’t cancel this event" body="It isn’t yours, or it has already ended or been cancelled." />;
  }
  const sold = event.tiers.reduce((s, t) => s + t.sold, 0);

  const submit = async () => {
    setFailure(null);
    if (reason.trim().length < 2) {
      errorFeedback();
      setFailure('Tell ticket holders why, in a sentence.');
      return;
    }
    setBusy(true);
    try {
      await cancelEvent(event.id, reason.trim());
      await loadEvent(event.id).catch(() => null);
      successFeedback();
      router.back();
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <KeyboardScreen
      footer={
        <Container>
          <Button label="Cancel event" loading={busy} onPress={submit} />
        </Container>
      }
    >
      <Container style={styles.gap}>
        <View style={[styles.warn, { backgroundColor: colors.surface }]}>
          <Warning size={24} color={colors.danger} weight="bold" />
          <View style={styles.fill}>
            <AppText variant="headline">This can’t be undone</AppText>
            <AppText variant="subhead" muted>
              {event.title} is marked cancelled for everyone. {sold > 0 ? `The ${sold} people holding tickets` : 'Anyone holding tickets'} get
              your message, and their tickets stop working at the door. If it was at a venue, the time is released.
            </AppText>
          </View>
        </View>
        <Field
          label="Message to ticket holders"
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={500}
          textAlignVertical="top"
          placeholder="Storm warning for Friday, so we’re calling it off. Sorry!"
          style={styles.multiline}
        />
        <AppText variant="footnote" muted>
          Refunds for paid tickets will be handled once card payments are switched on.
        </AppText>
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
  gap: { gap: space.lg },
  warn: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.control },
  multiline: { minHeight: 120, paddingTop: space.sm + 4 },
});
