import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SealCheck, Tag } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { AppText } from '../AppText';
import { categoryIcons } from '../categoryIcons';
import { Cover } from '../Cover';
import { Avatar } from '../SettingsList';
import { categories, lowestPrice, type Category, type EventItem } from '@/data/events';
import type { Collection } from '@/data/money';
import { browseOrganizers } from '@/lib/api';
import { formatMoney, formatWhen, mvDateInput, mvInstant } from '@/lib/format';
import { tapFeedback } from '@/lib/haptics';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { minTouchTarget, radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// The home screen's discovery pieces: pick a day, pick a kind of thing, see a
// few standout events, browse curated collections.

const weekdayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const dayHeadFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export type Day = { key: string; label: string; num: number; weekend: boolean; count: number };

// Today and the next 7 days in Maldives time, with how much is on each.
export function upcomingDays(events: EventItem[], now = new Date()): Day[] {
  const [y, m, d] = mvDateInput(now.toISOString()).date.split('-').map(Number);
  const counts = new Map<string, number>();
  for (const e of events) {
    const k = mvDateInput(e.startsAt).date;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Array.from({ length: 8 }, (_, i) => {
    const at = new Date(Date.UTC(y, m - 1, d + i));
    const key = mvDateInput(mvInstant(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 12).toISOString()).date;
    const dow = at.getUTCDay();
    return {
      key,
      label: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : weekdayFmt.format(at),
      num: at.getUTCDate(),
      weekend: dow === 5 || dow === 6,
      count: counts.get(key) ?? 0,
    };
  });
}

// "Today", "Tomorrow", or "Saturday 18 October" for list headers.
export function dayHeading(key: string, now = new Date()) {
  const today = mvDateInput(now.toISOString()).date;
  const tomorrow = mvDateInput(new Date(now.getTime() + 86_400_000).toISOString()).date;
  if (key === today) return 'Today';
  if (key === tomorrow) return 'Tomorrow';
  const [y, m, d] = key.split('-').map(Number);
  return dayHeadFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

export function DayStrip({ days, selected, onSelect, bleed }: { days: Day[]; selected: string | null; onSelect: (k: string | null) => void; bleed: number }) {
  const colors = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -bleed, flexGrow: 0 }}
      contentContainerStyle={[styles.days, { paddingHorizontal: bleed }]}
      accessibilityRole="radiogroup"
    >
      {days.map((d) => {
        const on = selected === d.key;
        const empty = d.count === 0;
        return (
          <Pressable
            key={d.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: empty }}
            accessibilityLabel={`${dayHeading(d.key)}, ${d.count} ${d.count === 1 ? 'event' : 'events'}`}
            disabled={empty}
            onPress={() => {
              tapFeedback();
              onSelect(on ? null : d.key);
            }}
            style={({ pressed }) => [
              styles.day,
              { backgroundColor: on ? colors.text : colors.surface },
              empty && styles.dayEmpty,
              pressed && { opacity: 0.8 },
            ]}
          >
            <AppText variant="caption" color={on ? colors.background : d.weekend ? colors.accent : colors.textMuted} style={styles.dayLabel}>
              {d.label}
            </AppText>
            <AppText variant="title3" color={on ? colors.background : colors.text} style={styles.dayNum}>
              {d.num}
            </AppText>
            <AppText variant="caption" color={on ? colors.background : colors.textMuted} style={styles.dayCount}>
              {d.count === 0 ? ' ' : d.count}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function CategoryRow({ selected, onSelect, free, onFree, bleed }: { selected: Category | null; onSelect: (c: Category | null) => void; free: boolean; onFree: () => void; bleed: number }) {
  const colors = useColors();
  const item = (key: string, label: string, on: boolean, press: () => void, IconCmp?: (typeof categoryIcons)[Category]) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        tapFeedback();
        press();
      }}
      style={({ pressed }) => [styles.cat, { backgroundColor: on ? colors.text : colors.surface }, pressed && { opacity: 0.8 }]}
    >
      {IconCmp && <IconCmp size={16} color={on ? colors.background : colors.text} weight={on ? 'fill' : 'regular'} />}
      <AppText variant="subhead" color={on ? colors.background : colors.text} style={styles.catText}>
        {label}
      </AppText>
    </Pressable>
  );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -bleed, flexGrow: 0 }}
      contentContainerStyle={[styles.cats, { paddingHorizontal: bleed }]}
    >
      {item('free', 'Free', free, onFree, Tag)}
      {categories.map((c) => item(c, c, selected === c, () => onSelect(selected === c ? null : c), categoryIcons[c]))}
    </ScrollView>
  );
}

