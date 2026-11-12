import { router, type Href } from 'expo-router';
import {
  Bank,
  BellSimple,
  CheckCircle,
  CreditCard,
  Gift,
  MegaphoneSimple,
  SealCheck,
  Ticket,
  type Icon,
} from '@/components/icons';
import { useCallback, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { usePullRefresh } from '@/components/PullRefresh';
import { SignInRequired } from '@/components/SignInRequired';
import { ListSkeleton } from '@/components/Skeleton';
import type { AppNotification } from '@/data/trust';
import { fetchNotifications, markNotificationsRead } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

const icons: Record<string, Icon> = {
  verification: SealCheck,
  listing: CheckCircle,
  payment: CreditCard,
  refund: CreditCard,
  payout: Bank,
  gift: Gift,
  waitlist: Ticket,
  resale: Ticket,
  broadcast: MegaphoneSimple,
  booking: CheckCircle,
};

export default function InboxScreen() {
  return (
    <SignInRequired title="Sign in to see updates" body="Payments, tickets coming back on sale and messages from organisers you follow.">
      <Inbox />
    </SignInRequired>
  );
}

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
}

function Inbox() {
  const colors = useColors();
  const { refreshStatus } = useAppStore();
  const load = useCallback(() => fetchNotifications(), []);
  const { data, loading, error, reload } = useRemote(load);
  const refresh = usePullRefresh(reload, { failed: !!error });

  // Opening the inbox counts as reading it.
  const unread = data?.some((n) => !n.readAt);
  useEffect(() => {
    if (unread) markNotificationsRead().then(refreshStatus, () => {});
  }, [unread, refreshStatus]);

  const open = (n: AppNotification) => n.link && router.push(n.link as Href);

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={refresh.control}
      onScroll={refresh.onScroll}
      scrollEventThrottle={refresh.scrollEventThrottle}
    >
      <Container>
        {!data && loading ? (
          <ListSkeleton rows={5} />
        ) : error && !data ? (
          <EmptyState icon={BellSimple} title="Can’t load updates" body={error} action={{ label: 'Try again', onPress: reload }} />
        ) : !data?.length ? (
          <EmptyState icon={BellSimple} title="Nothing yet" body="Payment receipts, verification decisions and tickets coming back on sale show up here." />
        ) : (
          <View style={[styles.group, { backgroundColor: colors.surface }]}>
            {data.map((n, i) => {
              const IconCmp = icons[n.kind] ?? BellSimple;
              return (
                <Pressable
                  key={n.id}
                  accessibilityRole={n.link ? 'link' : 'text'}
                  disabled={!n.link}
                  onPress={() => open(n)}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.icon, { backgroundColor: n.readAt ? colors.background : colors.accent }]}>
                    <IconCmp size={18} color={n.readAt ? colors.text : colors.onAccent} weight="bold" />
                  </View>
                  <View style={styles.fill}>
                    <AppText variant="headline">{n.title}</AppText>
                    {!!n.body && (
                      <AppText variant="subhead" muted>
                        {n.body}
                      </AppText>
                    )}
                    <AppText variant="footnote" muted style={styles.when}>
                      {ago(n.createdAt)}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: space.lg },
  fill: { flex: 1 },
  group: { borderRadius: radius.control, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: space.md, padding: space.md },
  icon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  when: { marginTop: space.xxs },
});
