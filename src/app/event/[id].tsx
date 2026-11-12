import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import {
  ArrowLeft,
  BellRinging,
  Boat,
  CalendarBlank,
  Crown,
  Flag,
  InstagramLogo,
  SealCheck,
  ShieldCheck,
  Tag,
  Heart,
  Info,
  MapPin,
  NavigationArrow,
  ShareNetwork,
  SmileySad,
  User,
} from 'phosphor-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Cover } from '@/components/Cover';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { Pop } from '@/components/Pop';
import { MembershipCard, TrustStats } from '@/components/Trust';
import { inPresale, isListed, type EventItem } from '@/data/events';
import { goSignIn, useAuth } from '@/lib/auth';
import { formatDay, formatLongDay, formatMoney, formatTime, formatWhen, type Currency } from '@/lib/format';
import { eventLink } from '@/lib/links';
import { errorFeedback, tapFeedback } from '@/lib/haptics';
import { buyResale, fetchAddons, fetchOrganizerTrust, fetchResaleOffers } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { openDirections } from '@/lib/maps';
import { useLayout } from '@/lib/useLayout';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function EventDetail() {
  const { id, ref } = useLocalSearchParams<{ id: string; ref?: string }>();
  const store = useAppStore();
  const event = store.getEvent(id);
  const { userId } = useAuth();
  const loadExtras = useCallback(async () => {
    const [addons, offers] = await Promise.all([fetchAddons(id).catch(() => []), fetchResaleOffers(id).catch(() => [])]);
    return { addons, offers };
  }, [id]);
  const extras = useRemote(loadExtras);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isDesktop, isWide } = useLayout();
  const { session } = useAuth();
  const [lookup, setLookup] = useState<'loading' | 'done'>('loading');
  // Once the picture scrolls away, a solid bar with the title fades in behind
  // the buttons so they never sit on top of the text.
  const { width } = useWindowDimensions();
  const heroHeight = isWide ? Math.min(520, (width * 9) / 21) : (width * 3) / 4;
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [heroHeight - insets.top - 140, heroHeight - insets.top - 70], [0, 1], Extrapolation.CLAMP),
  }));

  // Opened from a link before the catalog loaded, or an older event.
  const { loadEvent } = store;
  useEffect(() => {
    let live = true;
    loadEvent(id)
      .catch(() => null)
      .finally(() => live && setLookup('done'));
    return () => {
      live = false;
    };
  }, [id, loadEvent]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!event && lookup === 'loading') {
    return (
      <View style={[styles.fill, styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.fill, { paddingTop: insets.top + space.xl, backgroundColor: colors.background }]}>
        <EmptyState
          icon={SmileySad}
          title="Event not found"
          body="It may have been removed or the link is wrong."
          action={{ label: 'Back to Explore', onPress: () => router.replace('/') }}
        />
      </View>
    );
  }

  const cancelled = event.status === 'cancelled';
  const available = event.tiers.filter((t) => store.remaining(event.id, t.id) > 0);
  const soldOut = available.length === 0;
  const from = soldOut ? 0 : Math.min(...available.map((t) => t.price));
  const isSaved = store.saved.includes(event.id);
  const link = eventLink(event.id, ref);
  const share = () =>
    Share.share({ message: `${event.title}, ${formatLongDay(event.startsAt)} at ${event.venue.name}\n${link}`, url: link }).catch(() => {});
  const story = () => router.push({ pathname: '/story/[id]', params: { id: event.id } });
  const presale = inPresale(event);
  const isMember = !!event.organizerId && !!store.memberOf[event.organizerId];
  const otherDates = event.seriesId
    ? store.events.filter((x) => x.seriesId === event.seriesId && x.id !== event.id && isListed(x)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    : [];
  const seated = event.tiers.some((t) => t.seated);
  const checkoutParams = ref ? { id: event.id, ref } : { id: event.id };
  const goCheckout = () =>
    session
      ? router.push({ pathname: '/checkout/[id]', params: checkoutParams })
      : goSignIn(`/checkout/${event.id}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`);
  const isOwner = !!userId && event.ownerId === userId;
  const transfers = extras.data?.addons.filter((a) => a.kind === 'transfer') ?? [];

  const ctaLabel = cancelled ? 'Cancelled' : soldOut ? 'Sold out' : presale && !isMember ? 'Members only' : seated ? 'Choose seats' : 'Get tickets';

  const body = (
    <>
      {isOwner && event.listing !== 'approved' && <ReviewBanner event={event} />}
      {presale && !cancelled && (
        <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
          <Crown size={20} color={colors.accent} weight="fill" />
          <View style={styles.fill}>
            <AppText variant="headline">{isMember ? 'Member presale: you’re in' : 'Members-only presale'}</AppText>
            <AppText variant="subhead" muted>
              General sale opens {formatWhen(event.publicSaleAt!)}.{isMember ? ' Member prices apply at checkout.' : ' Join to buy now.'}
            </AppText>
          </View>
        </View>
      )}
      {event.notice && (
        <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: cancelled ? colors.danger : colors.accent }]}>
          <Info size={20} color={cancelled ? colors.danger : colors.accent} weight="fill" />
          <View style={styles.fill}>
            <AppText variant="headline">{cancelled ? 'This event is cancelled' : 'This event has a new date'}</AppText>
            <AppText variant="subhead" muted>
              {event.notice}
            </AppText>
          </View>
        </View>
      )}

      <View>
        <AppText variant="footnote" color={colors.accent} style={styles.category}>
          {event.category}
        </AppText>
        <AppText variant={isDesktop ? 'largeTitle' : 'title'} accessibilityRole="header">
          {event.title}
        </AppText>
      </View>

      <View style={styles.facts}>
        <Fact icon={CalendarBlank} title={formatLongDay(event.startsAt)} detail={`${formatTime(event.startsAt)} to ${formatTime(event.endsAt)}`} />
        <Fact
          icon={MapPin}
          title={`${event.venue.name}, ${event.venue.area}`}
          detail={event.venue.address}
          action={{ label: 'Directions', icon: NavigationArrow, onPress: () => openDirections(event.venue) }}
        />
        {(event.access || transfers.length > 0) && (
          <Fact
            icon={Boat}
            title="Getting there"
            detail={[
              event.access,
              transfers.length
                ? `Add a seat at checkout: ${transfers.map((a) => `${a.name} (${formatMoney(a.price, event.currency)})`).join(', ')}.`
                : undefined,
            ]
              .filter(Boolean)
              .join(' ')}
          />
        )}
        <OrganiserFact event={event} />
      </View>

      {otherDates.length > 0 && (
        <Section title="More dates">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dates}>
            {otherDates.map((d) => (
              <Pressable
                key={d.id}
                accessibilityRole="link"
                onPress={() => router.replace({ pathname: '/event/[id]', params: { id: d.id } })}
                style={({ pressed }) => [styles.date, { backgroundColor: colors.surface }, pressed && { opacity: 0.7 }]}
              >
                <AppText variant="subhead" style={styles.bold}>
                  {formatDay(d.startsAt)}
                </AppText>
                <AppText variant="footnote" muted>
                  {formatTime(d.startsAt)}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      )}

      {event.organizerId && <OrganizerTrust organizerId={event.organizerId} showMembership={presale && !isMember} mine={isOwner} />}

      <Section title="About">
        <AppText style={styles.para}>{event.description}</AppText>
      </Section>

      {event.lineup && (
        <Section title="Lineup">
          {event.lineup.map((name) => (
            <AppText key={name} style={styles.lineup}>
              {name}
            </AppText>
          ))}
        </Section>
      )}
    </>
  );

  // Title and description for browsers and link previews of the web app.
  const head = (
    <Head>
      <title>{`${event.title} · Tikkit`}</title>
      <meta name="description" content={`${formatLongDay(event.startsAt)}, ${event.venue.name}, ${event.venue.area}. ${event.description.slice(0, 140)}`} />
      <meta property="og:title" content={event.title} />
      <meta property="og:description" content={`${formatLongDay(event.startsAt)} at ${event.venue.name}`} />
      {!!event.image && <meta property="og:image" content={event.image} />}
    </Head>
  );

  const tierList = (
    <View style={styles.gapSm}>
      <TierList event={event} />
      {!!extras.data?.offers.length && !cancelled && <ResaleList offers={extras.data.offers} currency={event.currency} />}
      <View style={styles.guarantee}>
        <ShieldCheck size={18} color={colors.success} weight="fill" />
        <AppText variant="footnote" muted style={styles.fill}>
          Covered by the Tikkit Guarantee: refunded if it’s cancelled or isn’t real.
        </AppText>
      </View>
    </View>
  );
  const reportLink = !isOwner && event.listing === 'approved' && (
    <Pressable
      accessibilityRole="link"
      onPress={() =>
        session
          ? router.push({ pathname: '/report', params: { kind: 'event', id: event.id, title: event.title } })
          : goSignIn(`/event/${event.id}`)
      }
      style={({ pressed }) => [styles.report, pressed && { opacity: 0.6 }]}
    >
      <Flag size={16} color={colors.textMuted} />
      <AppText variant="footnote" muted>
        Something wrong with this event? Report it
      </AppText>
    </Pressable>
  );

  if (isDesktop) {
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.desktopScroll}>
        {head}
        <Container wide>
          <View style={[styles.desktopTop, styles.desktopTopEnd]}>
            <View style={styles.row}>
              <Button label="Story" icon={InstagramLogo} variant="secondary" onPress={story} />
              <Button label="Share" icon={ShareNetwork} variant="secondary" onPress={share} />
              <Pop trigger={isSaved}>
                <Button
                  label={isSaved ? 'Saved' : 'Save'}
                  icon={Heart}
                  variant="secondary"
                  onPress={() => store.toggleSaved(event.id)}
                  accessibilityState={{ selected: isSaved }}
                />
              </Pop>
            </View>
          </View>
          <Cover uri={event.image} seed={event.id} category={event.category} motifSize={96} style={[styles.desktopHero, { backgroundColor: colors.surface }]} transition={200} />
          <View style={styles.columns}>
            <View style={[styles.fill, styles.bodyGap]}>
              {body}
              {reportLink}
            </View>
            <View style={[styles.panel, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
              <AppText variant="title3">Tickets</AppText>
              {tierList}
              <Button label={ctaLabel} disabled={cancelled || soldOut} onPress={goCheckout} />
            </View>
          </View>
        </Container>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {head}
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: space.xxl * 2 + insets.bottom }}>
        <View>
          <Cover uri={event.image} seed={event.id} category={event.category} motifSize={72} style={[styles.hero, isWide && styles.heroWide, { backgroundColor: colors.surface }]} transition={200} />
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent']}
            style={[styles.topScrim, { height: insets.top + 80 }]}
            pointerEvents="none"
          />
        </View>
        <Container style={[styles.mobileBody, styles.bodyGap]}>
          {body}
          <Section title="Tickets">{tierList}</Section>
          {reportLink}
        </Container>
      </Animated.ScrollView>

      <Animated.View
        pointerEvents="none"
        style={[styles.solidBar, { height: insets.top + space.sm + 52, backgroundColor: colors.background, borderColor: colors.border }, barStyle]}
      >
        <AppText variant="headline" numberOfLines={1} style={[styles.barTitle, { top: insets.top + space.sm + 12 }]}>
          {event.title}
        </AppText>
      </Animated.View>
      <View style={[styles.topBar, { top: insets.top + space.sm }]}>
        <IconButton icon={ArrowLeft} tone="overlay" accessibilityLabel="Back" onPress={back} />
        <View style={styles.row}>
          <IconButton icon={InstagramLogo} tone="overlay" accessibilityLabel="Share to your story" onPress={story} />
          <IconButton icon={ShareNetwork} tone="overlay" accessibilityLabel="Share event" onPress={share} />
          <Pop trigger={isSaved}>
            <IconButton
              icon={Heart}
              tone="overlay"
              active={isSaved}
              accessibilityLabel={isSaved ? 'Remove from saved' : 'Save event'}
              accessibilityState={{ selected: isSaved }}
              onPress={() => store.toggleSaved(event.id)}
            />
          </Pop>
        </View>
      </View>

      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, space.md), backgroundColor: colors.background, borderColor: colors.border },
        ]}
      >
        <Container style={styles.bottomInner}>
          <View style={styles.fill}>
            <AppText variant="footnote" muted>
              {cancelled || soldOut ? 'Tickets' : from === 0 ? 'Entry' : 'From'}
            </AppText>
            <AppText variant="title3">{cancelled ? 'Cancelled' : soldOut ? 'Sold out' : formatMoney(from, event.currency)}</AppText>
          </View>
          <Button label={ctaLabel} disabled={cancelled || soldOut} onPress={goCheckout} style={styles.cta} />
        </Container>
      </View>
    </View>
  );
}

