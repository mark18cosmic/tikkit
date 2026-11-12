import { router } from 'expo-router';
import { Bell, Buildings, Camera, ChartBar, Crown, GearSix, Heart, Lifebuoy, QrCode, SealCheck, ShieldStar, User, Wallet } from 'phosphor-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { Cover } from '@/components/Cover';
import { EventRow } from '@/components/EventCards';
import { OrganizerCard } from '@/components/OrganizerCard';
import { IconButton } from '@/components/IconButton';
import { Avatar, Group, Heading, Note, Row } from '@/components/SettingsList';
import { isPast, type EventItem } from '@/data/events';
import { goSignIn, useAuth } from '@/lib/auth';
import { useLayout } from '@/lib/useLayout';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// Who you are, what you've saved and who you follow. What's next lives on the
// home screen; preferences live in Settings (the gear).
export default function Account() {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useLayout();
  const store = useAppStore();
  const { session, userId, email, displayName, avatarUrl, bannerUrl } = useAuth();
  const savedEvents = store.saved.map(store.getEvent).filter((e): e is EventItem => !!e && !isPast(e));
  const st = store.status;
  const memberships = Object.keys(store.memberOf).length;
  const verifyDetail = st?.verified
    ? st.trusted
      ? 'Verified and trusted: events go live straight away'
      : 'Verified'
    : st?.verification?.status === 'pending'
      ? 'In review, usually within a day'
      : 'Needed to sell tickets and rent out spaces';

  return (
    <ScrollView contentContainerStyle={{ paddingTop: isDesktop ? space.xl : insets.top + space.md, paddingBottom: space.xl }}>
      <Container>
        <View style={styles.titleRow}>
          <AppText variant="largeTitle" accessibilityRole="header" style={styles.fill}>
            Account
          </AppText>
          <IconButton icon={GearSix} accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
        </View>

        {session ? <Identity name={displayName} email={email ?? ''} seed={userId ?? 'me'} avatar={avatarUrl} banner={bannerUrl} /> : <SignedOut />}

        {session && (
          <>
            <Group>
              <Row icon={Bell} label="Notifications" trailing={st?.unread ? String(st.unread) : undefined} onPress={() => router.push('/inbox')} />
              <Row icon={Wallet} label="Wallet" detail="Sales, resale and withdrawals" divider onPress={() => router.push('/wallet')} />
              <Row
                icon={Crown}
                label="Memberships"
                detail={memberships > 0 ? `${memberships} active` : 'Early access and member prices'}
                divider
                onPress={() => router.push('/memberships')}
              />
            </Group>
            <Heading>You run</Heading>
            <Group>
              <Row icon={ChartBar} label="Events, spaces and sales" detail="Dashboard, guest lists, promo codes" onPress={() => router.push('/organiser')} />
              <Row icon={SealCheck} label={st?.verified ? 'Verification' : 'Get verified'} detail={verifyDetail} divider onPress={() => router.push('/verify')} />
              <Row icon={Crown} label="Organiser Pro" detail={st?.proUntil && new Date(st.proUntil) > new Date() ? 'Active' : 'Lower fees, follower messages, sales charts'} divider onPress={() => router.push('/pro')} />
              <Row icon={QrCode} label="Scan tickets at the door" divider onPress={() => router.push('/scan')} />
              <Row icon={Buildings} label="Find or list a space" divider onPress={() => router.push('/venues')} />
              {st?.admin && <Row icon={ShieldStar} label="Admin" detail="Reviews, reports, transfers and payouts" divider onPress={() => router.push('/admin')} />}
            </Group>
          </>
        )}

        <Heading>Saved</Heading>
        {savedEvents.length === 0 ? (
          <Note icon={Heart} text="Tap the heart on any event to keep it here." />
        ) : (
          savedEvents.map((e) => <EventRow key={e.id} e={e} />)
        )}

        <Heading
          action={
            <Button label="Browse organisers" variant="plain" onPress={() => router.push('/organizers')} style={styles.headingBtn} />
          }
        >
          Following
        </Heading>
        {store.followed.length === 0 ? (
          <Note icon={User} text="Follow organisers to see their events first on Explore." />
        ) : (
          <View style={styles.followList}>
            {store.followed.map((o) => (
              <OrganizerCard key={o.id} org={o} />
            ))}
          </View>
        )}
        <Heading>Help</Heading>
        <Group>
          <Row icon={Lifebuoy} label="Help and safety" detail="Guarantee, refunds, spotting scams" onPress={() => router.push('/help')} />
        </Group>

        {!session && store.saved.length + store.following.length > 0 && (
          <AppText variant="footnote" muted style={styles.foot}>
            Saved on this phone only. Sign in to keep them on every device.
          </AppText>
        )}
      </Container>
    </ScrollView>
  );
}

