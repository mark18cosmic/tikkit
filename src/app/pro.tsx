import { router } from 'expo-router';
import { ChartLineUp, Crown, Link as LinkIcon, MegaphoneSimple, Percent, RocketLaunch, type Icon } from '@/components/icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { goSignIn, useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { errorFeedback, tapFeedback } from '@/lib/haptics';
import { buyPro } from '@/lib/market';
import { percent } from '@/data/money';
import { isPro } from '@/data/trust';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function ProScreen() {
  const colors = useColors();
  const { session } = useAuth();
  const { status, paymentConfig: cfg } = useAppStore();
  const [plan, setPlan] = useState<1 | 12>(12);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const active = isPro(status);

  const perks: { icon: Icon; title: string; body: string }[] = [
    {
      icon: Percent,
      title: cfg ? `${percent(cfg.proTicketFeeBps)} booking fee instead of ${percent(cfg.ticketFeeBps)}` : 'A lower booking fee',
      body: 'On every paid ticket. Busy organisers save more than the plan costs.',
    },
    { icon: LinkIcon, title: 'Unlimited promoter links', body: 'Free plan: 2 per event. Track every promoter’s sales and pay commission automatically.' },
    { icon: MegaphoneSimple, title: 'Message all your followers', body: 'Announce new events to everyone who follows you, up to 3 times a week.' },
    { icon: ChartLineUp, title: 'Daily sales charts', body: 'See which days and which promoters sell, for every event.' },
    { icon: RocketLaunch, title: '25% off promoted listings', body: 'Put your event in front of everyone on Explore for less.' },
  ];
  const yearly = cfg?.proYearPrice ?? 0;
  const monthly = cfg?.proMonthPrice ?? 0;
  const saving = monthly * 12 - yearly;

  const buy = async () => {
    if (!session) return goSignIn('/pro');
    setFailure(null);
    setBusy(true);
    try {
      const paymentId = await buyPro(plan);
      router.push({ pathname: '/pay/[id]', params: { id: paymentId } });
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Container style={styles.gap}>
        <View style={styles.head}>
          <View style={[styles.crown, { backgroundColor: colors.accent }]}>
            <Crown size={28} color={colors.onAccent} weight="fill" />
          </View>
          <AppText variant="title" accessibilityRole="header">
            Organiser Pro
          </AppText>
          <AppText muted>For people who run events every month.</AppText>
        </View>

        {active && status?.proUntil && (
          <View style={[styles.active, { backgroundColor: colors.surface }]}>
            <AppText variant="headline">You’re on Pro</AppText>
            <AppText variant="subhead" muted>
              Until {formatDate(status.proUntil)}. Buying again adds time to the end.
            </AppText>
          </View>
        )}

        <View style={styles.perks}>
          {perks.map((p) => (
            <View key={p.title} style={styles.perk}>
              <p.icon size={24} color={colors.accent} weight="bold" />
              <View style={styles.fill}>
                <AppText variant="headline">{p.title}</AppText>
                <AppText variant="subhead" muted>
                  {p.body}
                </AppText>
              </View>
            </View>
          ))}
        </View>

        {cfg && (
          <View style={styles.plans} accessibilityRole="radiogroup">
            {([12, 1] as const).map((m) => {
              const selected = plan === m;
              return (
                <Pressable
                  key={m}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    tapFeedback();
                    setPlan(m);
                  }}
                  style={[styles.plan, { borderColor: selected ? colors.accent : colors.border, backgroundColor: colors.elevated }]}
                >
                  <AppText variant="subhead" muted>
                    {m === 12 ? 'Yearly' : 'Monthly'}
                  </AppText>
                  <AppText variant="title3" style={styles.tabular}>
                    {formatMoney(m === 12 ? yearly : monthly)}
                  </AppText>
                  <AppText variant="footnote" color={m === 12 && saving > 0 ? colors.success : colors.textMuted}>
                    {m === 12 && saving > 0 ? `Save ${formatMoney(saving)}` : 'Cancel any time'}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        )}
        <Button label={active ? 'Add more time' : 'Go Pro'} icon={Crown} loading={busy} onPress={buy} />
        <AppText variant="footnote" muted style={styles.center}>
          Doesn’t renew automatically. Pay by card or bank transfer.
        </AppText>
        {failure && (
          <AppText variant="subhead" color={colors.danger}>
            {failure}
          </AppText>
        )}
      </Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: space.lg, paddingBottom: space.xxl },
  gap: { gap: space.lg },
  head: { gap: space.xs },
  crown: { width: 56, height: 56, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  active: { padding: space.md, borderRadius: radius.control, gap: space.xxs },
  perks: { gap: space.md },
  perk: { flexDirection: 'row', gap: space.md },
  fill: { flex: 1 },
  plans: { flexDirection: 'row', gap: space.sm + 4 },
  plan: { flex: 1, padding: space.md, borderRadius: radius.card, borderWidth: 2, gap: space.xxs },
  tabular: { fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
});
