import { router } from 'expo-router';
import { Ticket as TicketIcon, UserCircle } from 'phosphor-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { usePullRefresh } from '@/components/PullRefresh';
import { TicketCard } from '@/components/TicketCard';
import { isPast } from '@/data/events';
import { goSignIn, useAuth } from '@/lib/auth';
import { useLayout } from '@/lib/useLayout';
import { ticketStatus, useAppStore, type Ticket } from '@/store/AppStore';
import { space } from '@/theme/tokens';

export default function Tickets() {
  const insets = useSafeAreaInsets();
  const { isDesktop, isWide } = useLayout();
  const { tickets, ticketsState, getEvent, refreshTickets } = useAppStore();
  const refresh = usePullRefresh(refreshTickets, { failed: ticketsState === 'error' });
  const { session, ready } = useAuth();
  const now = new Date();

  const rows = tickets
    .map((t) => ({ t, e: getEvent(t.eventId) }))
    .filter((x) => !!x.e)
    .sort((a, b) => a.e!.startsAt.localeCompare(b.e!.startsAt));
  const live = (t: Ticket) => ticketStatus(t) === 'active' || ticketStatus(t) === 'checkedIn';
  const upcoming = rows.filter(({ t, e }) => live(t) && !isPast(e!, now)).map((x) => x.t);
  const other = rows.filter(({ t, e }) => !live(t) || isPast(e!, now)).map((x) => x.t).reverse();

  // Tickets from one order in the same state show as one card ("2 tickets").
  const grid = (list: Ticket[]) => {
    const groups = new Map<string, Ticket[]>();
    for (const t of list) {
      const key = `${t.orderId}:${ticketStatus(t)}`;
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return (
      <View style={[styles.list, isWide && styles.grid]}>
        {[...groups.values()].map((g) => (
          <View key={g[0].id} style={isWide ? styles.cell : undefined}>
            <TicketCard ticket={g[0]} count={g.length} />
          </View>
        ))}
      </View>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: isDesktop ? space.xl : insets.top + space.md, paddingBottom: space.xl }}
      refreshControl={session ? refresh.control : undefined}
      onScroll={refresh.onScroll}
      scrollEventThrottle={refresh.scrollEventThrottle}
    >
      <Container wide={isWide}>
        <AppText variant="largeTitle" accessibilityRole="header">
          Tickets
        </AppText>
        {ready && !session ? (
          <EmptyState
            icon={UserCircle}
            title="Sign in to see your tickets"
            body="Tickets are kept in your account, so they’re on every phone you sign in to, and they still open offline."
            action={{ label: 'Sign in', onPress: () => goSignIn('/tickets') }}
          />
        ) : ticketsState === 'error' && tickets.length === 0 ? (
          <EmptyState
            icon={TicketIcon}
            title="Couldn’t load your tickets"
            body="Check your connection, then try again."
            action={{ label: 'Try again', onPress: refreshTickets }}
          />
        ) : ticketsState === 'ready' && tickets.length === 0 ? (
          <EmptyState
            icon={TicketIcon}
            title="No tickets yet"
            body="Tickets you buy show up here, ready to scan at the door. They work offline."
            action={{ label: 'Explore events', onPress: () => router.navigate('/') }}
          />
        ) : (
          <>
            {upcoming.length > 0 && (
              <View style={styles.group}>
                <AppText variant="title3" accessibilityRole="header">
                  Upcoming
                </AppText>
                {grid(upcoming)}
              </View>
            )}
            {other.length > 0 && (
              <View style={styles.group}>
                <AppText variant="title3" accessibilityRole="header">
                  Past, sent and refunded
                </AppText>
                {grid(other)}
              </View>
            )}
          </>
        )}
      </Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm + 4, marginTop: space.lg },
  list: { gap: space.sm + 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '49%', flexGrow: 1, minWidth: 320 },
});
