import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Boat, Megaphone, ShieldCheck, type Icon } from 'phosphor-react-native';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Cover } from '@/components/Cover';
import { goSignIn, useAuth } from '@/lib/auth';
import { tapFeedback } from '@/lib/haptics';
import { setOnboarded } from '@/lib/onboarding';
import { brand, minTouchTarget, radius, space } from '@/theme/tokens';
import { useReduceMotion } from '@/theme/useTheme';
import { enter } from '@/theme/motion';

type Panel = { key: string; icon: Icon; title: string; body: string };

const panels: Panel[] = [
  {
    key: 'discover',
    icon: Boat,
    title: 'What’s on, on every island',
    body: 'Sandbank concerts, dhoni trips, night markets and futsal finals, from Malé to the atolls. Add the speedboat when you buy.',
  },
  {
    key: 'safe',
    icon: ShieldCheck,
    title: 'Tickets you can trust',
    body: 'Every organiser is ID-checked. You pay Tikkit, never a stranger, and you’re refunded if an event is cancelled or isn’t real.',
  },
  {
    key: 'sell',
    icon: Megaphone,
    title: 'Run events. Rent out spaces.',
    body: 'Sell tickets, add boat transfers, track promoters and get paid to your bank after each event.',
  },
];

export default function Welcome() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { session } = useAuth();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = page === panels.length - 1;

  const finish = (then?: () => void) => {
    setOnboarded();
    router.back();
    if (then) setTimeout(then, 250);
  };
  const next = () => {
    tapFeedback();
    if (last) return finish();
    scroller.current?.scrollTo({ x: width * (page + 1), animated: !reduce });
    setPage(page + 1);
  };

  return (
    <View style={styles.fill}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {panels.map((p, i) => (
          <View key={p.key} style={{ width, height }} accessibilityElementsHidden={i !== page} importantForAccessibility={i === page ? 'auto' : 'no-hide-descendants'}>
            {/* The sunset art keeps its shape, so it sits in the top part and fades into the page. */}
            <Cover seed={`welcome-${p.key}`} style={styles.art} />
            <LinearGradient colors={['rgba(12,12,14,0)', 'rgba(12,12,14,0.6)', '#0C0C0E']} locations={[0.15, 0.4, 0.58]} style={StyleSheet.absoluteFill} />
            <View style={[styles.panel, { paddingBottom: insets.bottom + 196 }]}>
              <Animated.View entering={reduce || i !== page ? undefined : enter.rise()} style={styles.copy}>
                <View style={styles.icon}>
                  <p.icon size={26} color={brand.crimson} weight="fill" />
                </View>
                <AppText variant="largeTitle" color="#FFFFFF" accessibilityRole="header">
                  {p.title}
                </AppText>
                <AppText color="rgba(255,255,255,0.88)" style={styles.body}>
                  {p.body}
                </AppText>
              </Animated.View>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        {/* Page position: which of the three panels is showing. */}
        <View style={styles.dots} accessibilityRole="adjustable" accessibilityLabel={`Page ${page + 1} of ${panels.length}`}>
          {panels.map((p, i) => (
            <View key={p.key} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={next} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
          <AppText variant="headline" color={brand.crimson}>
            {last ? 'Start exploring' : 'Next'}
          </AppText>
        </Pressable>
        <View style={styles.secondary}>
          {last && !session ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => finish(() => goSignIn('/organiser'))}>
              <AppText variant="subhead" color="#FFFFFF" style={styles.bold}>
                I run events or spaces
              </AppText>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => finish()}>
              <AppText variant="subhead" color="rgba(255,255,255,0.8)">
                Skip
              </AppText>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#0C0C0E' },
  art: { position: 'absolute', top: 0, left: 0, right: 0, height: '62%' },
  panel: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.lg },
  copy: { gap: space.sm + 4, maxWidth: 520 },
  icon: { width: 52, height: 52, borderRadius: radius.card, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  body: { maxWidth: 440 },
  footer: { position: 'absolute', left: space.lg, right: space.lg, bottom: 0, gap: space.md },
  dots: { flexDirection: 'row', gap: space.xs + 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotOn: { width: 22, backgroundColor: '#FFFFFF' },
  cta: { minHeight: minTouchTarget + 6, borderRadius: radius.control, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  secondary: { alignItems: 'center', minHeight: 24 },
  bold: { fontWeight: '600' },
});