function TierList({ event }: { event: EventItem }) {
  const colors = useColors();
  const { remaining, waitlist, toggleWaitlist } = useAppStore();
  return (
    <View>
      {event.tiers.map((t) => {
        const left = remaining(event.id, t.id);
        const waiting = waitlist.some((w) => w.eventId === event.id && w.tierId === t.id);
        return (
          <View key={t.id} style={[styles.tier, { borderColor: colors.border }]}>
            <View style={styles.fill}>
              <AppText variant="headline">{t.name}</AppText>
              <AppText variant="subhead" muted>
                {t.description}
              </AppText>
              {left === 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: waiting }}
                  onPress={() => {
                    tapFeedback();
                    toggleWaitlist(event.id, t.id);
                  }}
                  hitSlop={8}
                  style={styles.waitlist}
                >
                  <BellRinging size={16} color={colors.accent} weight={waiting ? 'fill' : 'bold'} />
                  <AppText variant="subhead" color={colors.accent} style={styles.bold}>
                    {waiting ? 'On the waitlist. Tap to leave' : 'Join the waitlist'}
                  </AppText>
                </Pressable>
              )}
            </View>
            <AppText variant="headline" muted={left === 0}>
              {left === 0 ? 'Sold out' : formatMoney(t.price, event.currency)}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

// The organiser's track record, and their membership during a presale.
function OrganizerTrust({ organizerId, showMembership, mine }: { organizerId: string; showMembership: boolean; mine: boolean }) {
  const load = useCallback(() => fetchOrganizerTrust(organizerId), [organizerId]);
  const { data: trust } = useRemote(load);
  if (!trust) return null;
  return (
    <>
      {(trust.verified || trust.eventsRun > 0) && (
        <Section title="About the organiser">
          <TrustStats t={trust} compact />
        </Section>
      )}
      {showMembership && trust.membership && <MembershipCard organizerId={organizerId} membership={trust.membership} members={trust.members} mine={mine} />}
    </>
  );
}

function ReviewBanner({ event }: { event: EventItem }) {
  const colors = useColors();
  const copy = {
    draft: { title: 'Draft: only you can see this', body: 'Get verified and it goes to review automatically.', action: { label: 'Get verified', href: '/verify' as const } },
    pending: { title: 'Waiting for review', body: 'Our team checks new organisers’ events, usually within a few hours. You’ll get a notification.', action: null },
    rejected: { title: 'Changes needed', body: event.reviewNote ?? 'Edit the event and it goes back for review.', action: null },
    approved: null,
  }[event.listing];
  if (!copy) return null;
  return (
    <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: event.listing === 'rejected' ? colors.danger : colors.accent }]}>
      <Info size={20} color={event.listing === 'rejected' ? colors.danger : colors.accent} weight="fill" />
      <View style={[styles.fill, styles.gapSm]}>
        <AppText variant="headline">{copy.title}</AppText>
        <AppText variant="subhead" muted>
          {copy.body}
        </AppText>
        {copy.action && <Button label={copy.action.label} variant="secondary" onPress={() => router.push(copy.action!.href)} style={styles.bannerBtn} />}
      </View>
    </View>
  );
}

