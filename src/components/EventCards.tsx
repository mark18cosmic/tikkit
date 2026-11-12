import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Cover } from './Cover';
import { inPresale, isPast, type EventItem } from '@/data/events';
import { formatMoney, formatWhen } from '@/lib/format';
import { formatDistance } from '@/lib/location';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

const open = (id: string) => router.push({ pathname: '/event/[id]', params: { id } });

function usePriceLabel(e: EventItem) {
  const { remaining } = useAppStore();
  if (e.status === 'cancelled') return 'Cancelled';
  if (isPast(e)) return 'Ended';
  const open = e.tiers.filter((t) => remaining(e.id, t.id) > 0);
  if (open.length === 0) return 'Sold out';
  const p = Math.min(...open.map((t) => t.price));
  return p === 0 ? 'Free' : `From ${formatMoney(p, e.currency)}`;
}

function a11yLabel(e: EventItem, price: string, km?: number) {
  const dist = km === undefined ? '' : ` ${formatDistance(km)} away.`;
  return `${e.title}. ${formatWhen(e.startsAt)}. ${e.venue.name}, ${e.venue.area}.${dist} ${price}.`;
}

type CardProps = { e: EventItem; km?: number };

// RN Web exposes `hovered` on Pressable state; native never sets it.
const hoverStyle = (s: { pressed: boolean }) =>
  [(s as { hovered?: boolean }).hovered && styles.hovered, s.pressed && styles.pressed];

function Meta({ e, km, lines = 2 }: CardProps & { lines?: number }) {
  const colors = useColors();
  const price = usePriceLabel(e);
  const promoted = useAppStore().promoted.includes(e.id);
  return (
    <View style={styles.meta}>
      <AppText variant="footnote" color={colors.accent} style={styles.when}>
        {formatWhen(e.startsAt)}
      </AppText>
      <AppText variant="headline" numberOfLines={lines}>
        {e.title}
      </AppText>
      <AppText variant="subhead" muted numberOfLines={1}>
        {e.venue.name}, {e.venue.area}
        {km !== undefined ? `, ${formatDistance(km)}` : ''}
      </AppText>
      <View style={styles.priceRow}>
        <AppText variant="subhead" style={styles.price}>
          {price}
        </AppText>
        {promoted && (
          <AppText variant="caption" muted accessibilityLabel="Promoted listing">
            Promoted
          </AppText>
        )}
        {inPresale(e) && (
          <AppText variant="caption" color={colors.accent}>
            Members presale
          </AppText>
        )}
        {!!e.seriesId && !inPresale(e) && (
          <AppText variant="caption" muted>
            More dates
          </AppText>
        )}
      </View>
    </View>
  );
}

// Weekend carousel card.
export const FeaturedCard = memo(function FeaturedCard({ e, width, km }: CardProps & { width?: number }) {
  const colors = useColors();
  const price = usePriceLabel(e);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={a11yLabel(e, price, km)}
      onPress={() => open(e.id)}
      style={(s) => [width ? { width } : styles.flex, ...hoverStyle(s)]}
    >
      <Cover uri={e.image} seed={e.id} category={e.category} style={[styles.featuredImage, { backgroundColor: colors.surface }]} transition={200} recyclingKey={e.id} />
      <Meta e={e} km={km} />
    </Pressable>
  );
});

// Compact list row for phone widths.
export const EventRow = memo(function EventRow({ e, km }: CardProps) {
  const colors = useColors();
  const price = usePriceLabel(e);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={a11yLabel(e, price, km)}
      onPress={() => open(e.id)}
      style={(s) => [styles.row, ...hoverStyle(s)]}
    >
      <Cover uri={e.image} seed={e.id} category={e.category} motifSize={26} style={[styles.thumb, { backgroundColor: colors.surface }]} transition={150} recyclingKey={e.id} />
      <View style={styles.rowText}>
        <Meta e={e} km={km} />
      </View>
    </Pressable>
  );
});

// Grid tile for tablet and desktop widths.
export const EventTile = memo(function EventTile({ e, km }: CardProps) {
  const colors = useColors();
  const price = usePriceLabel(e);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={a11yLabel(e, price, km)}
      onPress={() => open(e.id)}
      style={(s) => [styles.tile, ...hoverStyle(s)]}
    >
      <Cover uri={e.image} seed={e.id} category={e.category} style={[styles.tileImage, { backgroundColor: colors.surface }]} transition={150} recyclingKey={e.id} />
      <Meta e={e} km={km} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  hovered: { opacity: 0.92 },
  flex: { flex: 1 },
  meta: { gap: space.xxs, paddingTop: space.sm },
  when: { fontWeight: '600' },
  price: { fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: space.xxs },
  featuredImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.card },
  row: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm },
  thumb: { width: 96, height: 96, borderRadius: radius.control, marginTop: space.sm },
  rowText: { flex: 1 },
  tile: { flex: 1, paddingBottom: space.lg },
  tileImage: { width: '100%', aspectRatio: 3 / 2, borderRadius: radius.card },
});
