import { router } from 'expo-router';
import { CaretRight } from '@/components/icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Cover } from './Cover';
import { formatWhen } from '@/lib/format';
import { ticketStatus, useAppStore, type Ticket } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// `count` > 1 shows a group of tickets from one order as a single card.
export function TicketCard({ ticket, count = 1 }: { ticket: Ticket; count?: number }) {
  const colors = useColors();
  const { getEvent, announcements, seenUpdates } = useAppStore();
  const event = getEvent(ticket.eventId);
  if (!event) return null;
  const tier = event.tiers.find((t) => t.id === ticket.tierId);
  const state = ticketStatus(ticket);
  const status =
    state === 'checkedIn'
      ? 'Checked in'
      : state === 'transferred'
        ? `Sent to ${ticket.transferredTo?.name}`
        : state === 'refundRequested'
          ? 'Refund requested'
          : ticket.listedForResale
            ? 'On resale'
            : event.status === 'cancelled'
            ? 'Event cancelled'
            : ticket.seatLabel ?? tier?.name ?? 'Ticket';
  const inactive = state === 'transferred' || state === 'refundRequested';
  const latest = announcements.find((a) => a.eventId === event.id);
  const unseen = !inactive && !!latest && seenUpdates[event.id] !== latest.createdAt;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${formatWhen(event.startsAt)}, ${count > 1 ? `${count} tickets` : status}. Show ${count > 1 ? 'tickets' : 'ticket'}.`}
      onPress={() => router.push({ pathname: '/ticket/[code]', params: { code: ticket.code } })}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.elevated, borderColor: colors.border },
        inactive && styles.inactive,
        pressed && styles.pressed,
      ]}
    >
      <Cover uri={event.image} seed={event.id} category={event.category} motifSize={22} style={[styles.thumb, { backgroundColor: colors.surface }]} />
      <View style={styles.text}>
        <View style={styles.top}>
          <AppText variant="footnote" color={colors.accent} style={styles.bold}>
            {formatWhen(event.startsAt)}
          </AppText>
          {unseen && (
            <View style={[styles.badge, { backgroundColor: colors.accent }]}>
              <AppText variant="caption" color={colors.onAccent}>
                New update
              </AppText>
            </View>
          )}
        </View>
        <AppText variant="headline" numberOfLines={2}>
          {event.title}
        </AppText>
        <AppText variant="subhead" muted numberOfLines={1}>
          {count > 1 ? `${count} tickets, ${status}` : `${status}, ${ticket.code}`}
        </AppText>
      </View>
      <CaretRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm + 4,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  inactive: { opacity: 0.6 },
  thumb: { width: 64, height: 64, borderRadius: radius.control },
  text: { flex: 1, gap: space.xxs },
  bold: { fontWeight: '600' },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  badge: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xxs },
});
