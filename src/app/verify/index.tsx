import { router } from 'expo-router';
import { Bank, Buildings, CheckCircle, ClockCountdown, SealCheck, ShieldCheck, Storefront, type Icon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Container } from '@/components/Container';
import { DocPicker, type PickedDoc } from '@/components/DocPicker';
import { Field } from '@/components/Field';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Group, Heading, Row } from '@/components/SettingsList';
import { SignInRequired } from '@/components/SignInRequired';
import { ListSkeleton } from '@/components/Skeleton';
import { banks } from '@/data/money';
import { idKinds, type Verification } from '@/data/trust';
import type { Venue } from '@/data/venues';
import { fetchMyVenues } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { fetchMyVerifications, setPayoutAccount, submitIdentity, uploadDocument } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function VerifyScreen() {
  return (
    <SignInRequired title="Sign in to get verified" body="Verification is tied to your account, once.">
      <Verify />
    </SignInRequired>
  );
}

function Verify() {
  const { userId } = useAuth();
  const { status } = useAppStore();
  const load = useCallback(async () => {
    const [mine, venues] = await Promise.all([fetchMyVerifications(), userId ? fetchMyVenues(userId) : Promise.resolve([])]);
    return { mine, venues };
  }, [userId]);
  const { data, reload } = useRemote(load);

  if (!data || !status) {
    return (
      <Container>
        <ListSkeleton rows={4} />
      </Container>
    );
  }
  const identity = data.mine.find((v) => v.kind === 'identity');
  if (status.verified) return <Verified venues={data.venues} verifications={data.mine} />;
  if (identity?.status === 'pending') return <Pending v={identity} />;
  return <IdentityForm rejected={identity?.status === 'rejected' ? identity : undefined} onDone={reload} />;
}

function Point({ icon: IconCmp, title, body }: { icon: Icon; title: string; body: string }) {
  const colors = useColors();
  return (
    <View style={styles.point}>
      <View style={[styles.pointIcon, { backgroundColor: colors.surface }]}>
        <IconCmp size={20} color={colors.accent} weight="bold" />
      </View>
      <View style={styles.fill}>
        <AppText variant="headline">{title}</AppText>
        <AppText variant="subhead" muted>
          {body}
        </AppText>
      </View>
    </View>
  );
}