// Tapping the card goes to Settings, where the photo, banner and name change.
function Identity({ name, email, seed, avatar, banner }: { name: string; email: string; seed: string; avatar?: string; banner?: string }) {
  const colors = useColors();
  const bare = !avatar || !banner;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Edit your profile"
      onPress={() => router.push('/settings')}
      style={({ pressed }) => [styles.card, styles.identity, { backgroundColor: colors.surface }, pressed && styles.pressed]}
    >
      <Cover uri={banner} seed={seed} style={styles.identityBanner} />
      <View style={styles.identityBody}>
        <View style={[styles.identityAvatar, { backgroundColor: colors.surface }]}>
          <Avatar name={name || email} uri={avatar} size={72} />
        </View>
        <View style={styles.identityText}>
          {!!name && <AppText variant="title3">{name}</AppText>}
          <AppText variant={name ? 'subhead' : 'headline'} muted={!!name} numberOfLines={1}>
            {email}
          </AppText>
        </View>
      </View>
      {bare && (
        <View style={[styles.identityHint, { borderColor: colors.border }]}>
          <Camera size={16} color={colors.accent} weight="bold" />
          <AppText variant="footnote" color={colors.accent} style={styles.bold}>
            {avatar ? 'Add a banner' : 'Add a profile photo'}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

function SignedOut() {
  const colors = useColors();
  return (
    <View style={[styles.card, styles.signedOut, { backgroundColor: colors.surface }]}>
      <AppText variant="headline">Sign in to Tikkit</AppText>
      <AppText variant="subhead" muted>
        Keep your tickets, saved events and follows in one account, on every phone.
      </AppText>
      <Button label="Sign in" onPress={() => goSignIn()} style={styles.signInBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  foot: { marginTop: space.sm },
  headingBtn: { minHeight: 0, paddingHorizontal: 0, paddingVertical: 0 },
  followList: { gap: space.sm },
  card: { borderRadius: radius.card, marginTop: space.md },
  identity: { overflow: 'hidden', paddingBottom: space.md, marginBottom: space.md },
  identityBanner: { aspectRatio: 3, width: '100%' },
  identityBody: { gap: space.xs, paddingHorizontal: space.md, marginTop: -40 },
  identityAvatar: { alignSelf: 'flex-start', padding: 4, borderRadius: radius.pill },
  identityText: { gap: space.xxs },
  identityHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginHorizontal: space.md,
    marginTop: space.sm,
    paddingTop: space.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  signedOut: { padding: space.md, gap: space.xs },
  signInBtn: { marginTop: space.sm },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  next: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  nextCover: { height: 120 },
  nextBody: { padding: space.md, gap: space.xs },
  nextTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'space-between' },
  nextBtn: { marginTop: space.sm },
  badge: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xxs },
  org: { padding: space.md, gap: space.md },
  orgActions: { flexDirection: 'row', gap: space.sm },
  prompts: { marginTop: space.md, marginHorizontal: -space.md },
  promptRow: { paddingHorizontal: space.md, gap: space.sm },
  prompt: { width: 172, padding: space.md, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, gap: space.xs },
  promptIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
});
