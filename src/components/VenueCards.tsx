import { router } from 'expo-router';
import { CaretRight } from '@/components/icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Cover } from './Cover';
import { statusLabel, type Booking, type BookingStatus, type Venue } from '@/data/venues';
import { formatMoney, formatRange } from '@/lib/format';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export const formatRate = (v: Pick<Venue, 'hourlyRate'>) =>
  v.hourlyRate === undefined ? '' : v.hourlyRate === 0 ? 'Free to book' : `${formatMoney(v.hourlyRate)} an hour`;

// One rounded group of rows, like iOS Settings.
export function ListGroup({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return <View style={[styles.group, { backgroundColor: colors.surface }]}>{children}</View>;
}

function Line({
  image,
  seed,
  title,
  subtitle,
  trailing,
  divider,
  label,
  onPress,
}: {
  image: string;
  seed: string;
  title: string;
  subtitle: string;
  trailing?: React.ReactNode;
  divider: boolean;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.line,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Cover uri={image} seed={seed} style={[styles.thumb, { backgroundColor: colors.border }]} />
      <View style={styles.fill}>
        <AppText variant="headline" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="subhead" muted numberOfLines={2}>
          {subtitle}
        </AppText>
      </View>
      {trailing}
      <CaretRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export function VenueLine({ v, divider = false, showRent = false }: { v: Venue; divider?: boolean; showRent?: boolean }) {
  const subtitle = [v.area, `up to ${v.capacity} people`, showRent ? (v.forRent ? formatRate(v) : 'Not for rent') : '']
    .filter(Boolean)
    .join(', ');
  return (
    <Line
      image={v.image}
      seed={v.id}
      title={v.name}
      subtitle={subtitle}
      divider={divider}
      label={`${v.name}. ${subtitle}.`}
      onPress={() => router.push({ pathname: '/venues/[id]', params: { id: v.id } })}
    />
  );
}

export function BookingLine({ b, divider = false, side }: { b: Booking; divider?: boolean; side: 'owner' | 'requester' }) {
  const title = side === 'owner' ? (b.ownUse ? 'Your event' : b.requesterName) : (b.venue?.name ?? 'A space');
  const where = side === 'owner' ? b.venue?.name : b.venue?.area;
  const subtitle = [formatRange(b.startsAt, b.endsAt), where].filter(Boolean).join(', ');
  return (
    <Line
      image={b.venue?.image ?? ''}
      seed={b.venueId}
      title={title}
      subtitle={subtitle}
      trailing={<StatusPill status={b.status} />}
      divider={divider}
      label={`${title}. ${subtitle}. ${statusLabel[b.status]}.`}
      onPress={() => router.push({ pathname: '/bookings/[id]', params: { id: b.id } })}
    />
  );
}

export function StatusPill({ status }: { status: BookingStatus }) {
  const colors = useColors();
  const tint =
    status === 'approved' ? colors.success : status === 'pending' ? colors.accent : colors.textMuted;
  const short = status === 'pending' ? 'Waiting' : statusLabel[status];
  return (
    <View style={[styles.pill, { borderColor: tint }]}>
      <AppText variant="caption" color={tint}>
        {short}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  group: { borderRadius: radius.control, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm + 4 },
  thumb: { width: 48, height: 48, borderRadius: radius.control - 4 },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xxs },
});
