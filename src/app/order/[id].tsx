import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { CheckCircle, Gift } from '@/components/icons';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { SignInRequired } from '@/components/SignInRequired';
import { TicketCard } from '@/components/TicketCard';
import { fetchOrder } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { space } from '@/theme/tokens';
import { useColors, useReduceMotion } from '@/theme/useTheme';
import { enter } from '@/theme/motion';

export default function OrderScreen() {
  return (
    <SignInRequired title="Sign in to see this order" body="Orders are kept in your account.">
      <OrderConfirmed />
    </SignInRequired>
  );
}

function OrderConfirmed() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tickets, getEvent, remindersEnabled } = useAppStore();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const order = tickets.filter((t) => t.orderId === id);
  const load = useCallback(() => fetchOrder(id), [id]);
  const { data: row } = useRemote(load);
  const event = getEvent(row?.event_id ?? order[0]?.eventId ?? '');
  const gift = row?.gift_name ? { name: row.gift_name, email: row.gift_email ?? '' } : null;

  // Not paid yet: finish paying first.
  if (row?.status === 'pending_payment' && row.payment_id) {
    return <Redirect href={{ pathname: '/pay/[id]', params: { id: row.payment_id } }} />;
  }

  const done = () => {
    router.dismissAll();
    router.navigate('/tickets');
  };

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Container style={styles.gap}>
          <Animated.View entering={reduce ? undefined : enter.rise()} style={styles.center}>
            {gift ? <Gift size={72} color={colors.accent} weight="fill" /> : <CheckCircle size={72} color={colors.success} weight="fill" />}
          </Animated.View>
          <Animated.View entering={reduce ? undefined : enter.rise(120)} style={styles.center}>
            <AppText variant="title" accessibilityRole="header" style={styles.textCenter}>
              {gift ? 'Gift sent' : 'You’re going'}
            </AppText>
            <AppText muted style={styles.textCenter}>
              {gift
                ? `The tickets for ${event?.title ?? 'the event'} are in ${gift.name}’s account (${gift.email}). If they don’t have Tikkit yet, they’ll appear when they sign up with that email.`
                : `${order.length} ${order.length === 1 ? 'ticket' : 'tickets'} for ${event?.title ?? 'your event'}. Show the QR code at the door.${
                    remindersEnabled ? ' We’ll remind you the day before and an hour before.' : ''
                  }`}
            </AppText>
          </Animated.View>
          <View style={styles.list}>
            {order.map((t) => (
              <TicketCard key={t.id} ticket={t} />
            ))}
          </View>
        </Container>
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.md), borderColor: colors.border }]}>
        <Container>
          <Button label="View my tickets" onPress={done} />
        </Container>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingVertical: space.xl },
  gap: { gap: space.lg },
  center: { alignItems: 'center', gap: space.sm },
  textCenter: { textAlign: 'center', maxWidth: 420 },
  list: { gap: space.sm + 4 },
  bar: { paddingTop: space.sm + 4, borderTopWidth: StyleSheet.hairlineWidth },
});
