import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Crown, Flag, PencilSimple, SealCheck, UsersThree } from 'phosphor-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { Cover } from '@/components/Cover';
import { EmptyState } from '@/components/EmptyState';
import { EventRow } from '@/components/EventCards';
import { usePullRefresh } from '@/components/PullRefresh';
import { Avatar } from '@/components/SettingsList';
import { Bone } from '@/components/Skeleton';
import { Stars } from '@/components/Stars';
import { MembershipCard, TrustStats } from '@/components/Trust';
import { isPast, type EventItem } from '@/data/events';
import { fetchOrganizerPage } from '@/lib/api';
import { goSignIn, useAuth } from '@/lib/auth';
import { formatDay } from '@/lib/format';
import { fetchOrganizerReviews, fetchOrganizerTrust } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// One row per series: the next date stands in for the rest.
function groupSeries(list: EventItem[]) {
  const seen = new Map<string, number>();
  const out: { e: EventItem; more: number }[] = [];
  for (const e of list) {
    if (e.seriesId && seen.has(e.seriesId)) {
      out[seen.get(e.seriesId)!].more += 1;
      continue;
    }
    if (e.seriesId) seen.set(e.seriesId, out.length);
    out.push({ e, more: 0 });
  }
  return out;
}

export default function OrganizerScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const colors = useColors();
  const { userId, session } = useAuth();
  const { following, toggleFollow } = useAppStore();
  const followingRef = useRef(following);
  useEffect(() => {
    followingRef.current = following;
  }, [following]);
  const load = useCallback(async () => {
    const page = await fetchOrganizerPage(slug);
    if (!page) return null;
    const [trust, reviews] = await Promise.all([fetchOrganizerTrust(page.organizer.id), fetchOrganizerReviews(page.organizer.id).catch(() => [])]);
    return { ...page, trust, reviews, followingAtLoad: followingRef.current.includes(page.organizer.id) };
  }, [slug]);
  const { data, error, reload } = useRemote(load);
  const refresh = usePullRefresh(reload, { failed: !!error });

  if (data === undefined) {
    if (error) return <EmptyState icon={UsersThree} title="Couldn’t load this organiser" body={error} action={{ label: 'Try again', onPress: reload }} />;
    return (
      <Container style={styles.loading}>
        <Bone height={150} />
        <Bone width="60%" height={28} />
        <Bone height={64} />
      </Container>
    );
  }
  if (data === null) return <EmptyState icon={UsersThree} title="Organiser not found" body="The link may be old, or the page was removed." />;

  const { organizer: org, events, trust, reviews } = data;
  const isFollowing = following.includes(org.id);
  const followers = Math.max(0, data.followers + (isFollowing ? 1 : 0) - (data.followingAtLoad ? 1 : 0));
  const now = new Date();
  const listed = events.filter((e) => e.listing === 'approved');
  const upcoming = groupSeries(listed.filter((e) => !isPast(e, now) && e.status !== 'cancelled').reverse());
  const past = listed.filter((e) => isPast(e, now));
  const mine = org.ownerId === userId;

  return (
    <ScrollView refreshControl={refresh.control} onScroll={refresh.onScroll} scrollEventThrottle={refresh.scrollEventThrottle} contentContainerStyle={styles.scroll}>
      <Stack.Screen options={{ title: org.name }} />
      <Container style={styles.gap}>
        <View>
          <Cover uri={org.banner} seed={org.slug} style={styles.banner} />
          <LinearGradient colors={['transparent', colors.background]} style={styles.bannerFade} pointerEvents="none" />
          <View style={[styles.avatarRing, { backgroundColor: colors.background }]}>
            <Avatar name={org.name} uri={org.avatar} size={72} />
          </View>
        </View>

        <View style={styles.head}>
          <View style={styles.titleRow}>
            <AppText variant="title" accessibilityRole="header" style={styles.shrink}>
              {org.name}
            </AppText>
            {trust.verified && <SealCheck size={24} color={colors.accent} weight="fill" />}
          </View>
          <AppText variant="subhead" muted>
            {followers} {followers === 1 ? 'follower' : 'followers'}
            {trust.members > 0 ? `, ${trust.members} ${trust.members === 1 ? 'member' : 'members'}` : ''}
          </AppText>
          {!!org.bio && <AppText style={styles.bio}>{org.bio}</AppText>}
        </View>

        <View style={styles.actions}>
          {mine ? (
            <>
              <Button label="Edit page" icon={PencilSimple} variant="secondary" onPress={() => router.push({ pathname: '/organizer/edit', params: { id: org.id } })} style={styles.fill} />
              {!trust.membership && (
                <Button label="Start a membership" icon={Crown} variant="secondary" onPress={() => router.push({ pathname: '/organizer/membership', params: { id: org.id } })} style={styles.fill} />
              )}
            </>
          ) : (
            <Button
              label={isFollowing ? 'Following' : 'Follow'}
              variant={isFollowing ? 'secondary' : 'primary'}
              onPress={() => toggleFollow(org)}
              style={styles.fill}
            />
          )}
        </View>

        <TrustStats t={trust} />

        {trust.membership && <MembershipCard organizerId={org.id} membership={trust.membership} members={trust.members} mine={mine} />}

        <View style={styles.section}>
          <AppText variant="title3" accessibilityRole="header">
            Coming up
          </AppText>
          {upcoming.length === 0 ? (
            <AppText variant="subhead" muted>
              Nothing announced yet. Follow to see their next event first on Explore.
            </AppText>
          ) : (
            upcoming.map(({ e, more }) => (
              <View key={e.id}>
                <EventRow e={e} />
                {more > 0 && (
                  <AppText variant="footnote" color={colors.accent} style={styles.more}>
                    Repeats: {more} more {more === 1 ? 'date' : 'dates'}
                  </AppText>
                )}
              </View>
            ))
          )}
        </View>

        {reviews.length > 0 && (
          <View style={styles.section}>
            <View style={styles.titleRow}>
              <AppText variant="title3" accessibilityRole="header" style={styles.fill}>
                What people said
              </AppText>
              {trust.rating != null && <Stars value={trust.rating} />}
            </View>
            <AppText variant="footnote" muted>
              Only people who were checked in at an event can review.
            </AppText>
            {reviews.slice(0, 6).map((r) => (
              <View key={r.id} style={[styles.review, { backgroundColor: colors.surface }]}>
                <View style={styles.titleRow}>
                  <AppText variant="subhead" style={[styles.bold, styles.fill]}>
                    {r.authorName}
                  </AppText>
                  <Stars value={r.rating} size={14} />
                </View>
                {!!r.body && <AppText variant="subhead">{r.body}</AppText>}
                <AppText variant="caption" muted>
                  {formatDay(r.createdAt)}
                </AppText>
              </View>
            ))}
          </View>
        )}

        {past.length > 0 && (
          <View style={styles.section}>
            <AppText variant="title3" accessibilityRole="header">
              Past events
            </AppText>
            {past.slice(0, 10).map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </View>
        )}

        {!mine && (
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              session ? router.push({ pathname: '/report', params: { kind: 'organizer', id: org.id, title: org.name } }) : goSignIn(`/organizer/${org.slug}`)
            }
            style={({ pressed }) => [styles.report, pressed && { opacity: 0.6 }]}
          >
            <Flag size={16} color={colors.textMuted} />
            <AppText variant="footnote" muted>
              Pretending to be someone, or asking for payment elsewhere? Report this page
            </AppText>
          </Pressable>
        )}
      </Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { gap: space.md, paddingTop: space.md },
  scroll: { paddingVertical: space.md, paddingBottom: space.xxl },
  gap: { gap: space.lg },
  banner: { aspectRatio: 3, width: '100%', minHeight: 130, borderRadius: radius.card },
  bannerFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 60, borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card },
  avatarRing: { position: 'absolute', left: space.md, bottom: -36, padding: 4, borderRadius: radius.pill },
  head: { gap: space.xs, marginTop: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  shrink: { flexShrink: 1 },
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  bio: { marginTop: space.sm },
  actions: { flexDirection: 'row', gap: space.sm },
  section: { gap: space.sm },
  more: { fontWeight: '600', marginLeft: 96 + space.md, marginTop: -space.xs },
  review: { padding: space.md, borderRadius: radius.control, gap: space.xs },
  report: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs + 2, paddingVertical: space.sm },
});
