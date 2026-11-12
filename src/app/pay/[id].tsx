import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Bank, CheckCircle, ClockCountdown, Copy, CreditCard, ShieldCheck, XCircle, type Icon } from 'phosphor-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { useNow } from '@/components/home/HomeCards';
import { SignInRequired } from '@/components/SignInRequired';
import { Bone } from '@/components/Skeleton';
import { bankFor, paymentStatusLabel, type Payment } from '@/data/money';
import { confirm } from '@/lib/confirm';
import { formatMoney } from '@/lib/format';
import { errorFeedback, successFeedback, tapFeedback } from '@/lib/haptics';
import { cancelPayment, choosePaymentMethod, fetchPayment, gatewayCall, refreshPaymentStatus } from '@/lib/market';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';
import { enter } from '@/theme/motion';

export default function PayScreen() {
  return (
    <SignInRequired title="Sign in to pay" body="Payments are tied to your account so your tickets land in the right place.">
      <Pay />
    </SignInRequired>
  );
}

// Where to go once a payment has done its job.
function destination(p: Payment): Href {
  switch (p.purpose) {
    case 'order':
      return p.orderId ? { pathname: '/order/[id]', params: { id: p.orderId } } : '/tickets';
    case 'booking':
      return p.bookingId ? { pathname: '/bookings/[id]', params: { id: p.bookingId } } : '/organiser';
    case 'resale':
      return '/tickets';
    case 'subscription':
      return '/pro';
    default:
      return '/organiser';
  }
}

