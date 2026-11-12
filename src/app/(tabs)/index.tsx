import { FlashList } from '@shopify/flash-list';
import { Bell, CaretRight, CloudSlash, MagnifyingGlass, NavigationArrow, ShieldCheck, SmileySad, XCircle } from 'phosphor-react-native';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { usePullRefresh } from '@/components/PullRefresh';
import { Wordmark } from '@/components/LogoMark';
import { EmptyState } from '@/components/EmptyState';
import { EventRowSkeleton } from '@/components/Skeleton';
import { EventRow, EventTile } from '@/components/EventCards';
import { CategoryRow, CollectionGrid, DayStrip, dayHeading, FeaturedPager, OrganizerRail, upcomingDays } from '@/components/home/Discover';
import { greeting, HomeInbox, NextEventCard, PassportCard, Prompts, useNow, WelcomeCard } from '@/components/home/HomeCards';
import { Avatar } from '@/components/SettingsList';
import { useAuth } from '@/lib/auth';
import { isListed, lowestPrice, type Category, type EventItem } from '@/data/events';
import { isThisWeekend, mvDateInput } from '@/lib/format';
import { tapFeedback } from '@/lib/haptics';
import { currentCoords, distanceKm, type Coords } from '@/lib/location';
import { useLayout } from '@/lib/useLayout';
import { useAppStore } from '@/store/AppStore';
import { minTouchTarget, radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';
import { enter } from '@/theme/motion';

type Row = { kind: 'day'; key: string; label: string } | { kind: 'event'; key: string; e: EventItem };

export default function Explore() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { columns, gutter, width, isDesktop } = useLayout();
  const { events, eventsState, following, refreshEvents, refreshTickets, promoted, collections, status } = useAppStore();
  const { session, displayName, email, avatarUrl } = useAuth();
  const now = useNow();
  const refresh = usePullRefresh(() => Promise.all([refreshEvents(), refreshTickets()]), { failed: eventsState === 'error' });
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [free, setFree] = useState(false);
  const [sort, setSort] = useState<'soonest' | 'nearest'>('soonest');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);

  // Live listings, soonest first. A recurring event shows its next date only.
  const upcoming = useMemo(() => {
    const at = new Date();
    const seen = new Set<string>();
    return events
      .filter((e) => isListed(e, at))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .filter((e) => {
        if (!e.seriesId) return true;
        if (seen.has(e.seriesId)) return false;
        seen.add(e.seriesId);
        return true;
      });
  }, [events]);

  const km = (e: EventItem) => (coords ? distanceKm(coords, e.venue) : undefined);
  const days = useMemo(() => upcomingDays(upcoming, now), [upcoming, now]);
  const filtering = !!query.trim() || !!category || !!day || free;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = upcoming.filter(
      (e) =>
        (!category || e.category === category) &&
        (!day || mvDateInput(e.startsAt).date === day) &&
        (!free || lowestPrice(e) === 0) &&
        (!q || [e.title, e.venue.name, e.venue.area, e.category, e.organizer].some((s) => s.toLowerCase().includes(q))),
    );
    if (sort === 'nearest' && coords) return [...list].sort((a, b) => distanceKm(coords, a.venue) - distanceKm(coords, b.venue));
    return list;
  }, [upcoming, query, category, day, free, sort, coords]);

  // Standouts: promoted first (labelled), then organisers you follow, then
  // what's on this weekend, then what's nearly gone. Five at most, no repeats.
  const featured = useMemo(() => {
    const pick: EventItem[] = [];
    const onSale = (e: EventItem) => e.tiers.some((t) => t.remaining > 0);
    const add = (list: EventItem[]) => list.forEach((e) => pick.length < 5 && onSale(e) && !pick.includes(e) && pick.push(e));
    add(upcoming.filter((e) => promoted.includes(e.id)));
    add(upcoming.filter((e) => !!e.organizerId && following.includes(e.organizerId)));
    add(upcoming.filter((e) => isThisWeekend(e.startsAt) && !!e.image));
    add(
      upcoming.filter((e) => {
        const cap = e.tiers.reduce((s, t) => s + t.capacity, 0);
        const left = e.tiers.reduce((s, t) => s + t.remaining, 0);
        return cap > 0 && left > 0 && left / cap <= 0.25;
      }),
    );
    add(upcoming.filter((e) => !!e.image));
    return pick;
  }, [upcoming, promoted, following]);

  const rails = useMemo(
    () =>
      collections
        .map((c) => ({ ...c, list: c.eventIds.map((id) => upcoming.find((e) => e.id === id)).filter((e): e is EventItem => !!e) }))
        .filter((c) => c.list.length >= 2)
        .slice(0, 4),
    [collections, upcoming],
  );

  // The list, with a header for each day when it's one column and soonest-first.
  const rows = useMemo<Row[]>(() => {
    if (columns > 1 || sort === 'nearest' || day) return results.map((e) => ({ kind: 'event', key: e.id, e }));
    const out: Row[] = [];
    let last = '';
    for (const e of results) {
      const k = mvDateInput(e.startsAt).date;
      if (k !== last) {
        out.push({ kind: 'day', key: `d-${k}`, label: dayHeading(k) });
        last = k;
      }
      out.push({ kind: 'event', key: e.id, e });
    }
    return out;
  }, [results, columns, sort, day]);

  const chooseSort = async (next: 'soonest' | 'nearest') => {
    tapFeedback();
    if (next === 'soonest') return setSort('soonest');
    if (!coords) {
      setLocating(true);
      const c = await currentCoords();
      setLocating(false);
      if (!c) {
        setLocationDenied(true);
        return;
      }
      setCoords(c);
    }
    setLocationDenied(false);
    setSort('nearest');
  };
  const clearAll = () => {
    setQuery('');
    setCategory(null);
    setDay(null);
    setFree(false);
  };

  const weekendCount = upcoming.filter((e) => isThisWeekend(e.startsAt)).length;
  const name = displayName.split(' ')[0];
  // Signed in: your next ticket and anything waiting on you, up top.
  const cards = session ? [<NextEventCard key="next" now={now} />, <HomeInbox key="inbox" />] : [];

  const search = (
    <View style={[styles.search, isDesktop && styles.searchDesktop, { backgroundColor: colors.surface }]}>
      <MagnifyingGlass size={20} color={colors.textMuted} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Events, islands, organisers"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Search events"
        returnKeyType="search"
        autoCorrect={false}
        style={[styles.searchInput, type.body, { color: colors.text }]}
      />
      {query.length > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQuery('')}>
          <XCircle size={20} color={colors.textMuted} weight="fill" />
        </Pressable>
      )}
    </View>
  );

  const sectionTitle = (title: string) => (
    <AppText variant="title2" accessibilityRole="header" style={styles.sectionHead}>
      {title}
    </AppText>
  );

  const header = (
    <View style={{ paddingTop: isDesktop ? space.xl : insets.top + space.sm }}>
      {!isDesktop && (
        <View style={styles.topBar}>
          <View style={styles.brandRow} accessibilityRole="header">
            <Wordmark height={30} color={colors.accent} />
          </View>
          <View style={styles.topActions}>
            {session && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={status?.unread ? `Notifications, ${status.unread} unread` : 'Notifications'}
                hitSlop={8}
                onPress={() => router.push('/inbox')}
                style={({ pressed }) => [styles.bell, { backgroundColor: colors.surface }, pressed && { opacity: 0.7 }]}
              >
                <Bell size={20} color={colors.text} weight={status?.unread ? 'fill' : 'regular'} />
                {!!status?.unread && (
                  <View style={[styles.badge, { backgroundColor: colors.accent, borderColor: colors.background }]}>
                    <AppText variant="caption" color={colors.onAccent} style={styles.badgeText}>
                      {status.unread > 9 ? '9+' : status.unread}
                    </AppText>
                  </View>
                )}
              </Pressable>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel={session ? 'Your account' : 'Sign in'} hitSlop={8} onPress={() => router.push('/profile')}>
              {session ? (
                <Avatar name={displayName || email || ''} uri={avatarUrl} size={36} />
              ) : (
                <AppText variant="subhead" color={colors.accent} style={styles.bold}>
                  Sign in
                </AppText>
              )}
            </Pressable>
          </View>
        </View>
      )}

      <View style={isDesktop ? styles.desktopHead : styles.gapSm}>
        <View style={isDesktop ? styles.fill : undefined}>
          <AppText variant={session ? 'title' : 'largeTitle'} accessibilityRole="header">
            {session ? `${greeting(now)}${name ? `, ${name}` : ''}` : 'What’s on in the Maldives'}
          </AppText>
          <AppText muted>
            {weekendCount > 0 ? `${weekendCount} ${weekendCount === 1 ? 'event' : 'events'} this weekend, Malé to the atolls.` : 'Music, food, culture and days on the water.'}
          </AppText>
        </View>
        {search}
      </View>

      <View style={styles.filters}>
        <DayStrip days={days} selected={day} onSelect={setDay} bleed={gutter} />
        <CategoryRow selected={category} onSelect={setCategory} free={free} onFree={() => setFree((f) => !f)} bleed={gutter} />
      </View>

      {!filtering && (
        <>
          {cards.length > 0 && (
            <View style={isDesktop ? styles.cardsDesktop : undefined}>
              {cards.map((c, i) => (
                <Animated.View key={i} entering={enter.rise(60 * i)} style={isDesktop ? styles.cardCell : undefined}>
                  {c}
                </Animated.View>
              ))}
            </View>
          )}

          {featured.length > 0 && (
            <Animated.View entering={enter.rise(80)}>
              {sectionTitle(following.length ? 'Picked for you' : 'Don’t miss')}
              <FeaturedPager events={featured} promoted={promoted} width={width} bleed={gutter} />
            </Animated.View>
          )}

          {/* Visitors see what's on first, then the reason to sign in. */}
          {!session && <WelcomeCard now={now} />}

          <Animated.View entering={enter.rise(110)}>
            <OrganizerRail bleed={gutter} />
          </Animated.View>

          {rails.length > 0 && (
            <Animated.View entering={enter.rise(140)}>
              {sectionTitle('Browse')}
              <CollectionGrid items={rails} columns={columns} />
            </Animated.View>
          )}

          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/help/[slug]', params: { slug: 'guarantee' } })}
            style={({ pressed }) => [styles.guarantee, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
          >
            <ShieldCheck size={22} color={colors.success} weight="fill" />
            <AppText variant="subhead" style={styles.fill}>
              <AppText variant="subhead" style={styles.bold}>
                Every ticket is protected.
              </AppText>{' '}
              <AppText variant="subhead" muted>
                Refunded if it’s cancelled or isn’t real.
              </AppText>
            </AppText>
            <CaretRight size={16} color={colors.textMuted} />
          </Pressable>
        </>
      )}

      <View style={styles.listHead}>
        <AppText variant="title2" accessibilityRole="header" style={styles.fill}>
          {filtering ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : 'Coming up'}
        </AppText>
        <View style={[styles.segment, { backgroundColor: colors.surface }]} accessibilityRole="radiogroup">
          {(['soonest', 'nearest'] as const).map((s) => (
            <Pressable
              key={s}
              accessibilityRole="radio"
              accessibilityState={{ selected: sort === s, busy: s === 'nearest' && locating }}
              onPress={() => chooseSort(s)}
              style={[styles.segmentItem, sort === s && { backgroundColor: colors.elevated }]}
            >
              {s === 'nearest' && <NavigationArrow size={14} color={colors.text} weight={sort === s ? 'fill' : 'regular'} />}
              <AppText variant="subhead" style={styles.bold}>
                {s === 'soonest' ? 'Soonest' : locating ? 'Locating' : 'Nearest'}
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>
      {filtering && (
        <Pressable accessibilityRole="button" onPress={clearAll} style={styles.clear} hitSlop={6}>
          <AppText variant="subhead" color={colors.accent} style={styles.bold}>
            Clear filters
          </AppText>
        </Pressable>
      )}
      {locationDenied && (
        <AppText variant="footnote" muted style={styles.note}>
          Location is off for Tikkit. Turn it on in Settings to sort by distance.
        </AppText>
      )}
    </View>
  );

  const footer =
    !filtering && upcoming.length > 0 ? (
      <View style={[styles.more, isDesktop && styles.cardsDesktop]}>
        {session && (
          <View style={isDesktop ? styles.cardCell : undefined}>
            <PassportCard />
          </View>
        )}
        <View style={isDesktop ? styles.cardCell : undefined}>
          <Prompts horizontalBleed={isDesktop ? 0 : gutter} />
        </View>
      </View>
    ) : null;

  return (
    <FlashList<Row>
      key={columns}
      data={rows}
      numColumns={columns}
      keyExtractor={(r) => r.key}
      getItemType={(r) => r.kind}
      extraData={coords}
      renderItem={({ item, index }) =>
        item.kind === 'day' ? (
          <AppText variant="headline" color={colors.textMuted} style={styles.dayHead} accessibilityRole="header">
            {item.label}
          </AppText>
        ) : columns === 1 ? (
          <EventRow e={item.e} km={km(item.e)} />
        ) : (
          <View style={{ flex: 1, paddingLeft: index % columns ? space.md / 2 : 0, paddingRight: index % columns < columns - 1 ? space.md / 2 : 0 }}>
            <EventTile e={item.e} km={km(item.e)} />
          </View>
        )
      }
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      refreshControl={refresh.control}
      onScroll={refresh.onScroll}
      scrollEventThrottle={refresh.scrollEventThrottle}
      ListEmptyComponent={
        events.length === 0 && eventsState !== 'error' ? (
          <View accessibilityLabel="Loading events" accessibilityRole="progressbar">
            <EventRowSkeleton />
            <EventRowSkeleton />
            <EventRowSkeleton />
          </View>
        ) : events.length === 0 ? (
          <EmptyState icon={CloudSlash} title="Can’t load events" body="Check your connection, then try again." action={{ label: 'Try again', onPress: refreshEvents }} />
        ) : (
          <EmptyState
            icon={SmileySad}
            title="Nothing matches that"
            body="Try another day or kind of event, or clear the filters to see everything coming up."
            action={{ label: 'Clear filters', onPress: clearAll }}
          />
        )
      }
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: space.xxl }}
      style={{ backgroundColor: colors.background }}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  gapSm: { gap: space.xs },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4 },
  bell: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, lineHeight: 12, fontWeight: '700' },
  desktopHead: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xl },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: minTouchTarget, borderRadius: radius.pill, paddingHorizontal: space.md, marginTop: space.md },
  searchDesktop: { width: 400, marginTop: 0 },
  // The rounded field already shows focus; drop the browser's outline box.
  searchInput: { outlineWidth: 0, flex: 1, paddingVertical: space.sm },
  filters: { gap: space.sm + 4, marginTop: space.md },
  cardsDesktop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  cardCell: { flexGrow: 1, flexBasis: 360, maxWidth: 640 },
  sectionHead: { marginTop: space.xl, marginBottom: space.sm + 4 },
  guarantee: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, paddingVertical: space.md, marginTop: space.xl, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xl, marginBottom: space.xs },
  segment: { flexDirection: 'row', borderRadius: radius.pill, padding: 3 },
  segmentItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 36, paddingHorizontal: space.sm + 4, borderRadius: radius.pill },
  clear: { alignSelf: 'flex-start', marginBottom: space.sm },
  note: { marginBottom: space.sm },
  dayHead: { marginTop: space.lg, marginBottom: space.xxs },
  more: { gap: space.md, marginTop: space.xxl },
});
