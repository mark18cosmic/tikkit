import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Boat, Buildings, CalendarBlank, Flag, MapPin, PencilSimple, Plus, SealCheck, Users } from 'phosphor-react-native';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Cover } from '@/components/Cover';
import { usePullRefresh } from '@/components/PullRefresh';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { ReviewList } from '@/components/Reviews';
import { Stars } from '@/components/Stars';
import { BookingLine, formatRate, ListGroup } from '@/components/VenueCards';
import { fetchBookings, fetchBusy, fetchVenue, fetchVenueReviews } from '@/lib/api';
import { goSignIn, useAuth } from '@/lib/auth';
import { formatRange } from '@/lib/format';
import { useLayout } from '@/lib/useLayout';
import { useRemote } from '@/lib/useRemote';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId, session } = useAuth();
  const { isWide } = useLayout();

  const load = useCallback(async () => {
    const venue = await fetchVenue(id);
    if (!venue) return null;
    const mine = !!userId && venue.ownerId === userId;
    const [busy, bookings, reviews] = await Promise.all([
      fetchBusy(id),
      mine ? fetchBookings().then((all) => all.filter((b) => b.venueId === id)) : Promise.resolve([]),
      fetchVenueReviews(id).catch(() => []),
    ]);
    return { venue, busy, bookings, mine, reviews };
  }, [id, userId]);
  const { data, loading, error, reload } = useRemote(load);
  const refresh = usePullRefresh(reload, { failed: !!error });

  if (data === undefined) {
    return (
      <View style={styles.center}>
        {loading ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : (
          <EmptyState icon={Buildings} title="Couldn’t load this space" body={error ?? ''} action={{ label: 'Try again', onPress: reload }} />
        )}
      </View>
    );
  }
  if (data === null || (data.venue.archived && !data.mine)) {
    return <EmptyState icon={Buildings} title="Space not found" body="It may have been taken off Tikkit." />;
  }

  const { venue: v, busy, bookings, mine, reviews } = data;
  const now = new Date();
  const waiting = bookings.filter((b) => b.status === 'pending' && new Date(b.startsAt) > now);
  const upcoming = bookings.filter((b) => b.status === 'approved' && new Date(b.endsAt) > now);
  const book = () =>
    session
      ? router.push({ pathname: '/venues/book/[id]', params: { id: v.id } })
      : goSignIn(`/venues/book/${v.id}`);

  return (
    <View style={styles.fill}>
      <Stack.Screen options={{ title: v.name }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={refresh.control}
        onScroll={refresh.onScroll}
        scrollEventThrottle={refresh.scrollEventThrottle}
      >
        <Container style={styles.gap}>
          <Cover uri={v.image} seed={v.id} style={[styles.hero, isWide && styles.heroWide, { backgroundColor: colors.surface }]} transition={200} />

          <View style={styles.titleBlock}>
            <AppText variant="title" accessibilityRole="header">
              {v.name}
            </AppText>
            {v.forRent ? (
              <AppText variant="headline" color={colors.accent}>
                {formatRate(v)}
                {v.minHours > 1 ? `, ${v.minHours} hours minimum` : ''}
              </AppText>
            ) : (
              mine && (
                <AppText variant="subhead" muted>
                  Only you can see this venue. Turn on renting to list it.
                </AppText>
              )
            )}
          </View>

          {v.rating && (
            <View style={styles.ratingRow}>
              <Stars value={v.rating.average} />
              <AppText variant="subhead" muted>
                {v.rating.average.toFixed(1)}, {v.rating.count} {v.rating.count === 1 ? 'review' : 'reviews'}
              </AppText>
            </View>
          )}

          {v.verified ? (
            <View style={styles.ratingRow}>
              <SealCheck size={18} color={colors.accent} weight="fill" />
              <AppText variant="subhead" muted>
                Verified by Tikkit: right to rent and location checked
              </AppText>
            </View>
          ) : (
            mine && (
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push({ pathname: '/verify/space/[id]', params: { id: v.id } })}
                style={[styles.verify, { backgroundColor: colors.surface, borderColor: colors.accent }]}
              >
                <SealCheck size={22} color={colors.accent} />
                <View style={styles.flex1}>
                  <AppText variant="headline">Verify this space to rent it out</AppText>
                  <AppText variant="subhead" muted>
                    Renters only see verified spaces. Send proof you can rent it, then share your location while you’re there.
                  </AppText>
                </View>
              </Pressable>
            )
          )}

          <View style={styles.facts}>
            <Fact icon={Users} text={`Up to ${v.capacity} people`} />
            <Fact icon={MapPin} text={`${v.address}, ${v.area}`} />
            {v.access && <Fact icon={Boat} text={v.access} />}
          </View>

          {v.amenities.length > 0 && (
            <View style={styles.tags}>
              {v.amenities.map((a) => (
                <View key={a} style={[styles.tag, { backgroundColor: colors.surface }]}>
                  <AppText variant="subhead">{a}</AppText>
                </View>
              ))}
            </View>
          )}

          {!!v.description && <AppText>{v.description}</AppText>}

          {mine ? (
            <>
              <View style={styles.actions}>
                <Button
                  label="Create event here"
                  icon={Plus}
                  onPress={() => router.push({ pathname: '/organiser/new', params: { venue: v.id } })}
                />
                <Button
                  label="Edit space"
                  icon={PencilSimple}
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/venues/edit', params: { id: v.id } })}
                />
              </View>
              <Section title="Waiting for your reply" empty={v.forRent ? 'No new requests.' : undefined}>
                {waiting.length > 0 && (
                  <ListGroup>
                    {waiting.map((b, i) => (
                      <BookingLine key={b.id} b={b} side="owner" divider={i > 0} />
                    ))}
                  </ListGroup>
                )}
              </Section>
              <Section title="Coming up" empty="Nothing booked yet.">
                {upcoming.length > 0 && (
                  <ListGroup>
                    {upcoming.map((b, i) => (
                      <BookingLine key={b.id} b={b} side="owner" divider={i > 0} />
                    ))}
                  </ListGroup>
                )}
              </Section>
            </>
          ) : (
            <Section title="Already booked" empty="Nothing booked in the next 90 days. Any time is open.">
              {busy.length > 0 && (
                <View style={styles.busy}>
                  {busy.slice(0, 12).map((s) => (
                    <View key={s.startsAt} style={styles.busyRow}>
                      <CalendarBlank size={18} color={colors.textMuted} />
                      <AppText variant="subhead">{formatRange(s.startsAt, s.endsAt)}</AppText>
                    </View>
                  ))}
                  {busy.length > 12 && (
                    <AppText variant="footnote" muted>
                      And {busy.length - 12} more.
                    </AppText>
                  )}
                </View>
              )}
            </Section>
          )}
          {(v.forRent || reviews.length > 0) && (
            <Section title="Reviews">
              <ReviewList reviews={reviews} canReply={mine} onChanged={reload} />
            </Section>
          )}
          {!mine && (
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                session
                  ? router.push({ pathname: '/report', params: { kind: 'venue', id: v.id, title: v.name } })
                  : goSignIn(`/venues/${v.id}`)
              }
              style={({ pressed }) => [styles.report, pressed && { opacity: 0.6 }]}
            >
              <Flag size={16} color={colors.textMuted} />
              <AppText variant="footnote" muted>
                Something wrong with this space? Report it
              </AppText>
            </Pressable>
          )}
        </Container>
      </ScrollView>

      {!mine && v.forRent && (
        <View
          style={[
            styles.bar,
            { paddingBottom: Math.max(insets.bottom, space.md), backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <Container>
            <Button label="Request to book" onPress={book} />
          </Container>
        </View>
      )}
    </View>
  );
}

function Fact({ icon: IconCmp, text }: { icon: typeof Users; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.fact}>
      <IconCmp size={20} color={colors.textMuted} />
      <AppText style={styles.fill}>{text}</AppText>
    </View>
  );
}

function Section({ title, empty, children }: { title: string; empty?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="title3" accessibilityRole="header">
        {title}
      </AppText>
      {children ||
        (empty && (
          <AppText variant="subhead" muted>
            {empty}
          </AppText>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, gap: space.xxs },
  verify: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.control, borderLeftWidth: 4 },
  report: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, paddingVertical: space.sm, alignSelf: 'flex-start' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingVertical: space.md },
  gap: { gap: space.lg },
  hero: { aspectRatio: 3 / 2, borderRadius: radius.card },
  heroWide: { aspectRatio: undefined, height: 320 },
  titleBlock: { gap: space.xs },
  facts: { gap: space.sm + 2 },
  fact: { flexDirection: 'row', gap: space.sm + 4, alignItems: 'flex-start' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: { paddingHorizontal: space.sm + 4, paddingVertical: space.xs + 2, borderRadius: radius.pill },
  actions: { gap: space.sm },
  section: { gap: space.sm },
  busy: { gap: space.sm },
  busyRow: { flexDirection: 'row', gap: space.sm + 4, alignItems: 'center' },
  bar: { paddingTop: space.sm + 4, borderTopWidth: StyleSheet.hairlineWidth },
});
