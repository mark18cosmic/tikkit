import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CalendarX, CheckCircle, Info, LockSimple, MagnifyingGlass, PencilSimple, QrCode, X } from 'phosphor-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { usePullRefresh } from '@/components/PullRefresh';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { Addons } from '@/components/dashboard/Addons';
import { Announcements } from '@/components/dashboard/Announcements';
import { Boost, Broadcast, Promoters } from '@/components/dashboard/Grow';
import { Presale } from '@/components/dashboard/Presale';
import { Sales } from '@/components/dashboard/Sales';
import { Seating } from '@/components/dashboard/Seating';
import { PromoCodes } from '@/components/dashboard/PromoCodes';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { IconButton } from '@/components/IconButton';
import { SignInRequired } from '@/components/SignInRequired';
import { Stat, StatRow } from '@/components/Stat';
import { addStaff, fetchStaff, removeStaff } from '@/lib/api';
import { fetchEventSales } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { isEmail, useAuth } from '@/lib/auth';
import { formatAmount, formatTime, formatWhen } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { eventStats } from '@/lib/stats';
import { useGuestList } from '@/lib/useGuestList';
import { useLayout } from '@/lib/useLayout';
import { ticketStatus, useAppStore } from '@/store/AppStore';
import { minTouchTarget, radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function DashboardScreen() {
  return (
    <SignInRequired title="Sign in to see this event" body="Dashboards are for the organiser and their door staff.">
      <EventDashboard />
    </SignInRequired>
  );
}

function EventDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getEvent, checkIn, loadEvent } = useAppStore();
  const { userId } = useAuth();
  const colors = useColors();
  const { isWide } = useLayout();
  const [query, setQuery] = useState('');
  const [checking, setChecking] = useState<string | null>(null);
  const event = getEvent(id);
  const { tickets, staffFor, revenue, loading, error, reload } = useGuestList([id]);
  const isOwner = !!event && event.ownerId === userId;

  const loadSales = useCallback(() => (isOwner ? fetchEventSales(id) : Promise.resolve(null)), [id, isOwner]);
  const sales = useRemote(loadSales);
  const reloadSales = sales.reload;
  const reloadAll = useCallback(
    () => Promise.all([reload(), loadEvent(id).catch(() => null), reloadSales()]),
    [reload, loadEvent, id, reloadSales],
  );
  const refresh = usePullRefresh(reloadAll, { failed: !!error });

  const guests = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets
      .filter((t) => t.eventId === id && !t.transferredTo)
      .filter((t) => !q || t.holderName.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))
      .sort((a, b) => a.holderName.localeCompare(b.holderName));
  }, [tickets, id, query]);

  if (!event || (loading && tickets.length === 0 && !isOwner)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  if (!isOwner && !staffFor.includes(id)) {
    return (
      <EmptyState
        icon={LockSimple}
        title="Not your event"
        body="Only the organiser and the door staff they add can see sales and guests."
      />
    );
  }
  const s = eventStats(event, tickets, revenue);

  const manualCheckIn = async (code: string) => {
    setChecking(code);
    try {
      const r = await checkIn(code);
      if (r.status === 'admitted') successFeedback();
      else errorFeedback();
    } catch {
      errorFeedback();
    } finally {
      setChecking(null);
      reload();
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      refreshControl={refresh.control}
      onScroll={refresh.onScroll}
      scrollEventThrottle={refresh.scrollEventThrottle}
    >
      <Stack.Screen options={{ title: event.title }} />
      <Container wide={isWide} style={styles.gap}>
        <View>
          <AppText variant="title2" accessibilityRole="header">
            {event.title}
          </AppText>
          <AppText variant="subhead" muted>
            {formatWhen(event.startsAt)}, {event.venue.name}
          </AppText>
        </View>

        {isOwner && event.listing !== 'approved' && (
          <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: event.listing === 'rejected' ? colors.danger : colors.accent }]}>
            <Info size={20} color={event.listing === 'rejected' ? colors.danger : colors.accent} weight="fill" />
            <View style={styles.fill}>
              <AppText variant="headline">
                {event.listing === 'draft' ? 'Draft: get verified to publish' : event.listing === 'pending' ? 'Waiting for review' : 'Changes needed'}
              </AppText>
              <AppText variant="subhead" muted>
                {event.listing === 'draft'
                  ? 'Only you can see this event. Once you’re verified it goes to review by itself.'
                  : event.listing === 'pending'
                    ? 'Usually within a few hours. Nobody can buy tickets until it’s approved.'
                    : `${event.reviewNote ?? ''} Edit the event and it goes back for review.`}
              </AppText>
              {event.listing === 'draft' && <Button label="Get verified" variant="secondary" onPress={() => router.push('/verify')} style={styles.bannerBtn} />}
            </View>
          </View>
        )}
        {isOwner && event.payoutHold && (
          <AppText variant="subhead" color={colors.danger}>
            Payouts for this event are on hold while our team looks into reports.
          </AppText>
        )}

        <StatRow>
          <Stat label="Sold" value={String(s.sold)} />
          <Stat label="Checked in" value={s.sold ? `${s.checkedIn} of ${s.sold}` : '0'} />
          <Stat label="Revenue" value={formatAmount(s.revenue, event.currency)} />
          <Stat label="Refund requests" value={String(s.refunds)} />
        </StatRow>

        <Button label="Scan tickets" icon={QrCode} onPress={() => router.push('/scan')} />
        {isOwner && event.status !== 'cancelled' && new Date(event.endsAt) > new Date() && (
          <View style={styles.ownerActions}>
            <Button
              label="Edit event"
              icon={PencilSimple}
              variant="secondary"
              onPress={() => router.push({ pathname: '/organiser/edit/[id]', params: { id: event.id } })}
              style={styles.fill}
            />
            <Button
              label="Cancel event"
              icon={CalendarX}
              variant="secondary"
              onPress={() => router.push({ pathname: '/organiser/cancel/[id]', params: { id: event.id } })}
              style={styles.fill}
            />
          </View>
        )}
        {event.status === 'cancelled' && (
          <AppText variant="subhead" color={colors.danger} style={styles.bold}>
            Cancelled. {event.notice}
          </AppText>
        )}

        {error && (
          <AppText variant="subhead" color={colors.danger}>
            {error}
          </AppText>
        )}

        <View style={styles.section}>
          <AppText variant="title3" accessibilityRole="header">
            By ticket type
          </AppText>
          {event.tiers.map((t) => (
            <View key={t.id} style={[styles.tier, { borderColor: colors.border }]}>
              <AppText style={styles.fill}>{t.name}</AppText>
              <AppText muted style={styles.tabular}>
                {t.sold} sold of {t.capacity}
              </AppText>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <AppText variant="title3" accessibilityRole="header">
            Guest list
          </AppText>
          <View style={[styles.search, { backgroundColor: colors.surface }]}>
            <MagnifyingGlass size={20} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or code"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Search guests"
              autoCorrect={false}
              style={[styles.fill, type.body, { color: colors.text, paddingVertical: space.sm }]}
            />
          </View>
          {guests.length === 0 ? (
            <AppText variant="subhead" muted>
              {query ? 'No guest matches that.' : 'No tickets sold yet.'}
            </AppText>
          ) : (
            guests.map((g) => {
              const state = ticketStatus(g);
              const tier = event.tiers.find((t) => t.id === g.tierId);
              return (
                <View key={g.id} style={[styles.guest, { borderColor: colors.border }]}>
                  <View style={styles.fill}>
                    <AppText variant="headline">{g.holderName}</AppText>
                    <AppText variant="subhead" muted>
                      {tier?.name}, {g.code}
                    </AppText>
                  </View>
                  {state === 'active' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Check in ${g.holderName}`}
                      accessibilityState={{ busy: checking === g.code }}
                      disabled={checking !== null}
                      onPress={() => manualCheckIn(g.code)}
                      style={({ pressed }) => [styles.checkBtn, { backgroundColor: colors.accent }, pressed && { opacity: 0.8 }]}
                    >
                      {checking === g.code ? (
                        <ActivityIndicator size="small" color={colors.onAccent} />
                      ) : (
                        <AppText variant="subhead" color={colors.onAccent} style={styles.bold}>
                          Check in
                        </AppText>
                      )}
                    </Pressable>
                  ) : state === 'checkedIn' ? (
                    <View style={styles.inRow}>
                      <CheckCircle size={18} color={colors.success} weight="fill" />
                      <AppText variant="subhead" color={colors.success} style={styles.bold}>
                        In at {formatTime(g.checkedInAt!)}
                      </AppText>
                    </View>
                  ) : (
                    <AppText variant="subhead" muted>
                      Refund requested
                    </AppText>
                  )}
                </View>
              );
            })
          )}
        </View>

        {isOwner && sales.data && <Sales event={event} sales={sales.data} onChange={reloadSales} />}
        <Announcements eventId={event.id} canPost={isOwner && event.status !== 'cancelled'} />
        {isOwner && event.status !== 'cancelled' && new Date(event.startsAt) > new Date() && <Presale event={event} />}
        {isOwner && event.status !== 'cancelled' && new Date(event.startsAt) > new Date() && <Seating event={event} />}
        <Addons eventId={event.id} startsAt={event.startsAt} currency={event.currency} editable={isOwner && event.status !== 'cancelled' && new Date(event.startsAt) > new Date()} />
        {isOwner && <PromoCodes eventId={event.id} />}
        {isOwner && sales.data && event.status !== 'cancelled' && <Promoters event={event} promoters={sales.data.promoters} onChange={reloadSales} />}
        {isOwner && event.status !== 'cancelled' && new Date(event.startsAt) > new Date() && <Boost event={event} />}
        {isOwner && event.status !== 'cancelled' && <Broadcast event={event} />}
        {isOwner && <DoorStaff eventId={event.id} />}
      </Container>
    </ScrollView>
  );
}

// People the organiser trusts to scan tickets. Invited by email; they sign in
// with that email to get access.
function DoorStaff({ eventId }: { eventId: string }) {
  const colors = useColors();
  const [staff, setStaff] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    fetchStaff(eventId).then(setStaff, () => {});
  }, [eventId]);

  const add = async () => {
    setFailure(null);
    if (!isEmail(email)) {
      errorFeedback();
      setFailure('Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      await addStaff(eventId, email);
      setStaff(await fetchStaff(eventId));
      setEmail('');
      successFeedback();
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (who: string) => {
    try {
      await removeStaff(eventId, who);
      setStaff((list) => list.filter((x) => x !== who));
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    }
  };

  return (
    <View style={styles.section}>
      <AppText variant="title3" accessibilityRole="header">
        Door staff
      </AppText>
      <AppText variant="subhead" muted>
        They can scan tickets and see the guest list for this event after signing in with this email.
      </AppText>
      {staff.map((who) => (
        <View key={who} style={[styles.guest, { borderColor: colors.border }]}>
          <AppText style={styles.fill} numberOfLines={1}>
            {who}
          </AppText>
          <IconButton icon={X} accessibilityLabel={`Remove ${who}`} onPress={() => remove(who)} />
        </View>
      ))}
      <Field
        label="Add by email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={add}
        error={failure ?? undefined}
      />
      <Button label="Add door staff" variant="secondary" loading={busy} onPress={add} />
    </View>
  );
}

const styles = StyleSheet.create({
  ownerActions: { flexDirection: 'row', gap: space.sm },
  banner: { flexDirection: 'row', gap: space.sm + 4, padding: space.md, borderRadius: radius.control, borderLeftWidth: 4 },
  bannerBtn: { alignSelf: 'flex-start', marginTop: space.sm },
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bold: { fontWeight: '600' },
  tabular: { fontVariant: ['tabular-nums'] },
  scroll: { paddingVertical: space.lg },
  gap: { gap: space.xl },
  section: { gap: space.sm },
  tier: { flexDirection: 'row', paddingVertical: space.sm + 4, borderBottomWidth: StyleSheet.hairlineWidth },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: minTouchTarget,
    borderRadius: radius.control,
    paddingHorizontal: space.md - 4,
  },
  guest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkBtn: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, justifyContent: 'center' },
  inRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