function ResaleList({ offers, currency }: { offers: { id: string; tierName: string; price: number; facePrice: number }[]; currency: Currency }) {
  const colors = useColors();
  const { session, displayName, email } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const buy = async (offerId: string) => {
    if (!session) return goSignIn();
    setFailure(null);
    setBusy(offerId);
    try {
      const paymentId = await buyResale(offerId, displayName || email || 'Guest');
      router.push({ pathname: '/pay/[id]', params: { id: paymentId } });
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={[styles.resale, { backgroundColor: colors.surface }]}>
      <View style={styles.resaleHead}>
        <Tag size={18} color={colors.accent} weight="fill" />
        <AppText variant="headline">Resale tickets</AppText>
      </View>
      <AppText variant="footnote" muted>
        From other fans, through Tikkit. You get a fresh code; the seller’s stops working.
      </AppText>
      {offers.slice(0, 5).map((o) => (
        <View key={o.id} style={styles.resaleRow}>
          <View style={styles.fill}>
            <AppText variant="subhead" style={styles.bold}>
              {o.tierName}
            </AppText>
            <AppText variant="footnote" muted>
              Face value {formatMoney(o.facePrice, currency)}
            </AppText>
          </View>
          <Button label={`Buy ${formatMoney(o.price, currency)}`} variant="secondary" loading={busy === o.id} onPress={() => buy(o.id)} />
        </View>
      ))}
      {failure && (
        <AppText variant="footnote" color={colors.danger}>
          {failure}
        </AppText>
      )}
    </View>
  );
}

function OrganiserFact({ event }: { event: EventItem }) {
  const { following, toggleFollow } = useAppStore();
  const { organizerId: id, organizerSlug: slug } = event;
  // Events from before organiser pages have no page to follow.
  if (!id || !slug) return <Fact icon={User} title={event.organizer} detail="Organiser" />;
  const isFollowing = following.includes(id);
  return (
    <Fact
      icon={User}
      title={event.organizer}
      detail={event.organizerVerified ? 'Verified organiser, see all their events' : 'Organiser, see all their events'}
      badge={event.organizerVerified}
      onPress={() => router.push({ pathname: '/organizer/[slug]', params: { slug } })}
      action={{
        label: isFollowing ? 'Following' : 'Follow',
        onPress: () => toggleFollow({ id, slug, name: event.organizer }),
        selected: isFollowing,
      }}
    />
  );
}

type FactAction = { label: string; onPress: () => void; icon?: typeof MapPin; selected?: boolean };

function Fact({
  icon: IconCmp,
  title,
  detail,
  action,
  onPress,
  badge,
}: {
  icon: typeof MapPin;
  title: string;
  detail: string;
  action?: FactAction;
  onPress?: () => void;
  badge?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.fact}>
      <Pressable
        accessibilityRole={onPress ? 'link' : undefined}
        disabled={!onPress}
        onPress={onPress}
        style={({ pressed }) => [styles.factMain, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.factIcon, { backgroundColor: colors.surface }]}>
          <IconCmp size={20} color={colors.text} />
        </View>
        <View style={styles.fill}>
          <View style={styles.titleRow}>
            <AppText variant="headline" style={styles.shrink}>
              {title}
            </AppText>
            {badge && <SealCheck size={18} color={colors.accent} weight="fill" />}
          </View>
          <AppText variant="subhead" color={onPress ? colors.accent : undefined} muted={!onPress}>
            {detail}
          </AppText>
        </View>
      </Pressable>
      {action && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: !!action.selected }}
          onPress={() => {
            tapFeedback();
            action.onPress();
          }}
          style={({ pressed }) => [
            styles.factAction,
            { backgroundColor: action.selected ? colors.text : colors.surface },
            pressed && { opacity: 0.7 },
          ]}
        >
          {action.icon && <action.icon size={16} color={action.selected ? colors.background : colors.text} weight="bold" />}
          <AppText variant="subhead" color={action.selected ? colors.background : colors.text} style={styles.bold}>
            {action.label}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="title3" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  desktopTopEnd: { justifyContent: 'flex-end' },
  fill: { flex: 1 },
  loading: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: space.sm },
  bold: { fontWeight: '600' },
  gapSm: { gap: space.sm },
  dates: { gap: space.sm },
  date: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.control, alignItems: 'center', minWidth: 96 },
  shrink: { flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  bannerBtn: { alignSelf: 'flex-start', marginTop: space.xs },
  guarantee: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.xs },
  report: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, paddingVertical: space.sm, alignSelf: 'flex-start' },
  resale: { padding: space.md, borderRadius: radius.control, gap: space.sm },
  resaleHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  resaleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  hero: { width: '100%', aspectRatio: 4 / 3 },
  heroWide: { aspectRatio: 21 / 9, maxHeight: 520 },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  solidBar: { position: 'absolute', top: 0, left: 0, right: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  barTitle: { position: 'absolute', left: 72, right: 168 },
  topBar: { position: 'absolute', left: space.md, right: space.md, flexDirection: 'row', justifyContent: 'space-between' },
  mobileBody: { paddingTop: space.lg },
  bodyGap: { gap: space.xl },
  notice: { flexDirection: 'row', gap: space.sm + 4, padding: space.md, borderRadius: radius.control, borderLeftWidth: 4 },
  category: { fontWeight: '600', marginBottom: space.xs },
  facts: { gap: space.md },
  factMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  fact: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  factIcon: { width: 44, height: 44, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  factAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    minHeight: 36,
    paddingHorizontal: space.sm + 4,
    borderRadius: radius.pill,
  },
  section: { gap: space.sm },
  para: { maxWidth: 640 },
  lineup: { paddingVertical: space.xxs },
  tier: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  waitlist: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, marginTop: space.sm, minHeight: 32 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: space.sm + 4, borderTopWidth: StyleSheet.hairlineWidth },
  bottomInner: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cta: { minWidth: 160 },
  desktopScroll: { paddingBottom: space.xxl * 2 },
  desktopTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.md },
  backBtn: { paddingHorizontal: 0 },
  desktopHero: { width: '100%', aspectRatio: 21 / 8, borderRadius: radius.card },
  columns: { flexDirection: 'row', gap: space.xxl, alignItems: 'flex-start', marginTop: space.xl },
  panel: {
    width: 380,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    position: 'sticky' as 'relative',
    top: space.lg,
  },
});
