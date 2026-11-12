import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from './AppText';
import { QR_WINDOW_MS, qrWindow } from '@/data/tickets';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// The door scanner accepts `CODE.window.token` where token is the first 8 hex
// characters of sha256(secret:window). It changes every 30 seconds, so a
// screenshot stops working within about two minutes. Computed on the phone,
// so it works offline once the secret has been fetched.
async function payload(code: string, secret: string, w: number) {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${secret}:${w}`);
  return `${code}.${w}.${hash.slice(0, 8)}`;
}

export function LiveQR({ code, secret, size = 220 }: { code: string; secret?: string; size?: number }) {
  const colors = useColors();
  const [value, setValue] = useState(code);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!secret) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const now = Date.now();
      const w = qrWindow(now);
      payload(code, secret, w).then((v) => live && setValue(v), () => live && setValue(code));
      // The bar drains over what's left of this window, then the code changes.
      const left = QR_WINDOW_MS - (now % QR_WINDOW_MS);
      progress.value = left / QR_WINDOW_MS;
      progress.value = withTiming(0, { duration: left, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
      timer = setTimeout(tick, left + 50);
    };
    tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [code, secret, progress]);

  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  return (
    <View style={styles.wrap}>
      {/* QR stays black on white in both themes: scanners need the contrast. */}
      <View style={styles.qr} accessible accessibilityRole="image" accessibilityLabel={`QR code for ticket ${code}`}>
        <QRCode value={value} size={size} quietZone={16} backgroundColor="#FFFFFF" color="#000000" />
      </View>
      {secret ? (
        <View style={styles.meta}>
          <View style={[styles.track, { width: size, backgroundColor: colors.surface }]}>
            <Animated.View style={[styles.fillBar, { backgroundColor: colors.success }, bar]} />
          </View>
          <AppText variant="footnote" muted>
            Live code, refreshes every 30 seconds. Screenshots won’t scan.
          </AppText>
        </View>
      ) : (
        <AppText variant="footnote" muted style={styles.center}>
          Connect once to switch on the live code. Staff can type the code below meanwhile.
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.sm, marginTop: space.lg },
  qr: { borderRadius: radius.control, overflow: 'hidden' },
  meta: { alignItems: 'center', gap: space.xs + 2 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fillBar: { height: 4, width: '100%', transformOrigin: 'left' },
  center: { textAlign: 'center', maxWidth: 300 },
});