function remaining(ms: number) {
  if (ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m}:${String(s).padStart(2, '0')}`;
}

function Pay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { paymentConfig: cfg, afterPayment } = useAppStore();
  const now = useNow(1000);
  const [payment, setPayment] = useState<Payment | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const settled = useRef(false);

  const load = useCallback(async () => {
    try {
      await refreshPaymentStatus(id).catch(() => null);
      const p = await fetchPayment(id);
      setPayment(p);
      if (p?.status === 'paid' && !settled.current) {
        settled.current = true;
        successFeedback();
        afterPayment().catch(() => {});
      }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    }
  }, [id, afterPayment]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // While waiting on the bank, check now and then.
  const waiting = payment?.status === 'pending' && !!payment.method;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(load, payment?.method === 'transfer' ? 15_000 : 5_000);
    return () => clearInterval(t);
  }, [waiting, payment?.method, load]);

  if (payment === undefined) {
    return (
      <Container style={styles.loading}>
        <Bone width="40%" height={14} />
        <Bone width="60%" height={40} />
        <Bone height={72} />
        <Bone height={72} />
      </Container>
    );
  }
  if (!payment) {
    return <EmptyState icon={XCircle} title="Payment not found" body="It may belong to another account." action={{ label: 'Go to Explore', onPress: () => router.replace('/') }} />;
  }

  const left = new Date(payment.expiresAt).getTime() - now.getTime();
  const pending = payment.status === 'pending';
  // Transfers go to Tikkit's account in the payment's currency, when there is one.
  const bank = cfg ? bankFor(cfg, payment.currency) : undefined;

  const choose = async (method: 'card' | 'transfer') => {
    setFailure(null);
    setBusy(method);
    try {
      await choosePaymentMethod(payment.id, method);
      await load();
      if (method === 'card') await payByCard();
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const payByCard = async () => {
    setFailure(null);
    if (cfg?.provider === 'mock') {
      router.push({ pathname: '/pay/gateway/[id]', params: { id: payment.id } });
      return;
    }
    setBusy('card');
    try {
      const returnUrl = Linking.createURL('pay/return', { queryParams: { id: payment.id } });
      const { url } = await gatewayCall({ action: 'start', paymentId: payment.id, returnUrl });
      if (!url) throw new Error('The card gateway didn’t respond. Try again.');
      await WebBrowser.openAuthSessionAsync(url, returnUrl);
      await gatewayCall({ action: 'verify', paymentId: payment.id }).catch(() => null);
      await load();
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const abandon = () =>
    confirm('Cancel this checkout?', 'Whatever you were buying goes back on sale.', 'Cancel checkout', async () => {
      await cancelPayment(payment.id).catch(() => {});
      if (router.canGoBack()) router.back();
      else router.replace('/');
    });

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Container style={styles.gap}>
        <View style={styles.head}>
          <AppText variant="subhead" muted numberOfLines={2}>
            {payment.label}
          </AppText>
          <AppText variant="largeTitle" style={styles.tabular} accessibilityLabel={`Amount ${formatMoney(payment.amount, payment.currency)}`}>
            {formatMoney(payment.amount, payment.currency)}
          </AppText>
          {pending && (
            <View style={[styles.timer, { backgroundColor: left < 5 * 60_000 ? colors.accent : colors.surface }]}>
              <ClockCountdown size={16} color={left < 5 * 60_000 ? colors.onAccent : colors.text} weight="bold" />
              <AppText variant="subhead" color={left < 5 * 60_000 ? colors.onAccent : colors.text} style={[styles.bold, styles.tabular]}>
                Held for {remaining(left)}
              </AppText>
            </View>
          )}
        </View>

        {payment.status === 'paid' && (
          <Animated.View entering={enter.rise()} style={[styles.result, { backgroundColor: colors.surface }]}>
            <CheckCircle size={44} color={colors.success} weight="fill" />
            <AppText variant="title2">Paid</AppText>
            <AppText muted style={styles.center}>
              Reference {payment.reference}. A receipt is in your notifications.
            </AppText>
            <Button label="Continue" onPress={() => router.replace(destination(payment))} style={styles.wide} />
          </Animated.View>
        )}

        {!pending && payment.status !== 'paid' && (
          <View style={[styles.result, { backgroundColor: colors.surface }]}>
            <XCircle size={44} color={payment.status === 'refunded' || payment.status === 'refund_due' ? colors.text : colors.danger} weight="fill" />
            <AppText variant="title2">{paymentStatusLabel[payment.status]}</AppText>
            <AppText muted style={styles.center}>
              {payment.status === 'expired'
                ? 'The hold ran out before the payment arrived, so it went back on sale. If you already paid, it will be refunded in full.'
                : payment.status === 'refund_due'
                  ? payment.note || 'Your money is on its way back, usually within 5 working days.'
                  : payment.status === 'refunded'
                    ? 'This payment was refunded.'
                    : 'This checkout was cancelled. Nothing was charged.'}
            </AppText>
            <Button label="Done" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.wide} />
          </View>
        )}

        {pending && !payment.method && (
          <Animated.View entering={enter.fade()} style={styles.gapSm}>
            <AppText variant="title3" accessibilityRole="header">
              How would you like to pay?
            </AppText>
            {cfg?.card !== false && (
              <MethodCard
                icon={CreditCard}
                title="Card"
                body={cfg?.provider === 'mock' ? 'Test mode: no real money moves.' : 'Visa, Mastercard or Amex on Bank of Maldives’ secure page.'}
                badge="Instant"
                busy={busy === 'card'}
                onPress={() => choose('card')}
              />
            )}
            {bank && payment.purpose !== 'resale' && (
              <MethodCard
                icon={Bank}
                title="Bank transfer"
                body="Transfer from any Maldivian bank. We match it by hand, usually within a few hours."
                busy={busy === 'transfer'}
                onPress={() => choose('transfer')}
              />
            )}
          </Animated.View>
        )}

        {pending && payment.method === 'card' && (
          <View style={styles.gapSm}>
            <AppText variant="subhead" muted>
              Pay on the bank’s secure page. Your tickets appear here as soon as it confirms.
            </AppText>
            <Button label={`Pay ${formatMoney(payment.amount, payment.currency)} by card`} icon={CreditCard} loading={busy === 'card'} onPress={payByCard} />
            {bank && payment.purpose !== 'resale' && (
              <Button label="Pay by bank transfer instead" variant="plain" onPress={() => choose('transfer')} />
            )}
          </View>
        )}

        {pending && payment.method === 'transfer' && bank && <TransferDetails payment={payment} bank={bank} onCard={() => choose('card')} cardAvailable={!!cfg?.card} />}

        {failure && (
          <AppText variant="subhead" color={colors.danger} accessibilityLiveRegion="polite">
            {failure}
          </AppText>
        )}

        <View style={[styles.trust, { borderColor: colors.border }]}>
          <ShieldCheck size={20} color={colors.success} weight="fill" />
          <AppText variant="footnote" muted style={styles.fill}>
            You’re paying Tikkit, not the seller. The money is held until the event happens, and refunded if it’s cancelled.
          </AppText>
        </View>

        {pending && <Button label="Cancel checkout" variant="plain" onPress={abandon} />}
      </Container>
    </ScrollView>
  );
}

function MethodCard({ icon: IconCmp, title, body, badge, busy, onPress }: { icon: Icon; title: string; body: string; badge?: string; busy?: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityState={{ busy }}
      disabled={busy}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [styles.method, { backgroundColor: colors.elevated, borderColor: colors.border }, pressed && styles.pressed]}
    >
      <View style={[styles.methodIcon, { backgroundColor: colors.surface }]}>
        <IconCmp size={22} color={colors.text} />
      </View>
      <View style={styles.fill}>
        <View style={styles.methodTitle}>
          <AppText variant="headline">{title}</AppText>
          {badge && (
            <AppText variant="caption" color={colors.success} style={styles.bold}>
              {badge}
            </AppText>
          )}
        </View>
        <AppText variant="subhead" muted>
          {busy ? 'One moment…' : body}
        </AppText>
      </View>
    </Pressable>
  );
}

function TransferDetails({
  payment,
  bank,
  onCard,
  cardAvailable,
}: {
  payment: Payment;
  bank: { name: string; accountName: string; accountNumber: string };
  onCard: () => void;
  cardAvailable: boolean;
}) {
  const colors = useColors();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value).catch(() => false);
    successFeedback();
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 1800);
  };
  const lines: { label: string; value: string; copyValue?: string }[] = [
    { label: 'Bank', value: bank.name },
    { label: 'Account name', value: bank.accountName },
    { label: 'Account number', value: bank.accountNumber, copyValue: bank.accountNumber },
    { label: 'Amount', value: formatMoney(payment.amount, payment.currency), copyValue: (payment.amount / 100).toFixed(2) },
    { label: 'Remarks', value: payment.reference, copyValue: payment.reference },
  ];
  return (
    <View style={styles.gapSm}>
      <AppText variant="title3" accessibilityRole="header">
        Transfer these exact details
      </AppText>
      <View style={[styles.details, { backgroundColor: colors.surface }]}>
        {lines.map((l, i) => (
          <View key={l.label} style={[styles.detailRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
            <View style={styles.fill}>
              <AppText variant="footnote" muted>
                {l.label}
              </AppText>
              <AppText variant="headline" selectable style={l.label === 'Remarks' ? { color: colors.accent } : undefined}>
                {l.value}
              </AppText>
            </View>
            {l.copyValue && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Copy ${l.label}`}
                hitSlop={8}
                onPress={() => copy(l.label, l.copyValue!)}
                style={({ pressed }) => [styles.copy, { backgroundColor: colors.background }, pressed && { opacity: 0.6 }]}
              >
                {copied === l.label ? <CheckCircle size={18} color={colors.success} weight="fill" /> : <Copy size={18} color={colors.text} />}
              </Pressable>
            )}
          </View>
        ))}
      </View>
      <AppText variant="subhead">
        Put <AppText variant="subhead" style={styles.bold}>{payment.reference}</AppText> in the remarks so we can match it. There’s no slip to send: we check the bank statement and your order updates by itself.
      </AppText>
      {cardAvailable && <Button label="Pay by card instead" variant="plain" onPress={onCard} />}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: space.lg, paddingBottom: space.xxl },
  loading: { gap: space.md, paddingTop: space.lg },
  gap: { gap: space.lg },
  gapSm: { gap: space.sm + 4 },
  head: { gap: space.xs, alignItems: 'flex-start' },
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  tabular: { fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
  wide: { alignSelf: 'stretch', marginTop: space.sm },
  timer: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, paddingHorizontal: space.sm + 4, paddingVertical: space.xs + 2, borderRadius: radius.pill, marginTop: space.xs },
  result: { alignItems: 'center', gap: space.sm, padding: space.lg, borderRadius: radius.card },
  method: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth },
  methodIcon: { width: 44, height: 44, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  methodTitle: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  details: { borderRadius: radius.control, overflow: 'hidden' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm + 4 },
  copy: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  trust: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
});
