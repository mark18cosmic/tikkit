import { router } from 'expo-router';
import { Crown } from '@/components/icons';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { OrganizerCard } from '@/components/OrganizerCard';
import { usePullRefresh } from '@/components/PullRefresh';
import { SignInRequired } from '@/components/SignInRequired';
import { Bone } from '@/components/Skeleton';
import { MembershipCard } from '@/components/Trust';
import { fetchMyMembershipDetails } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { space } from '@/theme/tokens';

export default function MembershipsScreen() {
  return (
    <SignInRequired title="Sign in to see your memberships" body="Memberships you join are kept in your account.">
      <Memberships />
    </SignInRequired>
  );
}

// Every organiser you're a member of, with the perks and a way to leave.
function Memberships() {
  const { memberOf } = useAppStore();
  // Reloads after leaving, when the store's list changes.
  const key = Object.keys(memberOf).sort().join(',');
  const load = useCallback(() => fetchMyMembershipDetails(), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, error, reload } = useRemote(load);
  const refresh = usePullRefresh(reload, { failed: !!error });

  if (data === undefined) {
    if (error) return <EmptyState icon={Crown} title="Couldn’t load memberships" body={error} action={{ label: 'Try again', onPress: reload }} />;
    return (
      <Container style={styles.loading}>
        <Bone height={72} />
        <Bone height={140} />
      </Container>
    );
  }
  if (data.length === 0) {
    return (
      <EmptyState
        icon={Crown}
        title="No memberships"
        body="Some organisers sell memberships for early access and member prices. Look for them on organiser pages."
        action={{ label: 'Browse organisers', onPress: () => router.push('/organizers') }}
      />
    );
  }
  return (
    <ScrollView refreshControl={refresh.control} onScroll={refresh.onScroll} scrollEventThrottle={refresh.scrollEventThrottle} contentContainerStyle={styles.scroll}>
      <Container style={styles.gap}>
        <AppText variant="subhead" muted>
          Memberships don’t renew on their own. Leave within 7 days, before using a perk, for a full refund.
        </AppText>
        {data.map((m) => (
          <View key={m.organizer.id} style={styles.item}>
            <OrganizerCard org={m.organizer} label="Member of" />
            <MembershipCard organizerId={m.organizer.id} membership={m.membership} members={0} mine={false} />
          </View>
        ))}
      </Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { gap: space.md, paddingTop: space.md },
  scroll: { paddingVertical: space.md, paddingBottom: space.xxl },
  gap: { gap: space.lg },
  item: { gap: space.sm },
});
