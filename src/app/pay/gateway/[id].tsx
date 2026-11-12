import { router, useLocalSearchParams } from 'expo-router';
import { CreditCard, Flask, LockSimple } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { Field } from '@/components/Field';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Bone } from '@/components/Skeleton';
import { formatMoney } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { fetchPayment, mockGatewayComplete } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// Local stand-in for the bank's hosted card page. It follows the same steps
// as BML Connect (create, pay on a separate page, come back, verify on the
// server) so the rest of the app doesn't change when real keys arrive. Only
// works while the database's card_provider is 'mock'.
const DECLINE = '4000000000000002';

export default function TestGateway() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const load = useCallback(() => fetchPayment(id), [id]);
  const { data: payment } = useRemote(load);
  const [card, setCard] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/29');
  const [cvc, setCvc] = useState('123');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const pay = async () => {
    setFailure(null);
    setBusy(true);
    try {
      const result = await mockGatewayComplete(id, card.replace(/\s/g, '') !== DECLINE);
      if (result === 'declined') {
        errorFeedback();
        setFailure('Card declined. Try the 4242 test card.');
        return;
      }
      successFeedback();
      router.back();
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
          <Button label={payment ? `Pay ${formatMoney(payment.amount, payment.currency)}` : 'Pay'} icon={LockSimple} loading={busy} disabled={!payment} onPress={pay} />
        </Container>
      }
    >
      <Container style={styles.gap}>
        <View style={[styles.banner, { backgroundColor: colors.surface }]}>
          <Flask size={22} color={colors.accent} weight="fill" />
          <AppText variant="subhead" style={styles.fill}>
            Test gateway. No money moves. It stands in for the bank’s card page until live keys are added.
          </AppText>
        </View>
        {payment ? (
          <View>
            <AppText variant="subhead" muted>
              {payment.label}
            </AppText>
            <AppText variant="title" style={styles.tabular}>
              {formatMoney(payment.amount, payment.currency)}
            </AppText>
            <AppText variant="footnote" muted>
              Reference {payment.reference}
            </AppText>
          </View>
        ) : (
          <Bone height={64} />
        )}
        <Field label="Card number" value={card} onChangeText={setCard} keyboardType="number-pad" autoComplete="off" />
        <View style={styles.row}>
          <View style={styles.fill}>
            <Field label="Expiry" value={expiry} onChangeText={setExpiry} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.fill}>
            <Field label="CVC" value={cvc} onChangeText={setCvc} keyboardType="number-pad" secureTextEntry />
          </View>
        </View>
        <View style={styles.hint}>
          <CreditCard size={18} color={colors.textMuted} />
          <AppText variant="footnote" muted style={styles.fill}>
            4242 4242 4242 4242 succeeds. 4000 0000 0000 0002 is declined.
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
  gap: { gap: space.lg },
  fill: { flex: 1 },
  row: { flexDirection: 'row', gap: space.md },
  tabular: { fontVariant: ['tabular-nums'] },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, padding: space.md, borderRadius: radius.control },
  hint: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
