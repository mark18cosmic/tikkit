import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedLogoMark } from './LogoMark';
import { useScheme } from '@/theme/appearance';
import { useReduceMotion } from '@/theme/useTheme';
import { ease } from '@/theme/motion';

// Keep the native splash up until the intro below is drawn on top of it.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Same size and colours as the native splash (app.json, expo-splash-screen):
// the 1024px splash image is drawn 150pt wide and the mark fills 576px of it.
const MARK_WIDTH = (150 * 576) / 1024;
const DARK_BG = '#0C0C0E';
const LIGHT_BG = '#FAFAFA';

// Picks up exactly where the native splash leaves off, then the ticket swells
// and opens into the app. About a second in total.
export function BrandIntro() {
  const dark = useScheme() === 'dark';
  const reduceMotion = useReduceMotion();
  const [done, setDone] = useState(false);
  const sun = useSharedValue(0.5);
  const fade = useSharedValue(1);
  const grow = useSharedValue(1);
  const bg = dark ? DARK_BG : LIGHT_BG;

  const start = () => {
    SplashScreen.hideAsync().catch(() => {});
    const finish = () => setDone(true);
    if (reduceMotion) {
      fade.set(withDelay(250, withTiming(0, { duration: 250 }, (ok) => {
        if (ok) scheduleOnRN(finish);
      })));
      return;
    }
    sun.set(withDelay(120, withTiming(1, { duration: 640, easing: ease })));
    grow.set(withDelay(620, withSequence(withTiming(0.94, { duration: 120 }), withTiming(9, { duration: 420, easing: Easing.in(Easing.cubic) }))));
    fade.set(withDelay(780, withTiming(0, { duration: 300 }, (ok) => {
        if (ok) scheduleOnRN(finish);
      })));
  };

  // Never leave the app stuck behind the intro.
  useEffect(() => {
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
      setDone(true);
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const markStyle = useAnimatedStyle(() => ({ transform: [{ scale: grow.get() }] }));

  if (done) return null;
  return (
    <Animated.View
      pointerEvents="none"
      onLayout={start}
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: bg }, overlayStyle]}
    >
      <Animated.View style={markStyle}>
        <AnimatedLogoMark width={MARK_WIDTH} sun={sun} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 2000, elevation: 2000 },
});
