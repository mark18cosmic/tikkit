import { router } from 'expo-router';
import { CalendarCheck, Crown, SealCheck, Star, Ticket, type Icon } from '@/components/icons';
import { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { Stars } from './Stars';
import { goSignIn, useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { ask, toast } from '@/lib/dialog';
import { buyMembership, cancelMembership, fetchMembershipExitTerms, fetchMyOrganizerReview, reviewOrganizer, type Membership, type OrganizerTrust } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// What a buyer wants to know before paying a stranger: are they real, have
// they run events before, did people like them.
export function TrustStats({ t, compact }: { t: OrganizerTrust; compact?: boolean }) {
  const colors = useColors();
  const year = t.since ? new Date(t.since).getFullYear() : undefined;
  const items: { icon: Icon; value: string; label: string; tint?: string }[] = [
    ...(t.verified ? [{ icon: SealCheck, value: 'Verified', label: 'ID checked', tint: colors.accent }] : []),
    ...(t.rating != null ? [{ icon: Star, value: t.rating.toFixed(1), label: `${t.reviews} ${t.reviews === 1 ? 'review' : 'reviews'}` }] : []),
    t.eventsRun === 0
      ? { icon: CalendarCheck, value: 'New', label: 'first events' }
      : { icon: CalendarCheck, value: String(t.eventsRun), label: t.eventsRun === 1 ? 'event run' : 'events run' },
    ...(!compact && t.ticketsSold > 0 ? [{ icon: Ticket, value: t.ticketsSold.toLocaleString('en-GB'), label: 'tickets sold' }] : []),
  ];
  return (
    <View style={styles.statsWrap}>
      <View style={[styles.stats, { backgroundColor: colors.surface }]}>
        {items.map((it, i) => (
          <View key={it.label} style={[styles.stat, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
            <View style={styles.statTop}>
              <it.icon size={16} color={it.tint ?? colors.text} weight="fill" />
              <AppText variant="headline" color={it.tint} style={styles.tabular}>
                {it.value}
              </AppText>
            </View>
            <AppText variant="caption" muted numberOfLines={1}>
              {it.label}
            </AppText>
          </View>
        ))}
      </View>
      {!compact && (year || t.cancelled > 0) && (
        <AppText variant="footnote" muted>
          {year ? `On Tikkit since ${year}.` : ''}
          {t.cancelled > 0 ? ` ${t.cancelled} cancelled, everyone refunded.` : ''}
        </AppText>
      )}
    </View>
  );
}

// Join an organiser's membership: presale access and member prices.
export function MembershipCard({ organizerId, membership, members, mine }: { organizerId: string; membership: Membership; members: number; mine: boolean }) {
  const colors = useColors();
  const { session } = useAuth();
  const { memberOf, refreshStatus } = useAppStore();
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const until = memberOf[organizerId];

  // Says plainly what leaving costs before doing it: a refund within 7 days if
  // no perks were used, otherwise it just ends.
  const leave = async () => {
    setFailure(null);
    setLeaving(true);
    try {
      const terms = await fetchMembershipExitTerms(organizerId);
      const ok = await ask({
        title: `Leave ${membership.name}?`,
        body:
          terms.refund > 0
            ? `You joined within the last 7 days and haven’t used a member perk yet, so you’ll get ${formatMoney(terms.refund)} back in full.`
            : `Your member prices and early access end straight away. Memberships don’t renew on their own, so you won’t be charged again either way. There’s no refund after 7 days or once you’ve used a member perk.`,
        action: terms.refund > 0 ? 'Leave and get a refund' : 'Leave membership',
        cancel: 'Stay a member',
        tone: 'danger',
      });
      if (!ok) return;
      const { refund } = await cancelMembership(organizerId);
      successFeedback();
      toast(refund > 0 ? `You’ve left. ${formatMoney(refund)} is on its way back to you.` : 'You’ve left the membership.');
      await refreshStatus();
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setLeaving(false);
    }
  };
  const join = async () => {
    if (!session) return goSignIn();
    setFailure(null);
    setBusy(true);
    try {
      const paymentId = await buyMembership(membership.id);
      router.push({ pathname: '/pay/[id]', params: { id: paymentId } });
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.member, { backgroundColor: colors.elevated, borderColor: until ? colors.success : colors.accent }]}>
      <View style={styles.row}>
        <View style={[styles.crown, { backgroundColor: until ? colors.success : colors.accent }]}>
          <Crown size={18} color={colors.onAccent} weight="fill" />
        </View>
        <View style={styles.fill}>
          <AppText variant="headline">{membership.name}</AppText>
          <AppText variant="subhead" muted>
            {formatMoney(membership.price)} a {membership.period}
            {members > 0 ? `, ${members} ${members === 1 ? 'member' : 'members'}` : ''}
          </AppText>
        </View>
      </View>
      {!!membership.perks && <AppText variant="subhead">{membership.perks}</AppText>}
      {mine ? (
        <Button label="Edit membership" variant="secondary" onPress={() => router.push({ pathname: '/organizer/membership', params: { id: organizerId } })} />
      ) : until ? (
        <View style={styles.memberRow}>
          <AppText variant="subhead" color={colors.success} style={[styles.bold, styles.fill]}>
            You’re a member until {formatDate(until)}
          </AppText>
          <Button label="Leave" variant="plain" loading={leaving} onPress={leave} style={styles.leave} />
        </View>
      ) : (
        <Button label="Become a member" icon={Crown} loading={busy} onPress={join} />
      )}
      {failure && (
        <AppText variant="footnote" color={colors.danger}>
          {failure}
        </AppText>
      )}
    </View>
  );
}

// After an event they were checked in at, people can rate the organiser.
export function RateOrganizer({ eventId, organizer }: { eventId: string; organizer: string }) {
  const colors = useColors();
  const load = useCallback(() => fetchMyOrganizerReview(eventId), [eventId]);
  const { data, reload } = useRemote(load);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  if (data === undefined) return null;
  if (data) {
    return (
      <View style={[styles.rate, { backgroundColor: colors.surface }]}>
        <AppText variant="subhead" muted>
          You rated {organizer}
        </AppText>
        <Stars value={data.rating} />
      </View>
    );
  }
  const send = async () => {
    setFailure(null);
    setBusy(true);
    try {
      await reviewOrganizer(eventId, rating, body);
      successFeedback();
      reload();
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.rate, { backgroundColor: colors.surface }]}>
      <AppText variant="headline">How was it?</AppText>
      <AppText variant="subhead" muted>
        Your rating helps other people trust {organizer}, or steer clear.
      </AppText>
      <Stars value={rating} size={28} onChange={setRating} />
      {rating > 0 && (
        <>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="What went well, what didn’t (optional)"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Your review"
            multiline
            maxLength={500}
            style={[styles.input, type.subhead, { color: colors.text, backgroundColor: colors.background }]}
          />
          <Button label="Post rating" loading={busy} onPress={send} />
        </>
      )}
      {failure && (
        <AppText variant="footnote" color={colors.danger}>
          {failure}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statsWrap: { gap: space.xs + 2 },
  stats: { flexDirection: 'row', borderRadius: radius.control, paddingVertical: space.sm + 4 },
  stat: { flex: 1, alignItems: 'center', gap: space.xxs, paddingHorizontal: space.xs },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  tabular: { fontVariant: ['tabular-nums'] },
  member: { padding: space.md, borderRadius: radius.card, borderWidth: 1.5, gap: space.sm + 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4 },
  crown: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  leave: { minHeight: 0, paddingVertical: space.xs, paddingHorizontal: space.sm },
  rate: { padding: space.md, borderRadius: radius.card, gap: space.sm },
  input: { minHeight: 72, borderRadius: radius.control, padding: space.sm + 4, textAlignVertical: 'top' },
});
