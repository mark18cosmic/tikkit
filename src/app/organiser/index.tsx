import { router } from 'expo-router';
import { Buildings, CaretRight, ClockCountdown, MagnifyingGlass, Plus, QrCode, SealCheck, UsersThree, Wallet } from '@/components/icons';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Cover } from '@/components/Cover';
import { usePullRefresh } from '@/components/PullRefresh';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { SignInRequired } from '@/components/SignInRequired';
import { Stat, StatRow } from '@/components/Stat';
import type { EventItem } from '@/data/events';
import type { Ticket } from '@/data/tickets';
import { BookingLine, ListGroup, VenueLine } from '@/components/VenueCards';
import type { Organizer } from '@/data/community';
import type { Booking, Venue } from '@/data/venues';
import { fetchBookings, fetchMyOrganizers, fetchMyVenues } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatAmount, formatWhen } from '@/lib/format';
import { eventStats } from '@/lib/stats';
import { useGuestList } from '@/lib/useGuestList';
import { useLayout } from '@/lib/useLayout';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function OrganiserScreen() {
  return (
    <SignInRequired title="Sign in to run events" body="Create events, follow sales and check guests in at the door.">
      <OrganiserHome />
    </SignInRequired>
  );
}

function OrganiserHome() {
  const { events, status } = useAppStore();
  const { userId } = useAuth();
  const colors = useColors();
  const { isWide } = useLayout();
  const now = new Date();
  const mine = events.filter((e) => e.ownerId === userId);
  const { tickets, staffFor, revenue, error, reload } = useGuestList(mine.map((e) => e.id));
  const staffing = events.filter((e) => staffFor.includes(e.id) && e.ownerId !== userId);
  const loadSpaces = useCallback(async () => {
    if (!userId) return { venues: [] as Venue[], bookings: [] as Booking[], organizers: [] as Organizer[] };
    const [venues, bookings, organizers] = await Promise.all([fetchMyVenues(userId), fetchBookings(), fetchMyOrganizers(userId)]);
    return { venues, bookings, organizers };
  }, [userId]);
  const spaces = useRemote(loadSpaces);
  const myVenues = spaces.data?.venues ?? [];
  const allBookings = spaces.data?.bookings ?? [];
  // Requests for my spaces that need an answer, and spaces I've asked for.
  const toAnswer = allBookings.filter(
    (b) => b.status === 'pending' && b.requesterId !== userId && new Date(b.startsAt) > now,
  );
  const myRequests = allBookings.filter(
    (b) => b.requesterId === userId && !b.ownUse && new Date(b.endsAt) > now && b.status !== 'cancelled',
  );
  const reloadSpaces = spaces.reload;
  const refreshAll = useCallback(() => Promise.all([reload(), reloadSpaces()]), [reload, reloadSpaces]);
  const refresh = usePullRefresh(refreshAll, { failed: !!error || !!spaces.error });
  const totals = mine.reduce(
    (acc, e) => {
      const s = eventStats(e, tickets, revenue);
      // Revenue is kept per currency; rufiyaa and dollars are never added up.
      const usd = e.currency === 'USD';
      return {
        sold: acc.sold + s.sold,
        revenue: acc.revenue + (usd ? 0 : s.revenue),
        revenueUsd: acc.revenueUsd + (usd ? s.revenue : 0),
        checkedIn: acc.checkedIn + s.checkedIn,
      };
    },
    { sold: 0, revenue: 0, revenueUsd: 0, checkedIn: 0 },
  );
  const sellsInUsd = mine.some((e) => e.currency === 'USD');

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={refresh.control}
      onScroll={refresh.onScroll}
      scrollEventThrottle={refresh.scrollEventThrottle}
    >
      <Container wide={isWide} style={styles.gap}>
        {status && !status.verified && (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/verify')}
            style={({ pressed }) => [styles.verify, { backgroundColor: colors.surface, borderColor: colors.accent }, pressed && { opacity: 0.8 }]}
          >
            {status.verification?.status === 'pending' ? (
              <ClockCountdown size={26} color={colors.accent} weight="fill" />
            ) : (
              <SealCheck size={26} color={colors.accent} weight="fill" />
            )}
            <View style={styles.fill}>
              <AppText variant="headline">
                {status.verification?.status === 'pending' ? 'Your verification is in review' : 'Get verified to start selling'}
              </AppText>
              <AppText variant="subhead" muted>
                {status.verification?.status === 'pending'
                  ? 'You can keep drafting. Drafts go to review once you’re approved.'
                  : 'A one-time ID check. You can draft events now; they publish once you’re verified.'}
              </AppText>
            </View>
            <CaretRight size={18} color={colors.textMuted} />
          </Pressable>
        )}

        <StatRow>
          <Stat label="Tickets sold" value={String(totals.sold)} />
          <Stat
            label="Yours, after fees"
            value={
              sellsInUsd
                ? [formatAmount(totals.revenue, 'MVR'), formatAmount(totals.revenueUsd, 'USD')].join('\n')
                : formatAmount(totals.revenue, 'MVR')
            }
          />
          <Stat label="Checked in" value={String(totals.checkedIn)} />
        </StatRow>

        <View style={[styles.actions, isWide && styles.actionsWide]}>
          <Button label="Create event" icon={Plus} onPress={() => router.push('/organiser/new')} style={styles.flexBtn} />
          <Button label="Scan tickets" icon={QrCode} variant="secondary" onPress={() => router.push('/scan')} style={styles.flexBtn} />
          <Button label="Wallet" icon={Wallet} variant="secondary" onPress={() => router.push('/wallet')} style={styles.flexBtn} />
        </View>

        {error && (
          <AppText variant="subhead" color={colors.danger}>
            {error}
          </AppText>
        )}

        {toAnswer.length > 0 && (
          <View style={styles.groupWrap}>
            <AppText variant="title3" accessibilityRole="header">
              Requests for your spaces
            </AppText>
            <ListGroup>
              {toAnswer.map((b, i) => (
                <BookingLine key={b.id} b={b} side="owner" divider={i > 0} />
              ))}
            </ListGroup>
          </View>
        )}

        <Group title="Your events" empty="Events you create appear here and on Explore for everyone." list={mine} tickets={tickets} revenue={revenue} now={now} />
        {staffing.length > 0 && (
          <Group title="Door staff for" empty="" list={staffing} tickets={tickets} revenue={revenue} now={now} />
        )}

        {(spaces.data?.organizers.length ?? 0) > 0 && (
          <View style={styles.groupWrap}>
            <AppText variant="title3" accessibilityRole="header">
              Your organiser pages
            </AppText>
            <ListGroup>
              {spaces.data!.organizers.map((o, i) => (
                <Pressable
                  key={o.id}
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: '/organizer/[slug]', params: { slug: o.slug } })}
                  style={({ pressed }) => [
                    styles.line,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <UsersThree size={22} color={colors.text} />
                  <AppText variant="headline" style={styles.fill}>
                    {o.name}
                  </AppText>
                  <CaretRight size={18} color={colors.textMuted} />
                </Pressable>
              ))}
            </ListGroup>
          </View>
        )}

        <View style={styles.groupWrap}>
          <AppText variant="title3" accessibilityRole="header">
            Your spaces
          </AppText>
          {myVenues.length === 0 ? (
            <AppText variant="subhead" muted>
              Add the venues you run to reuse them for events. Rent them out to other organisers if you like.
            </AppText>
          ) : (
            <ListGroup>
              {myVenues.map((v, i) => (
                <VenueLine key={v.id} v={v} divider={i > 0} showRent />
              ))}
            </ListGroup>
          )}
          <View style={[styles.actions, isWide && styles.actionsWide]}>
            <Button label="Add a space" icon={Buildings} variant="secondary" onPress={() => router.push('/venues/edit')} style={styles.flexBtn} />
            <Button label="Find a space to rent" icon={MagnifyingGlass} variant="secondary" onPress={() => router.push('/venues')} style={styles.flexBtn} />
          </View>
        </View>

        {myRequests.length > 0 && (
          <View style={styles.groupWrap}>
            <AppText variant="title3" accessibilityRole="header">
              Spaces you’ve booked
            </AppText>
            <ListGroup>
              {myRequests.map((b, i) => (
                <BookingLine key={b.id} b={b} side="requester" divider={i > 0} />
              ))}
            </ListGroup>
          </View>
        )}

        {spaces.error && (
          <AppText variant="subhead" color={colors.danger}>
            {spaces.error}
          </AppText>
        )}
      </Container>
    </ScrollView>
  );
}