function IdentityForm({ rejected, onDone }: { rejected?: Verification; onDone: () => void }) {
  const colors = useColors();
  const { userId, displayName } = useAuth();
  const { refreshStatus } = useAppStore();
  const [legalName, setLegalName] = useState(displayName);
  const [phone, setPhone] = useState('+960 ');
  const [idKind, setIdKind] = useState<Verification['idKind']>('national_id');
  const [idNumber, setIdNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [doc, setDoc] = useState<PickedDoc | null>(null);
  const [selfie, setSelfie] = useState<PickedDoc | null>(null);
  const [bank, setBank] = useState<(typeof banks)[number]>('BML');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const errors = {
    legalName: legalName.trim().length < 2 ? 'Enter your name as it is on your ID.' : undefined,
    phone: !/^\+?[0-9 ]{7,16}$/.test(phone.trim()) ? 'Enter a phone number, like +960 777 1234.' : undefined,
    idNumber: idNumber.trim().length < 4 ? 'Enter the ID or registration number.' : undefined,
    businessName: idKind === 'business' && businessName.trim().length < 2 ? 'Enter the registered business name.' : undefined,
    doc: !doc ? 'Add a photo of the document.' : undefined,
    accountName: accountName.trim().length < 2 ? 'Enter the name on the account.' : undefined,
    accountNumber: !/^[0-9]{7,20}$/.test(accountNumber.replace(/\D/g, '')) ? 'Account numbers are 7 to 20 digits.' : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);
  const e = (k: keyof typeof errors) => (show ? errors[k] : undefined);

  const submit = async () => {
    setShow(true);
    setFailure(null);
    if (!valid || !userId || !doc) {
      errorFeedback();
      return;
    }
    setBusy(true);
    try {
      const [documentPath, selfiePath] = await Promise.all([
        uploadDocument(userId, doc.uri, doc.mimeType, 'id'),
        selfie ? uploadDocument(userId, selfie.uri, selfie.mimeType, 'selfie') : Promise.resolve(undefined),
      ]);
      await setPayoutAccount(bank, accountName.trim(), accountNumber);
      await submitIdentity({
        legalName: legalName.trim(),
        phone: phone.trim(),
        idKind: idKind!,
        idNumber: idNumber.trim(),
        businessName: idKind === 'business' ? businessName.trim() : undefined,
        documentPath,
        selfiePath,
      });
      successFeedback();
      await refreshStatus();
      onDone();
    } catch (err) {
      errorFeedback();
      setFailure(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardScreen
      footer={
        <Container>
          <Button label="Send for review" icon={ShieldCheck} loading={busy} onPress={submit} />
        </Container>
      }
    >
      <Container style={styles.gap}>
        <View style={styles.gapSm}>
          <AppText variant="title" accessibilityRole="header">
            Get verified to sell
          </AppText>
          <AppText muted>A one-time check, so buyers know the person behind every event is real.</AppText>
        </View>
        {rejected && (
          <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
            <AppText variant="headline">Last time we couldn’t approve it</AppText>
            <AppText variant="subhead" muted>
              {rejected.reviewNote}
            </AppText>
          </View>
        )}
        <View style={styles.gapSm}>
          <Point icon={SealCheck} title="A Verified tick" body="On your organiser page and every event. Buyers look for it." />
          <Point icon={Storefront} title="Publish and sell" body="Your first events get a quick review, then go live by themselves." />
          <Point icon={Bank} title="Get paid to your bank" body="Sales collect in your wallet and can be withdrawn after each event." />
        </View>

        <Heading>You</Heading>
        <Field label="Full legal name" value={legalName} onChangeText={setLegalName} autoCapitalize="words" autoComplete="name" error={e('legalName')} />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" error={e('phone')} />

        <Heading>Document</Heading>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {idKinds.map((k) => (
            <Chip key={k.id} label={k.label} selected={idKind === k.id} onPress={() => setIdKind(k.id)} />
          ))}
        </View>
        {idKind === 'business' && (
          <Field label="Registered business name" value={businessName} onChangeText={setBusinessName} autoCapitalize="words" error={e('businessName')} />
        )}
        <Field
          label={idKind === 'business' ? 'Registration number' : idKind === 'passport' ? 'Passport number' : 'ID card number'}
          value={idNumber}
          onChangeText={setIdNumber}
          autoCapitalize="characters"
          autoCorrect={false}
          error={e('idNumber')}
        />
        <DocPicker label="Photo of the document" hint={idKinds.find((k) => k.id === idKind)?.hint ?? ''} value={doc} onChange={setDoc} error={e('doc')} />
        <DocPicker label="Selfie holding it (optional)" hint="Speeds up the review" value={selfie} onChange={setSelfie} />

        <Heading>Where we pay you</Heading>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {banks.map((b) => (
            <Chip key={b} label={b} selected={bank === b} onPress={() => setBank(b)} />
          ))}
        </View>
        <Field label="Name on the account" value={accountName} onChangeText={setAccountName} autoCapitalize="words" helper="Should match your name or business." error={e('accountName')} />
        <Field label="Account number" value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" error={e('accountNumber')} />

        <AppText variant="footnote" muted>
          Documents are stored privately. Only Tikkit’s review team can open them, and we never show them to buyers.
        </AppText>
        {failure && (
          <AppText variant="subhead" color={colors.danger} accessibilityLiveRegion="polite">
            {failure}
          </AppText>
        )}
      </Container>
    </KeyboardScreen>
  );
}

function Pending({ v }: { v: Verification }) {
  const colors = useColors();
  return (
    <Container style={[styles.gap, styles.pad]}>
      <View style={[styles.state, { backgroundColor: colors.surface }]}>
        <ClockCountdown size={44} color={colors.accent} weight="fill" />
        <AppText variant="title2">We’re checking your details</AppText>
        <AppText muted style={styles.center}>
          Sent {new Date(v.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. A person reviews every request, usually within a day. You’ll get a notification.
        </AppText>
      </View>
      <AppText variant="subhead" muted>
        Meanwhile you can keep drafting events. They go to review as soon as you’re approved.
      </AppText>
      <Button label="Draft an event" variant="secondary" onPress={() => router.push('/organiser/new')} />
    </Container>
  );
}

function Verified({ venues, verifications }: { venues: Venue[]; verifications: Verification[] }) {
  const colors = useColors();
  const { status } = useAppStore();
  const venueState = (id: string, verified: boolean) => {
    if (verified) return 'Verified';
    const v = verifications.find((x) => x.kind === 'venue' && x.venueId === id);
    return v?.status === 'pending' ? 'In review' : v?.status === 'rejected' ? 'Not approved, try again' : 'Not verified';
  };
  return (
    <Container style={[styles.gap, styles.pad]}>
      <View style={[styles.state, { backgroundColor: colors.surface }]}>
        <CheckCircle size={44} color={colors.success} weight="fill" />
        <AppText variant="title2">You’re verified</AppText>
        <AppText muted style={styles.center}>
          {status?.trusted
            ? 'You’re a trusted organiser: new events go live straight away.'
            : 'Your next events get a quick review. After three events that run smoothly, they go live straight away.'}
        </AppText>
      </View>
      <View>
        <Heading>Your spaces</Heading>
        {venues.length === 0 ? (
          <AppText variant="subhead" muted>
            Spaces need their own check before they can be rented out. Add one under Organiser.
          </AppText>
        ) : (
          <Group>
            {venues.map((v, i) => (
              <Row
                key={v.id}
                icon={Buildings}
                label={v.name}
                detail={venueState(v.id, v.verified)}
                divider={i > 0}
                onPress={() => router.push({ pathname: '/verify/space/[id]', params: { id: v.id } })}
              />
            ))}
          </Group>
        )}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.lg },
  gapSm: { gap: space.sm + 4 },
  pad: { paddingVertical: space.lg },
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  point: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  pointIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  note: { padding: space.md, borderRadius: radius.control, borderLeftWidth: 4, gap: space.xs },
  state: { alignItems: 'center', gap: space.sm, padding: space.lg, borderRadius: radius.card },
});
