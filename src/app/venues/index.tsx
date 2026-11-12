import { router } from 'expo-router';
import { Buildings, Plus, Star } from '@/components/icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Cover } from '@/components/Cover';
import { usePullRefresh } from '@/components/PullRefresh';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { formatRate } from '@/components/VenueCards';
import type { Venue } from '@/data/venues';
import { fetchRentableVenues } from '@/lib/api';
import { goSignIn, useAuth } from '@/lib/auth';
import { useLayout } from '@/lib/useLayout';
import { useRemote } from '@/lib/useRemote';
import { brand, radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function FindSpace() {
  const colors = useColors();
  const { columns, isWide } = useLayout();
  const { session } = useAuth();
  const { data, loading, error, reload } = useRemote(fetchRentableVenues);
  const refresh = usePullRefresh(reload, { failed: !!error });
  const [area, setArea] = useState<string | null>(null);
  const venues = useMemo(() => data ?? [], [data]);
  const areas = useMemo(() => [...new Set(venues.map((v) => v.area))].sort(), [venues]);
  const shown = area ? venues.filter((v) => v.area === area) : venues;

  const listSpace = () => (session ? router.push('/venues/edit') : goSignIn('/venues/edit'));

  if (!data && loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={refresh.control}
        onScroll={refresh.onScroll}
        scrollEventThrottle={refresh.scrollEventThrottle}
    >
      <Container wide={isWide} style={styles.gap}>
        <AppText muted>Rooftops, halls and studios you can book for your event. Send a request and the owner replies here.</AppText>

        {areas.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="All" selected={area === null} onPress={() => setArea(null)} />
            {areas.map((a) => (
              <Chip key={a} label={a} selected={area === a} onPress={() => setArea(area === a ? null : a)} />
            ))}
          </ScrollView>
        )}

        {error && !data ? (
          <EmptyState icon={Buildings} title="Couldn’t load spaces" body={error} action={{ label: 'Try again', onPress: reload }} />
        ) : shown.length === 0 ? (
          <EmptyState icon={Buildings} title="No spaces listed yet" body="Own a venue? List it and organisers can book it." />
        ) : (
          <View style={styles.grid}>
            {shown.map((v) => (
              <View key={v.id} style={{ width: `${100 / columns}%`, padding: space.sm }}>
                <VenueCard v={v} />
              </View>
            ))}
          </View>
        )}

        <View style={[styles.cta, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
          <AppText variant="headline">Have a space?</AppText>
          <AppText variant="subhead" muted>
            List it for free. You choose the price and approve every booking.
          </AppText>
          <Button label="List your space" icon={Plus} variant="secondary" onPress={listSpace} style={styles.ctaBtn} />
        </View>
      </Container>
    </ScrollView>
  );
}

function VenueCard({ v }: { v: Venue }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${v.name}, ${v.area}. Up to ${v.capacity} people. ${formatRate(v)}.`}
      onPress={() => router.push({ pathname: '/venues/[id]', params: { id: v.id } })}
      style={({ pressed }) => [pressed && { opacity: 0.85 }]}
    >
      <Cover uri={v.image} seed={v.id} style={[styles.image, { backgroundColor: colors.surface }]} transition={200} />
      <View style={styles.meta}>
        <AppText variant="headline" numberOfLines={1}>
          {v.name}
        </AppText>
        <AppText variant="subhead" muted numberOfLines={1}>
          {v.area}, up to {v.capacity} people
        </AppText>
        <View style={styles.rateRow}>
          <AppText variant="subhead" style={[styles.bold, styles.fill]}>
            {formatRate(v)}
          </AppText>
          {v.rating && (
            <View style={styles.rateRow}>
              <Star size={14} color={brand.peach} weight="fill" />
              <AppText variant="subhead" style={styles.bold}>
                {v.rating.average.toFixed(1)}
              </AppText>
              <AppText variant="subhead" muted>
                ({v.rating.count})
              </AppText>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingVertical: space.lg },
  gap: { gap: space.lg },
  chips: { gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.sm },
  image: { aspectRatio: 3 / 2, borderRadius: radius.card },
  meta: { paddingTop: space.sm + 2, gap: space.xxs },
  bold: { fontWeight: '600' },
  cta: { padding: space.md, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, gap: space.xs },
  ctaBtn: { marginTop: space.sm },
});