function Group({
  title,
  empty,
  list,
  tickets,
  revenue,
  now,
}: {
  title: string;
  empty: string;
  list: EventItem[];
  tickets: Ticket[];
  revenue: Record<string, number>;
  now: Date;
}) {
  const colors = useColors();
  return (
    <View style={styles.groupWrap}>
      <AppText variant="title3" accessibilityRole="header">
        {title}
      </AppText>
      {list.length === 0 ? (
        <AppText variant="subhead" muted>
          {empty}
        </AppText>
      ) : (
        <View style={[styles.group, { backgroundColor: colors.surface }]}>
          {list.map((e, i) => (
            <EventLine key={e.id} e={e} tickets={tickets} revenue={revenue} divider={i > 0} past={new Date(e.endsAt) <= now} />
          ))}
        </View>
      )}
    </View>
  );
}

function EventLine({
  e,
  tickets,
  revenue,
  divider,
  past,
}: {
  e: EventItem;
  tickets: Ticket[];
  revenue: Record<string, number>;
  divider: boolean;
  past: boolean;
}) {
  const colors = useColors();
  const s = eventStats(e, tickets, revenue);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${e.title}. ${s.sold} sold, ${s.checkedIn} checked in. Open dashboard.`}
      onPress={() => router.push({ pathname: '/organiser/[id]', params: { id: e.id } })}
      style={({ pressed }) => [
        styles.line,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Cover uri={e.image} seed={e.id} style={[styles.thumb, { backgroundColor: colors.border }]} />
      <View style={styles.fill}>
        <AppText variant="headline" numberOfLines={1}>
          {e.title}
        </AppText>
        <AppText variant="subhead" muted>
          {past ? 'Ended' : formatWhen(e.startsAt)}, {s.sold} sold, {s.checkedIn} in
        </AppText>
        {e.listing !== 'approved' && (
          <AppText variant="footnote" color={e.listing === 'rejected' ? colors.danger : colors.accent} style={styles.bold}>
            {e.listing === 'draft' ? 'Draft' : e.listing === 'pending' ? 'In review' : 'Changes needed'}
          </AppText>
        )}
      </View>
      <CaretRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingVertical: space.lg },
  gap: { gap: space.xl },
  actions: { gap: space.sm },
  actionsWide: { flexDirection: 'row' },
  flexBtn: { flexGrow: 1 },
  groupWrap: { gap: space.sm },
  group: { borderRadius: radius.control, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm + 4 },
  thumb: { width: 48, height: 48, borderRadius: radius.control - 4 },
  bold: { fontWeight: '600' },
  verify: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.card, borderLeftWidth: 4 },
});
