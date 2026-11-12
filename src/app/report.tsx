import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle, Flag } from '@/components/icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { SignInRequired } from '@/components/SignInRequired';
import { reportReasons, type ReportReason } from '@/data/trust';
import { errorFeedback, successFeedback, tapFeedback } from '@/lib/haptics';
import { report } from '@/lib/market';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function ReportScreen() {
  return (
    <SignInRequired title="Sign in to report" body="Reports are tied to an account so they can’t be used to spam organisers.">
      <Report />
    </SignInRequired>
  );
}

function Report() {
  const { kind, id, title } = useLocalSearchParams<{ kind: 'event' | 'venue' | 'organizer'; id: string; title?: string }>();
  const colors = useColors();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <EmptyState
        icon={CheckCircle}
        title="Thanks for telling us"
        body="A person on our team will look at it. If it’s a scam, the organiser’s money is frozen and ticket holders are refunded."
        action={{ label: 'Done', onPress: () => router.back() }}
      />
    );
  }

  const send = async () => {
    if (!reason) return;
    setFailure(null);
    setBusy(true);
    try {
      await report(kind, id, reason, details);
      successFeedback();
      setDone(true);
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardScreen
      footer={
        <Container>
          <Button label="Send report" icon={Flag} loading={busy} disabled={!reason || (reason === 'other' && details.trim().length < 5)} onPress={send} />
        </Container>
      }
    >
      <Container style={styles.gap}>
        <View style={styles.gapSm}>
          <AppText variant="title2" accessibilityRole="header">
            What’s wrong?
          </AppText>
          {title && <AppText muted>{title}</AppText>}
        </View>
        <View style={styles.gapSm} accessibilityRole="radiogroup">
          {reportReasons.map((r) => {
            const selected = reason === r.id;
            return (
              <Pressable
                key={r.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  tapFeedback();
                  setReason(r.id);
                }}
                style={[styles.option, { backgroundColor: colors.surface, borderColor: selected ? colors.accent : colors.surface }]}
              >
                <View style={[styles.radio, { borderColor: selected ? colors.accent : colors.textMuted }]}>
                  {selected && <View style={[styles.radioDot, { backgroundColor: colors.accent }]} />}
                </View>
                <View style={styles.fill}>
                  <AppText variant="headline">{r.label}</AppText>
                  <AppText variant="subhead" muted>
                    {r.hint}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Field
          label={reason === 'other' ? 'Tell us what happened' : 'Details (optional)'}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={1000}
          placeholder="Who contacted you, what they asked for, any account numbers"
          style={styles.multi}
        />
        <AppText variant="footnote" muted>
          The organiser isn’t told who reported them.
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
  gap: { gap: space.lg },
  gapSm: { gap: space.sm },
  fill: { flex: 1 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.control, borderWidth: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  multi: { minHeight: 96, textAlignVertical: 'top' },
});
