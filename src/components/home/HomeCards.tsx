import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  Buildings,
  CalendarStar,
  CreditCard,
  SealCheck,
  Wallet as WalletIcon,
  MegaphoneSimple,
  CaretRight,
  Plus,
  QrCode,
  UsersThree,
  WifiSlash,
  type Icon,
} from 'phosphor-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Cover } from '../Cover';
import { isPast, type EventItem } from '@/data/events';
import { fetchBookings, fetchMyVenues } from '@/lib/api';
import { fetchMyPayments, fetchWallet } from '@/lib/market';
import { goSignIn, useAuth } from '@/lib/auth';
import { formatAmount, formatMoney, formatTime, formatWhen, isThisWeekend } from '@/lib/format';
import { useRemote } from '@/lib/useRemote';
import { ticketStatus, useAppStore } from '@/store/AppStore';
import { brand, radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// The cards at the top of the home screen: what's next for you, what changed,
// and (for organisers) what needs an answer.

// Re-renders every `ms` so countdowns stay true while the screen is open.
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// "Good evening" in Maldives time.
export function greeting(now: Date) {
  const h = (now.getUTCHours() + 5) % 24;
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// "Starts in 2 hours", "Tomorrow, 19:30", "In 3 days".
export function countdown(startIso: string, endIso: string, now = new Date()) {
  const ms = new Date(startIso).getTime() - now.getTime();
  if (ms <= 0) return new Date(endIso) > now ? 'On now' : 'Ended';
  const hours = ms / 3_600_000;
  if (hours < 1) return `Starts in ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (hours < 6) return `Starts in ${Math.round(hours)} ${Math.round(hours) === 1 ? 'hour' : 'hours'}`;
  if (hours < 24) return `Today, ${formatTime(startIso)}`;
  const days = Math.round(hours / 24);
  if (days <= 1) return `Tomorrow, ${formatTime(startIso)}`;
  return `In ${days} days`;
}

export function useNextTicket(now: Date) {
  const { tickets, getEvent } = useAppStore();
  const next = tickets
    .filter((t) => ticketStatus(t) === 'active')
    .map((t) => ({ t, e: getEvent(t.eventId) }))
    .filter((x): x is { t: typeof x.t; e: EventItem } => !!x.e && !isPast(x.e, now) && x.e.status !== 'cancelled')
    .sort((a, b) => a.e.startsAt.localeCompare(b.e.startsAt))[0];
  if (!next) return null;
  const count = tickets.filter((x) => x.eventId === next.e.id && ticketStatus(x) === 'active').length;
  return { ...next, count };
}

// Your next event as a pass: the event's picture behind, countdown on top, one
// tap to the tickets.
export function NextEventCard({ now }: { now: Date }) {
  const colors = useColors();
  const next = useNextTicket(now);
  if (!next) return null;
  const { t, e, count } = next;
  const soon = new Date(e.startsAt).getTime() - now.getTime() < 6 * 3_600_000;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Your next event: ${e.title}, ${countdown(e.startsAt, e.endsAt, now)}. Show ${count > 1 ? `${count} tickets` : 'ticket'}.`}
      onPress={() => router.push({ pathname: '/ticket/[code]', params: { code: t.code } })}
      style={({ pressed }) => [styles.pass, pressed && styles.pressed]}
    >
      <Cover uri={e.image} seed={e.id} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.passTop}>
        <View style={[styles.pill, { backgroundColor: soon ? '#FFFFFF' : 'rgba(0,0,0,0.45)' }]}>
          <AppText variant="footnote" color={soon ? brand.crimson : '#FFFFFF'} style={styles.bold}>
            {countdown(e.startsAt, e.endsAt, now)}
          </AppText>
        </View>
      </View>
      <View style={styles.passBottom}>
        <View style={styles.fill}>
          <AppText variant="footnote" color="rgba(255,255,255,0.85)">
            Your next event
          </AppText>
          <AppText variant="title3" color="#FFFFFF" numberOfLines={2}>
            {e.title}
          </AppText>
          <AppText variant="subhead" color="rgba(255,255,255,0.85)" numberOfLines={1}>
            {formatWhen(e.startsAt)} · {e.venue.name}
          </AppText>
        </View>
        <View style={styles.qr}>
          {/* Always dark: the circle is white in both themes. */}
          <QrCode size={22} color="#111113" weight="bold" />
          {count > 1 && (
            <View style={[styles.count, { backgroundColor: colors.accent }]}>
              <AppText variant="caption" color={colors.onAccent}>
                {count}
              </AppText>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

type InboxItem = { key: string; icon: Icon; tint: string; title: string; detail: string; onPress: () => void };

// Things that changed or need you: organiser updates on your tickets, booking
// requests, and how your own events are doing. Quiet rows, like notifications.
export function HomeInbox() {
  const colors = useColors();
  const { userId } = useAuth();
  const { announcements, seenUpdates, tickets, getEvent, events, status } = useAppStore();
  const sells = events.some((e) => e.ownerId === userId);
  const load = useCallback(async () => {
    if (!userId) return { venues: 0, requests: 0, unpaid: [], ready: [] };
    const [venues, bookings, payments, wallet] = await Promise.all([
      fetchMyVenues(userId),
      fetchBookings(),
      fetchMyPayments().catch(() => []),
      sells ? fetchWallet().then((w) => w.wallet).catch(() => null) : Promise.resolve(null),
    ]);
    const now = new Date();
    const requests = bookings.filter((b) => b.status === 'pending' && b.requesterId !== userId && new Date(b.startsAt) > now);
    const unpaid = payments.filter((p) => p.status === 'pending' && new Date(p.expiresAt) > now);
    // Balances that can be withdrawn, per currency.
    const ready = (wallet?.balances ?? []).filter((b) => b.available >= b.minPayout);
    return { venues: venues.length, requests: requests.length, unpaid, ready };
  }, [userId, sells]);
  const { data } = useRemote(load);

  const items: InboxItem[] = [];
  for (const p of data?.unpaid.slice(0, 2) ?? []) {
    items.push({
      key: `pay-${p.id}`,
      icon: CreditCard,
      tint: colors.accent,
      title: p.method === 'transfer' ? 'Waiting for your transfer' : 'Finish paying',
      detail: `${p.label}, ${formatMoney(p.amount, p.currency)}`,
      onPress: () => router.push({ pathname: '/pay/[id]', params: { id: p.id } }),
    });
  }
  const drafts = events.filter((e) => e.ownerId === userId && e.listing === 'draft').length;
  if (drafts > 0 && status && !status.verified) {
    items.push({
      key: 'verify',
      icon: SealCheck,
      tint: colors.accent,
      title: status.verification?.status === 'pending' ? 'Verification in review' : 'Get verified to publish',
      detail: `${drafts} ${drafts === 1 ? 'draft is' : 'drafts are'} waiting to go live`,
      onPress: () => router.push('/verify'),
    });
  }
  if (data?.ready.length) {
    items.push({
      key: 'wallet',
      icon: WalletIcon,
      tint: colors.success,
      title: `${data.ready.map((b) => formatAmount(b.available, b.currency)).join(' and ')} ready to withdraw`,
      detail: 'From events that have finished',
      onPress: () => router.push('/wallet'),
    });
  }
  const unseen = announcements.filter(
    (a, i, all) => all.findIndex((x) => x.eventId === a.eventId) === i && seenUpdates[a.eventId] !== a.createdAt,
  );
  for (const a of unseen.slice(0, 2)) {
    const event = getEvent(a.eventId);
    const ticket = tickets.find((t) => t.eventId === a.eventId && ticketStatus(t) !== 'transferred');
    if (!event || !ticket) continue;
    const cancelled = a.kind === 'cancelled';
    items.push({
      key: a.id,
      icon: cancelled ? WifiSlash : MegaphoneSimple,
      tint: cancelled ? colors.danger : colors.accent,
      title: cancelled ? `${event.title} is cancelled` : `${event.title}: ${a.kind === 'rescheduled' ? 'new time' : 'update'}`,
      detail: a.body,
      onPress: () => router.push({ pathname: '/ticket/[code]', params: { code: ticket.code } }),
    });
  }
  if (data?.requests) {
    items.push({
      key: 'requests',
      icon: Buildings,
      tint: colors.accent,
      title: `${data.requests} booking ${data.requests === 1 ? 'request' : 'requests'} to answer`,
      detail: 'Organisers want to rent your space',
      onPress: () => router.push('/organiser'),
    });
  }
  if (items.length === 0) return null;

  return (
    <View style={[styles.inbox, { backgroundColor: colors.surface }]}>
      {items.map((it, i) => (
        <Pressable
          key={it.key}
          accessibilityRole="button"
          accessibilityLabel={`${it.title}. ${it.detail}`}
          onPress={it.onPress}
          style={({ pressed }) => [
            styles.inboxRow,
            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <View style={[styles.inboxIcon, { backgroundColor: colors.elevated }]}>
            <it.icon size={18} color={it.tint} weight="bold" />
          </View>
          <View style={styles.fill}>
            <AppText variant="subhead" style={styles.bold} numberOfLines={1}>
              {it.title}
            </AppText>
            <AppText variant="footnote" muted numberOfLines={1}>
              {it.detail}
            </AppText>
          </View>
          <CaretRight size={16} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

// For signed-out visitors: one line on why to sign in, out of the way of the events.
export function WelcomeCard({ now }: { now: Date }) {
  return (
    <View style={styles.welcome}>
      <Cover seed={`welcome-${now.getUTCDate()}`} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFill} />
      <View style={styles.welcomeBody}>
        <AppText variant="title3" color="#FFFFFF">
          Your tickets, your organisers, every island.
        </AppText>
        <AppText variant="subhead" color="rgba(255,255,255,0.9)">
          Sign in to keep tickets offline and hear about new events first.
        </AppText>
        <Pressable accessibilityRole="button" onPress={() => goSignIn()} style={({ pressed }) => [styles.welcomeBtn, pressed && styles.pressed]}>
          <AppText variant="subhead" color={brand.crimson} style={styles.bold}>
            Sign in
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

// Islands you've been to events on. Collecting them is a reason to keep going.
export function PassportCard() {
  const colors = useColors();
  const { tickets, getEvent } = useAppStore();
  const attended = tickets.filter((t) => t.checkedInAt).map((t) => getEvent(t.eventId)).filter((e): e is EventItem => !!e);
  const islands = [...new Set(attended.map((e) => e.venue.area))];
  const events = new Set(attended.map((e) => e.id)).size;
  return (
    <View style={[styles.card, styles.body, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
      <AppText variant="footnote" muted>
        Your island passport
      </AppText>
      <AppText variant="headline">
        {islands.length === 0
          ? 'Get stamped at the door'
          : `${islands.length} ${islands.length === 1 ? 'island' : 'islands'}, ${events} ${events === 1 ? 'event' : 'events'}`}
      </AppText>
      <AppText variant="subhead" muted>
        {islands.length === 0
          ? 'Every event you check in at adds its island to your passport.'
          : 'Each check-in adds its island. How many atolls can you collect?'}
      </AppText>
      <View style={styles.stamps}>
        {(islands.length ? islands : ['Malé', 'Hulhumalé', 'Maafushi']).slice(0, 8).map((name) => (
          <View
            key={name}
            style={[
              styles.stamp,
              islands.length ? { borderColor: colors.accent } : { borderColor: colors.border, borderStyle: 'dashed' },
            ]}
          >
            <AppText variant="caption" color={islands.length ? colors.accent : colors.textMuted} numberOfLines={1}>
              {name.toUpperCase()}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

type Prompt = { key: string; icon: Icon; title: string; body: string; onPress: () => void };

// Nudges that change with what you've done so far.
export function Prompts({ horizontalBleed }: { horizontalBleed: number }) {
  const { session, userId } = useAuth();
  const { events, following } = useAppStore();
  const now = new Date();
  const weekend = events.filter((e) => isThisWeekend(e.startsAt, now) && e.status !== 'cancelled').length;
  const runsEvents = events.some((e) => e.ownerId === userId);
  const prompts: Prompt[] = [];
  if (following.length === 0) {
    const pick = events.find((e) => !isPast(e, now) && e.organizerSlug);
    prompts.push({
      key: 'follow',
      icon: UsersThree,
      title: 'Follow organisers',
      body: 'Their new events show first, right here.',
      onPress: () => (pick?.organizerSlug ? router.push({ pathname: '/organizer/[slug]', params: { slug: pick.organizerSlug } }) : undefined),
    });
  }
  if (weekend > 0) {
    prompts.push({
      key: 'weekend',
      icon: CalendarStar,
      title: `${weekend} on this weekend`,
      body: 'Friday and Saturday, from Malé to the atolls.',
      onPress: () => router.push('/(tabs)'),
    });
  }
  prompts.push(
    runsEvents
      ? { key: 'space', icon: Buildings, title: 'Find a space', body: 'Rooftops, halls and studios to rent.', onPress: () => router.push('/venues') }
      : {
          key: 'run',
          icon: MegaphoneSimple,
          title: 'Run an event',
          body: 'Free to list. Sell tickets, check guests in.',
          onPress: () => (session ? router.push('/organiser/new') : goSignIn('/organiser/new')),
        },
  );
  prompts.push({
    key: 'list',
    icon: Plus,
    title: 'Have a space?',
    body: 'List it and organisers can book it.',
    onPress: () => (session ? router.push('/venues/edit') : goSignIn('/venues/edit')),
  });
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -horizontalBleed }}
      contentContainerStyle={[styles.promptRow, { paddingHorizontal: horizontalBleed }]}
    >
      {prompts.map(({ key, ...p }) => (
        <PromptCard key={key} {...p} />
      ))}
    </ScrollView>
  );
}

function PromptCard({ icon: IconCmp, title, body, onPress }: Omit<Prompt, 'key'>) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      onPress={onPress}
      style={({ pressed }) => [styles.prompt, { backgroundColor: colors.elevated, borderColor: colors.border }, pressed && styles.pressed]}
    >
      <View style={[styles.iconBubble, { backgroundColor: colors.surface }]}>
        <IconCmp size={20} color={colors.accent} weight="bold" />
      </View>
      <AppText variant="headline" numberOfLines={2}>
        {title}
      </AppText>
      <AppText variant="footnote" muted numberOfLines={3}>
        {body}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  card: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  clip: { overflow: 'hidden' },
  pressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
  body: { padding: space.md, gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  pass: { marginTop: space.md, height: 196, borderRadius: radius.card, overflow: 'hidden', justifyContent: 'space-between' },
  passTop: { flexDirection: 'row', justifyContent: 'flex-end', padding: space.md },
  passBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, padding: space.md },
  pill: { borderRadius: radius.pill, paddingHorizontal: space.sm + 4, paddingVertical: space.xs + 1 },
  qr: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  inbox: { marginTop: space.md, borderRadius: radius.card, overflow: 'hidden' },
  inboxRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, paddingHorizontal: space.md, paddingVertical: space.sm + 4 },
  inboxIcon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  iconBubble: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  welcome: { marginTop: space.xl, minHeight: 176, borderRadius: radius.card, overflow: 'hidden', justifyContent: 'flex-end' },
  welcomeBody: { padding: space.md, gap: space.xs },
  welcomeBtn: {
    alignSelf: 'flex-start',
    marginTop: space.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    minHeight: 40,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  stamp: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: space.xs, transform: [{ rotate: '-3deg' }] },
  promptRow: { gap: space.sm },
  prompt: { width: 172, padding: space.md, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, gap: space.xs },
});
