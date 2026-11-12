import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle, ClockCountdown, MapPinLine, SmileySad } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { DocPicker, type PickedDoc } from '@/components/DocPicker';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { SignInRequired } from '@/components/SignInRequired';
import { ListSkeleton } from '@/components/Skeleton';
import { fetchVenue } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { currentCoords, type Coords } from '@/lib/location';
import { fetchMyVerifications, submitVenueVerification, uploadDocument } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function VerifySpaceScreen() {
  return (
    <SignInRequired title="Sign in to verify a space" body="Only the person who listed a space can verify it.">
      <VerifySpace />
    </SignInRequired>
  );
}

function VerifySpace() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { userId } = useAuth();
  const { status } = useAppStore();
  const load = useCallback(async () => {
    const [venue, mine] = await Promise.all([fetchVenue(id), fetchMyVerifications()]);
    return { venue, check: mine.find((v) => v.kind === 'venue' && v.venueId === id) };
  }, [id]);
  const { data, reload } = useRemote(load);
  const [proof, setProof] = useState<PickedDoc | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!data) return <Container><ListSkeleton rows={3} /></Container>;
  const { venue, check } = data;
  if (!venue || venue.ownerId !== userId) {
    return <EmptyState icon={SmileySad} title="Space not found" body="You can only verify spaces you listed." />;
  }
  if (!status?.verified) {
    return (
      <EmptyState
        icon={ClockCountdown}
        title="Verify yourself first"
        body="Spaces are checked after the person renting them out is verified."
        action={{ label: 'Get verified', onPress: () => router.replace('/verify') }}
      />
    );
  }
  if (venue.verified) {
    return <EmptyState icon={CheckCircle} title={`${venue.name} is verified`} body="It shows under Find a space whenever it’s set to rent." />;
  }
  if (check?.status === 'pending') {
    return <EmptyState icon={ClockCountdown} title="In review" body="We’re checking the proof and the location. You’ll get a notification." />;
  }

  const locate = async () => {
    setLocNote(null);
    setLocating(true);
    const c = await currentCoords();
    setLocating(false);
    if (c) setCoords(c);
    else setLocNote('Location is off. Turn it on for Tikkit in Settings, then try again.');
  };

  const submit = async () => {
    setShow(true);
    setFailure(null);
    if (!proof || !userId) {
      errorFeedback();
      return;
    }
    setBusy(true);
    try {
      const proofPath = await uploadDocument(userId, proof.uri, proof.mimeType, 'proof');
      await submitVenueVerification({ venueId: venue.id, proofPath, lat: coords?.lat, lng: coords?.lng, note: note.trim() });
      successFeedback();
      reload();
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardScreen
      footer={
        <Container>
          <Button label="Send for review" loading={busy} onPress={submit} />
        </Container>
      }
    >
      <Container style={styles.gap}>
        <View style={styles.gapSm}>
          <AppText variant="title2" accessibilityRole="header">
            Verify {venue.name}
          </AppText>
          <AppText muted>Renters only see verified spaces, so they never turn up to a hall that isn’t yours to rent.</AppText>
        </View>
        {check?.status === 'rejected' && (
          <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
            <AppText variant="headline">Last time we couldn’t approve it</AppText>
            <AppText variant="subhead" muted>
              {check.reviewNote}
            </AppText>
          </View>
        )}
        <DocPicker
          label="Proof you can rent it out"
          hint="Lease, ownership papers, or a signed letter from the owner"
          value={proof}
          onChange={setProof}
          error={show && !proof ? 'Add a photo of the proof.' : undefined}
        />
        <View style={[styles.loc, { backgroundColor: colors.surface }]}>
          <MapPinLine size={24} color={coords ? colors.success : colors.accent} weight={coords ? 'fill' : 'regular'} />
          <View style={styles.fill}>
            <AppText variant="headline">{coords ? 'Location captured' : 'Stand in the space'}</AppText>
            <AppText variant="subhead" muted>
              {coords
                ? 'We’ll pin the space here on the map once it’s approved.'
                : 'Share your location while you’re there. It pins the space on the map and helps us confirm it’s real.'}
            </AppText>
            {locNote && (
              <AppText variant="footnote" color={colors.danger}>
                {locNote}
              </AppText>
            )}
          </View>
        </View>
        {!coords && <Button label={locating ? 'Locating…' : 'I’m here, use my location'} variant="secondary" loading={locating} onPress={locate} />}
        <Field label="Anything we should know? (optional)" value={note} onChangeText={setNote} multiline style={styles.multi} />
        {failure && (
          <AppText variant="subhead" color={colors.danger} accessibilityLiveRegion="polite">
            {failure}
          </AppText>
        )}
      </Container>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.lg },
  gapSm: { gap: space.sm },
  fill: { flex: 1, gap: space.xxs },
  note: { padding: space.md, borderRadius: radius.control, borderLeftWidth: 4, gap: space.xs },
  loc: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.control },
  multi: { minHeight: 88, textAlignVertical: 'top' },
});
