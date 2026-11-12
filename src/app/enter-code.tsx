import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { CheckInResultCard } from '@/components/CheckInResultCard';
import { AppText } from '@/components/AppText';
import { Container } from '@/components/Container';
import { Field } from '@/components/Field';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { SignInRequired } from '@/components/SignInRequired';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { useAppStore, type CheckInResult } from '@/store/AppStore';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function EnterCodeScreen() {
  return (
    <SignInRequired title="Sign in to check guests in" body="Check-in is for organisers and the door staff they add.">
      <EnterCode />
    </SignInRequired>
  );
}

function EnterCode() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { checkIn } = useAppStore();
  const [code, setCode] = useState(params.code ?? '');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const colors = useColors();
  const trimmed = code.trim();

  const submit = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const r = await checkIn(trimmed);
      setResult(r);
      if (r.status === 'admitted') {
        successFeedback();
        setCode('');
      } else {
        errorFeedback();
      }
    } catch (e) {
      errorFeedback();
      setResult(null);
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardScreen
      footer={
        <Container>
          <Button label="Check in" disabled={!trimmed} loading={busy} onPress={submit} />
        </Container>
      }
    >
      <Container style={styles.gap}>
        <Field
          label="Ticket code"
          value={code}
          onChangeText={(t) => {
            setCode(t);
            setResult(null);
          }}
          onSubmitEditing={submit}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus={!params.code}
          returnKeyType="go"
          placeholder="EVT-7F3K-92QD"
          helper="Printed under the QR code on the ticket."
        />
        {result && <CheckInResultCard result={result} />}
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
});
