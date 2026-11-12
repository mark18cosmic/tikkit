import { router, useLocalSearchParams, type Href } from 'expo-router';
import { GoogleLogo } from '@/components/icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { Field } from '@/components/Field';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Wordmark } from '@/components/LogoMark';
import {
  DEV_ACCOUNT,
  isEmail,
  sendEmailCode,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
  verifyEmailCode,
} from '@/lib/auth';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

const RESEND_AFTER_S = 60;

// Set at build time by ./deploy. Without a mail server there are no email
// codes, so the screen uses email + password (sign in or create an account).
const EMAIL_CODES = process.env.EXPO_PUBLIC_EMAIL_CODES !== 'false';
const GOOGLE = process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN !== 'false';
// Test servers with email codes still let testers use the shared test accounts.
const TESTER_LOGIN = process.env.EXPO_PUBLIC_TESTER_LOGIN === 'true';
const MIN_PASSWORD = 10;

// Only same-app paths, so a crafted link can't bounce people to another site.
const safeNext = (next: unknown): Href | null =>
  typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? (next as Href) : null;

function finishSignIn(next: Href | null) {
  successFeedback();
  if (next) router.replace(next);
  else if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function SignIn() {
  const params = useLocalSearchParams<{ next?: string }>();
  const next = safeNext(params.next);
  const colors = useColors();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'google' | 'send' | 'verify' | 'dev' | 'password' | null>(null);
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const fail = (e: unknown) => {
    errorFeedback();
    setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
  };

  const google = async () => {
    setError(null);
    setBusy('google');
    try {
      if (await signInWithGoogle()) finishSignIn(next);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setError(null);
    if (!isEmail(email)) return fail(new Error('Enter a valid email address.'));
    setBusy('send');
    try {
      await sendEmailCode(email);
      setStep('code');
      setCode('');
      setCooldown(RESEND_AFTER_S);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const verify = async (value = code) => {
    setError(null);
    if (!/^\d{6}$/.test(value)) return fail(new Error('Enter the 6-digit code from the email.'));
    setBusy('verify');
    try {
      await verifyEmailCode(email, value);
      finishSignIn(next);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  // Development only: one tap into the seeded test account.
  const devSignIn = async () => {
    setError(null);
    setBusy('dev');
    try {
      await signInWithPassword(DEV_ACCOUNT.email, DEV_ACCOUNT.password);
      finishSignIn(next);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const passwordSignIn = async () => {
    setError(null);
    if (!isEmail(email)) return fail(new Error('Enter a valid email address.'));
    if (!password) return fail(new Error('Enter your password.'));
    if (mode === 'signup' && password.length < MIN_PASSWORD)
      return fail(new Error(`Choose a longer password: at least ${MIN_PASSWORD} characters.`));
    setBusy('password');
    try {
      if (mode === 'signup') await signUpWithPassword(email, password);
      else await signInWithPassword(email, password);
      finishSignIn(next);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const errorText = error && (
    <AppText variant="subhead" color={colors.danger} accessibilityLiveRegion="polite">
      {error}
    </AppText>
  );

  if (step === 'code') {
    return (
      <KeyboardScreen
        footer={
          <Container>
            <Button label="Sign in" loading={busy === 'verify'} onPress={() => verify()} />
          </Container>
        }
      >
        <Container style={styles.gap}>
          <View style={styles.intro}>
            <AppText variant="title2" accessibilityRole="header">
              Check your email
            </AppText>
            <AppText muted>Enter the 6-digit code we sent to {email.trim()}.</AppText>
          </View>
          <Field
            label="Code"
            value={code}
            onChangeText={(t) => {
              const digits = t.replace(/\D/g, '').slice(0, 6);
              setCode(digits);
              setError(null);
              if (digits.length === 6) verify(digits);
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            style={styles.code}
          />
          {errorText}
          <View style={styles.links}>
            <Button
              label={cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
              variant="plain"
              disabled={cooldown > 0 || busy !== null}
              onPress={send}
            />
            <Button
              label="Use a different email"
              variant="plain"
              onPress={() => {
                setStep('email');
                setError(null);
              }}
            />
          </View>
          {__DEV__ && (
            <AppText variant="footnote" muted>
              Local server: emails land in Mailpit on port 54324 of the computer running Supabase.
            </AppText>
          )}
        </Container>
      </KeyboardScreen>
    );
  }

  return (
    <KeyboardScreen>
      <Container style={styles.gap}>
        <View style={styles.intro}>
          <View style={styles.mark}>
            <Wordmark height={44} color={colors.accent} />
          </View>
          <AppText variant="title2" accessibilityRole="header">
            Sign in or create an account
          </AppText>
          <AppText muted>Your tickets stay in your account, on every device.</AppText>
        </View>

        {GOOGLE && (
          <>
            <Button label="Continue with Google" icon={GoogleLogo} variant="secondary" loading={busy === 'google'} onPress={google} />
            <View style={styles.or}>
              <View style={[styles.rule, { backgroundColor: colors.border }]} />
              <AppText variant="footnote" muted>
                or
              </AppText>
              <View style={[styles.rule, { backgroundColor: colors.border }]} />
            </View>
          </>
        )}

        <Field
          label="Email"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setError(null);
          }}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType={EMAIL_CODES ? 'send' : 'next'}
          onSubmitEditing={EMAIL_CODES ? send : undefined}
          helper={EMAIL_CODES ? 'We’ll email you a 6-digit code. No password needed.' : undefined}
        />
        {EMAIL_CODES ? (
          <Button label="Email me a code" loading={busy === 'send'} onPress={send} />
        ) : (
          <>
            <Field
              label="Password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
              secureTextEntry
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={passwordSignIn}
              helper={mode === 'signup' ? `At least ${MIN_PASSWORD} characters.` : undefined}
            />
            <Button
              label={mode === 'signup' ? 'Create account' : 'Sign in'}
              loading={busy === 'password'}
              onPress={passwordSignIn}
            />
            <Button
              label={mode === 'signup' ? 'Have an account? Sign in' : 'New here? Create an account'}
              variant="plain"
              onPress={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup');
                setError(null);
              }}
            />
          </>
        )}
        {errorText}
        {EMAIL_CODES && TESTER_LOGIN && !__DEV__ && (
          <View style={[styles.dev, { borderColor: colors.border }]}>
            <AppText variant="footnote" muted>
              Test server: sign in with a tester email and password instead.
            </AppText>
            <Field
              label="Tester password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={passwordSignIn}
            />
            <Button label="Sign in with password" variant="secondary" loading={busy === 'password'} onPress={passwordSignIn} />
          </View>
        )}
        {__DEV__ && (
          <View style={[styles.dev, { borderColor: colors.border }]}>
            <AppText variant="footnote" muted>
              Development build: test account {DEV_ACCOUNT.email}, password {DEV_ACCOUNT.password}. It owns the sample
              events and spaces.
            </AppText>
            <Button label="Sign in as test admin" variant="plain" loading={busy === 'dev'} onPress={devSignIn} />
          </View>
        )}
      </Container>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  mark: { marginBottom: space.sm },
  gap: { gap: space.lg },
  intro: { gap: space.xs },
  or: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  code: { fontSize: 28, lineHeight: 34, letterSpacing: 8, fontVariant: ['tabular-nums'] },
  links: { alignItems: 'flex-start' },
  dev: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, gap: space.xs },
});
