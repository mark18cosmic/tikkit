import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Redirect, router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CheckInResultCard } from '@/components/CheckInResultCard';
import { Container } from '@/components/Container';
import { SignInRequired } from '@/components/SignInRequired';
import { hasCamera } from '@/lib/device';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { useAppStore, type CheckInResult } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

const RESUME_AFTER_MS = 2200;

export default function ScanScreen() {
  return (
    <SignInRequired title="Sign in to scan tickets" body="Scanning is for organisers and the door staff they add.">
      <Scan />
    </SignInRequired>
  );
}

function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const { checkIn } = useAppStore();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const busy = useRef(false);

  if (!hasCamera) return <Redirect href="/enter-code" />;
  if (!permission) return null;

  const onScanned = ({ data }: BarcodeScanningResult) => {
    if (busy.current) return;
    busy.current = true;
    checkIn(data)
      .then((r) => {
        setResult(r);
        setFailure(null);
        if (r.status === 'admitted') successFeedback();
        else errorFeedback();
      })
      .catch((e: Error) => {
        errorFeedback();
        setFailure(e.message);
      })
      .finally(() =>
        setTimeout(() => {
          busy.current = false;
          setResult(null);
          setFailure(null);
        }, RESUME_AFTER_MS),
      );
  };

  const footer = { paddingBottom: Math.max(insets.bottom, space.md) };

  if (!permission.granted) {
    return (
      <Container style={[styles.center, footer]}>
        <AppText variant="title3">Camera access needed</AppText>
        <AppText muted style={styles.text}>
          Allow camera access to scan ticket QR codes, or type codes in instead.
        </AppText>
        <View style={styles.actions}>
          {permission.canAskAgain && <Button label="Allow camera" onPress={requestPermission} />}
          <Button label="Enter code manually" variant="secondary" onPress={() => router.replace('/enter-code')} />
        </View>
      </Container>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <CameraView
        style={styles.fill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={result ? undefined : onScanned}
      />
      <View pointerEvents="none" style={styles.frameWrap}>
        <View style={[styles.frame, { borderColor: colors.onScrim }]} />
      </View>
      <View style={[styles.overlay, footer]}>
        {result ? (
          <CheckInResultCard result={result} />
        ) : failure ? (
          <View style={[styles.failure, { backgroundColor: colors.elevated, borderColor: colors.danger }]}>
            <AppText variant="headline" color={colors.danger}>
              Not checked
            </AppText>
            <AppText variant="subhead" muted>
              {failure}
            </AppText>
          </View>
        ) : (
          <Button label="Enter code manually" variant="secondary" onPress={() => router.push('/enter-code')} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', gap: space.sm },
  text: { marginBottom: space.md },
  actions: { gap: space.sm },
  frameWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderRadius: radius.card, borderWidth: 3 },
  overlay: { position: 'absolute', left: space.md, right: space.md, bottom: 0 },
  failure: { padding: space.md, borderRadius: radius.card, borderWidth: 2, gap: space.xxs },
});