// A few standout events, big, one at a time. Promoted ones say so.
export function FeaturedPager({ events, promoted, width, bleed }: { events: EventItem[]; promoted: string[]; width: number; bleed: number }) {
  const colors = useColors();
  const [page, setPage] = useState(0);
  if (events.length === 0) return null;
  // Phones: one card with the next peeking in. Wider screens: two or three side by side.
  const avail = width - bleed * 2;
  const perView = width >= 1100 ? 3 : width >= 700 ? 2 : 1;
  const gap = space.sm + 4;
  const cardW = perView > 1 ? (avail - gap * (perView - 1)) / perView : events.length > 1 ? avail - space.lg : avail;
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / (cardW + space.sm + 4)));
  return (
    <View style={styles.featured}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardW + space.sm + 4}
        onMomentumScrollEnd={onEnd}
        onScrollEndDrag={onEnd}
        style={{ marginHorizontal: -bleed }}
        contentContainerStyle={{ paddingHorizontal: bleed, gap: space.sm + 4 }}
      >
        {events.map((e) => {
          // What you can still buy, not what sold out.
          const open = e.tiers.filter((t) => t.remaining > 0);
          const from = open.length ? Math.min(...open.map((t) => t.price)) : lowestPrice(e);
          return (
            <Pressable
              key={e.id}
              accessibilityRole="link"
              accessibilityLabel={`${e.title}. ${formatWhen(e.startsAt)}. ${e.venue.name}.${promoted.includes(e.id) ? ' Promoted.' : ''}`}
              onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
              style={({ pressed }) => [{ width: cardW }, pressed && styles.pressed]}
            >
              <View style={styles.heroCard}>
                <Cover uri={e.image} seed={e.id} category={e.category} motifSize={56} style={StyleSheet.absoluteFill} transition={200} recyclingKey={e.id} />
                <LinearGradient colors={['rgba(12,12,14,0)', 'rgba(12,12,14,0.25)', 'rgba(12,12,14,0.88)']} locations={[0.3, 0.55, 1]} style={StyleSheet.absoluteFill} />
                <View style={styles.heroText}>
                  <AppText variant="footnote" color="#FFB173" style={styles.bold}>
                    {formatWhen(e.startsAt)}
                  </AppText>
                  <AppText variant="title2" color="#FFFFFF" numberOfLines={2}>
                    {e.title}
                  </AppText>
                  <View style={styles.heroMeta}>
                    <AppText variant="subhead" color="rgba(255,255,255,0.85)" numberOfLines={1} style={styles.fill}>
                      {e.venue.name}, {e.venue.area}
                    </AppText>
                    <AppText variant="subhead" color="#FFFFFF" style={styles.bold}>
                      {from === 0 ? 'Free' : `From ${formatMoney(from, e.currency)}`}
                    </AppText>
                  </View>
                </View>
              </View>
              {promoted.includes(e.id) && (
                <AppText variant="caption" muted style={styles.promotedNote}>
                  Promoted
                </AppText>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      {events.length > 1 && (
        // Where you are in the set: a real position, not decoration.
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {events.map((e, i) => (
            <View key={e.id} style={[styles.dot, { backgroundColor: i === page ? colors.text : colors.border }, i === page && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

// Curated collections as tiles: a picture from the collection, its name and how many.
export function CollectionGrid({ items, columns }: { items: (Collection & { list: EventItem[] })[]; columns: number }) {
  if (items.length === 0) return null;
  const per = columns > 1 ? 4 : 2;
  return (
    <View style={styles.grid}>
      {items.map((c) => {
        const lead = c.list.find((e) => !!e.image) ?? c.list[0];
        return (
          <Pressable
            key={c.id}
            accessibilityRole="link"
            accessibilityLabel={`${c.title}, ${c.list.length} events`}
            onPress={() => router.push({ pathname: '/collection/[slug]', params: { slug: c.slug } })}
            style={({ pressed }) => [styles.tile, { flexBasis: `${100 / per - 2}%` }, pressed && styles.pressed]}
          >
            <Cover uri={lead.image} seed={c.slug} category={lead.category} motifSize={32} style={StyleSheet.absoluteFill} transition={150} />
            <LinearGradient colors={['rgba(12,12,14,0.05)', 'rgba(12,12,14,0.8)']} style={StyleSheet.absoluteFill} />
            <View style={styles.tileText}>
              <AppText variant="headline" color="#FFFFFF" numberOfLines={2}>
                {c.title}
              </AppText>
              <AppText variant="footnote" color="rgba(255,255,255,0.85)">
                {c.list.length} {c.list.length === 1 ? 'event' : 'events'}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  days: { gap: space.sm },
  day: { width: 56, paddingVertical: space.sm, borderRadius: radius.control, alignItems: 'center' },
  dayEmpty: { opacity: 0.45 },
  dayLabel: { fontWeight: '700' },
  dayNum: { fontVariant: ['tabular-nums'], marginVertical: -1 },
  dayCount: { fontVariant: ['tabular-nums'] },
  cats: { gap: space.sm, alignItems: 'center' },
  cat: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, minHeight: minTouchTarget - 8, paddingHorizontal: space.sm + 4, borderRadius: radius.pill },
  catText: { fontWeight: '600' },
  featured: { gap: space.sm },
  heroCard: { aspectRatio: 4 / 5, maxHeight: 460, borderRadius: radius.card, overflow: 'hidden', justifyContent: 'flex-end' },
  heroText: { padding: space.md + 4, gap: space.xs },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  promotedNote: { marginTop: space.xs },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOn: { width: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm + 4, justifyContent: 'space-between' },
  tile: { flexGrow: 1, aspectRatio: 1.25, borderRadius: radius.card, overflow: 'hidden', justifyContent: 'flex-end' },
  tileText: { padding: space.sm + 4, gap: 2 },
  railHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: space.xl, marginBottom: space.sm + 4 },
  railTitle: { flex: 1 },
  railAll: { fontWeight: '600' },
  orgRow: { gap: space.md },
  org: { width: 76, alignItems: 'center', gap: space.xs + 2 },
  orgRing: { padding: 3, borderRadius: radius.pill, borderWidth: 2 },
  orgBadge: { position: 'absolute', right: 0, bottom: 0, borderRadius: radius.pill, padding: 1 },
  orgName: { textAlign: 'center', fontWeight: '600' },
});

// Who runs things: a row of organiser logos, followed ones first, then a way
// into the full directory.
export function OrganizerRail({ bleed }: { bleed: number }) {
  const colors = useColors();
  const { following } = useAppStore();
  const load = useCallback(() => browseOrganizers(), []);
  const { data } = useRemote(load);
  if (!data || data.length === 0) return null;
  const list = [...data].sort((a, b) => Number(following.includes(b.id)) - Number(following.includes(a.id))).slice(0, 12);
  return (
    <View>
      <View style={styles.railHead}>
        <AppText variant="title2" accessibilityRole="header" style={styles.railTitle}>
          Organisers
        </AppText>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/organizers')} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <AppText variant="subhead" color={colors.accent} style={styles.railAll}>
            See all
          </AppText>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -bleed }} contentContainerStyle={[styles.orgRow, { paddingHorizontal: bleed }]}>
        {list.map((o) => {
          const on = following.includes(o.id);
          return (
            <Pressable
              key={o.id}
              accessibilityRole="link"
              accessibilityLabel={`${o.name}${o.verified ? ', verified' : ''}${on ? ', following' : ''}`}
              onPress={() => router.push({ pathname: '/organizer/[slug]', params: { slug: o.slug } })}
              style={({ pressed }) => [styles.org, pressed && { opacity: 0.75 }]}
            >
              <View style={[styles.orgRing, { borderColor: on ? colors.accent : 'transparent' }]}>
                <Avatar name={o.name} uri={o.avatar} size={60} />
                {o.verified && (
                  <View style={[styles.orgBadge, { backgroundColor: colors.background }]}>
                    <SealCheck size={16} color={colors.accent} weight="fill" />
                  </View>
                )}
              </View>
              <AppText variant="caption" numberOfLines={2} style={styles.orgName}>
                {o.name}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
