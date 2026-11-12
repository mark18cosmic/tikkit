import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { Field } from '@/components/Field';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { SignInRequired } from '@/components/SignInRequired';
import { isEmail } from '@/lib/auth';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { useAppStore } from '@/store/AppStore';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function TransferScreen() {
  return (
    <SignInRequired title="Sign in to send tickets" body="Tickets are kept in your account.">
      <Transfer />
    </SignInRequired>
  );
}

function Transfer() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { tickets, getEvent, transfer } = useAppStore();
  const ticket = tickets.find((t) => t.code === code);
  const event = ticket && getEvent(ticket.eventId);
  const emailRef = useRef<TextInput>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const colors = useColors();

  if (!ticket || !event) return null;

  const errors = {
    name: name.trim().length < 2 ? 'Enter your friend’s name.' : undefined,
    email: !isEmail(email) ? 'Enter a valid email address.' : undefined,
  };

  const send = async () => {
    setShowErrors(true);
    setFailure(null);
    if (errors.name || errors.email) {
      errorFeedback();
      return;
    }
    setSending(true);
    try {
      await transfer(ticket.code, { name: name.trim(), email: email.trim() });
      successFeedback();
      router.back();
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setSending(false);
    }
  };

  return (
    <KeyboardScreen
      footer={
        <Container>
          <Button label="Send ticket" loading={sending} onPress={send} />
        </Container>
      }
    >
      <Container style={styles.gap}>
        <AppText muted>
          Send your ticket for {event.title} to a friend. Once sent, the QR code on this phone stops working and the ticket
          is theirs.
        </AppText>
        <Field
          label="Friend’s name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoFocus
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          error={showErrors ? errors.name : undefined}
        />
        <Field
          ref={emailRef}
          label="Friend’s email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          onSubmitEditing={send}
          helper="It appears in their Tickets when they sign in with this email."
          error={showErrors ? errors.email : undefined}
        />
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
