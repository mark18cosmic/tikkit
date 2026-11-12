import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { FileText, MapPin, SmileySad } from '@/components/icons';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Decision } from '@/components/admin/Decision';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { SignInRequired } from '@/components/SignInRequired';
import { ListSkeleton } from '@/components/Skeleton';
import { idKinds } from '@/data/trust';
import { fetchVenue } from '@/lib/api';
import { openDirections } from '@/lib/maps';
import { documentUrl, fetchAdminUser, fetchVerification, reviewVerification, suspendUser } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function AdminVerificationScreen() {
  return (
    <SignInRequired title="Admins only" body="Sign in with an admin account.">
      <Review />
    </SignInRequired>
  );
}

function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const load = useCallback(async () => {
    const v = await fetchVerification(id);
    if (!v) return null;
    const [user, venue] = await Promise.all([fetchAdminUser(v.userId), v.venueId ? fetchVenue(v.venueId) : Promise.resolve(null)]);
    return { v, user, venue };
  }, [id]);
  const { data, loading } = useRemote(load);
  const [docError, setDocError] = useState<string | null>(null);

  if (loading && !data) return <Container><ListSkeleton rows={5} /></Container>;
  if (!data) return <EmptyState icon={SmileySad} title="Not found" body="It may have been handled already." />;
  const { v, user, venue } = data;

  const open = async (path?: string) => {
    if (!path) return;
    setDocError(null);
    try {
      await WebBrowser.openBrowserAsync(await documentUrl(path));
    } catch (e) {
      setDocError(e instanceof Error ? e.message : 'Couldn’t open the document.');
    }
  };

  const rows: [string, string | undefined][] =
    v.kind === 'identity'
      ? [
          ['Legal name', v.legalName],
          ['Phone', v.phone],
          ['Document', idKinds.find((k) => k.id === v.idKind)?.label],
          ['Number', v.idNumber],
          ['Business', v.businessName],
        ]
      : [
          ['Space', venue ? `${venue.name}, ${venue.area}` : v.venueId],
          ['Address', venue?.address],
          ['Owner', v.legalName],
        ];

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Container style={styles.gap}>
        <AppText variant="title2" accessibilityRole="header">
          {v.kind === 'identity' ? 'Identity check' : 'Space check'}
        </AppText>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {rows
            .filter(([, value]) => !!value)
            .map(([label, value]) => (
              <View key={label} style={styles.kv}>
                <AppText variant="subhead" muted>
                  {label}
                </AppText>
                <AppText variant="subhead" style={styles.value} selectable>
                  {value}
                </AppText>
              </View>
            ))}
          {!!v.note && <AppText variant="subhead">“{v.note}”</AppText>}
        </View>

        <View style={styles.buttons}>
          {v.documentPath && <Button label="Open ID document" icon={FileText} variant="secondary" onPress={() => open(v.documentPath)} />}
          {v.selfiePath && <Button label="Open selfie" icon={FileText} variant="secondary" onPress={() => open(v.selfiePath)} />}
          {v.proofPath && <Button label="Open proof of rights" icon={FileText} variant="secondary" onPress={() => open(v.proofPath)} />}
          {v.lat != null && v.lng != null && (
            <Button
              label="Where they stood"
              icon={MapPin}
              variant="secondary"
              onPress={() => openDirections({ name: venue?.name ?? 'Submitted location', address: '', lat: v.lat!, lng: v.lng! })}
            />
          )}
        </View>
        {docError && (
          <AppText variant="footnote" color={colors.danger}>
            {docError}
          </AppText>
        )}

        {user && (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <AppText variant="headline">{user.name || user.email}</AppText>
            <AppText variant="subhead" muted selectable>
              {user.email}, joined {new Date(user.joinedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
            </AppText>
            <AppText variant="subhead" muted>
              {user.events} events, {user.openReports} open reports, {user.upheldReports} upheld
              {user.suspended ? ', suspended' : ''}
            </AppText>
          </View>
        )}

        <AppText variant="footnote" muted>
          Check the name matches the document, the photo is clear and unedited, and for spaces that the proof names this address.
        </AppText>
        <Decision
          placeholder="Reason (shown to them if not approved)"
          onDone={() => router.back()}
          actions={[
            { label: 'Approve', run: (n) => reviewVerification(v.id, true, n) },
            { label: 'Not approved', needsNote: true, run: (n) => reviewVerification(v.id, false, n) },
            ...(user && !user.suspended
              ? [{ label: 'Suspend account', needsNote: true, run: (n: string) => suspendUser(user.id, true, n) }]
              : []),
          ]}
        />
      </Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: space.lg, paddingBottom: space.xxl },
  gap: { gap: space.md },
  card: { padding: space.md, borderRadius: radius.card, gap: space.xs },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: space.xxs },
  value: { flexShrink: 1, textAlign: 'right', fontWeight: '600' },
  buttons: { gap: space.sm },
});
