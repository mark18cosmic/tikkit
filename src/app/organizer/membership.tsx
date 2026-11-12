import { router, useLocalSearchParams } from 'expo-router';
import { Crown } from '@/components/icons';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Container } from '@/components/Container';
import { Field } from '@/components/Field';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { SignInRequired } from '@/components/SignInRequired';
import { ListSkeleton } from '@/components/Skeleton';
import { formatMoney } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { fetchMyMembershipPlan, saveMembership, type Membership } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function MembershipScreen() {
  return (
    <SignInRequired title="Sign in to manage memberships" body="Only the account that runs an organiser page can set up its membership.">
      <EditMembership />
    </SignInRequired>
  );
}

function EditMembership() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => fetchMyMembershipPlan(id), [id]);
  const { data } = useRemote(load);
  if (data === undefined) return <Container><ListSkeleton rows={3} /></Container>;
  return <MembershipForm organizerId={id} existing={data} />;
}

function MembershipForm({ organizerId: id, existing: data }: { organizerId: string; existing: Membership | null }) {
  const colors = useColors();
  const { paymentConfig: cfg, status } = useAppStore();
  const [name, setName] = useState(data?.name ?? '');
  const [perks, setPerks] = useState(data?.perks ?? 'Tickets before everyone else, and member prices.');
  const [price, setPrice] = useState(data ? String(data.price / 100) : '500');
  const [period, setPeriod] = useState<'month' | 'year'>(data?.period ?? 'year');
  const [discount, setDiscount] = useState(data?.discountPct ?? 10);
  const [active, setActive] = useState(data?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const laari = Math.round(Number(price.replace(',', '.')) * 100);
  const valid = name.trim().length >= 2 && Number.isFinite(laari) && laari >= 100;
  const net = cfg && valid ? laari - Math.round((laari * cfg.membershipFeeBps) / 10000) : 0;

  const save = async () => {
    setFailure(null);
    if (!valid) return errorFeedback();
    setBusy(true);
    try {
      await saveMembership(id, { name: name.trim(), perks: perks.trim(), price: laari, period, discountPct: discount, active });
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
          <Button label={data ? 'Save membership' : 'Start membership'} icon={Crown} loading={busy} disabled={!valid} onPress={save} />
        </Container>
      }
    >
      <Container style={styles.gap}>
        <View style={styles.gapSm}>
          <AppText variant="title2" accessibilityRole="header">
            Your membership
          </AppText>
          <AppText muted>
            Fans pay once a month or year. They get your members-only presales and a standing discount. You get steady income between events.
          </AppText>
        </View>
        {!status?.verified && (
          <AppText variant="subhead" color={colors.danger}>
            Get verified before selling memberships.
          </AppText>
        )}
        <Field label="Name" value={name} onChangeText={setName} placeholder="Insiders" autoCapitalize="words" />
        <Field label="What members get" value={perks} onChangeText={setPerks} multiline maxLength={500} style={styles.multi} />
        <View style={styles.row}>
          <View style={styles.fill}>
            <Field label="Price (MVR)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
          </View>
          <View style={styles.fill}>
            <AppText variant="subhead" style={styles.bold}>
              Every
            </AppText>
            <View style={[styles.chips, styles.chipsTop]}>
              <Chip label="Month" selected={period === 'month'} onPress={() => setPeriod('month')} />
              <Chip label="Year" selected={period === 'year'} onPress={() => setPeriod('year')} />
            </View>
          </View>
        </View>
        <AppText variant="subhead" style={styles.bold}>
          Member discount on tickets
        </AppText>
        <View style={styles.chips}>
          {[0, 5, 10, 15, 20].map((d) => (
            <Chip key={d} label={d === 0 ? 'None' : `${d}%`} selected={discount === d} onPress={() => setDiscount(d)} />
          ))}
        </View>
        <View style={[styles.toggle, { backgroundColor: colors.surface }]}>
          <View style={styles.fill}>
            <AppText variant="headline">Open to new members</AppText>
            <AppText variant="subhead" muted>
              Existing members keep their benefits until they expire.
            </AppText>
          </View>
          <Switch value={active} onValueChange={setActive} trackColor={{ true: colors.accent }} thumbColor="#FFFFFF" accessibilityLabel="Open to new members" />
        </View>
        {valid && (
          <AppText variant="footnote" muted>
            Members pay {formatMoney(laari)} a {period}. You get about {formatMoney(net)} of it after Tikkit’s {cfg ? cfg.membershipFeeBps / 100 : 10}% fee, available a week after each payment.
          </AppText>
        )}
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
  row: { flexDirection: 'row', gap: space.md },
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chipsTop: { marginTop: space.xs + 2 },
  multi: { minHeight: 80, textAlignVertical: 'top' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.control },
});
