import { CheckCircle, WifiSlash } from '@/components/icons';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, RefreshControl, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { AnimatedLogoMark } from './LogoMark';
import { successFeedback, tapFeedback } from '@/lib/haptics';
import { radius, space } from '@/theme/tokens';
import { useColors, useReduceMotion } from '@/theme/useTheme';
import { duration, timing } from '@/theme/motion';

// Pull-to-refresh as a small card that drops down from the top of the screen.
// The logo's sun rises as you pull, bobs on the water while loading, and rises
// fully when the content is fresh. Then the card flies back up.
//
// The system RefreshControl still owns the gesture, so pulling feels native on
// both platforms; its spinner is hidden and this card draws the feedback.
// iOS reports the pull distance, so the card follows your finger there. Android
// does not, so on Android the card drops in once you let go.

// 'ready' means pulled far enough that letting go will refresh.
type Phase = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'done' | 'failed';

// Points of pull before letting go refreshes (close to UIRefreshControl).
const PULL_DISTANCE = 90;
// Long enough to read, even on a fast connection.
const MIN_SPIN_MS = 700;
const RESULT_MS = 1100;

type Controller = {
  pull: SharedValue<number>;
  phase: Phase;
  setPhase(p: Phase): void;
  subscribe(fn: (p: Phase) => void): () => void;
};

const Ctx = createContext<Controller | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const pull = useSharedValue(0);
  const listeners = useRef(new Set<(p: Phase) => void>());
  const controller = useMemo<Controller>(() => {
    const c: Controller = {
      pull,
      phase: 'idle',
      setPhase(p) {
        if (c.phase === p) return;
        c.phase = p;
        listeners.current.forEach((fn) => fn(p));
      },
      subscribe(fn) {
        listeners.current.add(fn);
        return () => listeners.current.delete(fn);
      },
    };
    return c;
  }, [pull]);

  return (
    <Ctx.Provider value={controller}>
      {children}
      {Platform.OS !== 'web' && <RefreshCard controller={controller} />}
    </Ctx.Provider>
  );
}

// Wire a ScrollView or list to the card:
//   const refresh = usePullRefresh(reload, { failed: !!error });
//   <ScrollView refreshControl={refresh.control} onScroll={refresh.onScroll}
//     scrollEventThrottle={refresh.scrollEventThrottle} />
// `onRefresh` should return a promise that settles when loading finishes.
export function usePullRefresh(onRefresh: () => unknown, { failed = false }: { failed?: boolean } = {}) {
  const card = useContext(Ctx);
  const [refreshing, setRefreshing] = useState(false);
  const failedRef = useRef(failed);
  useEffect(() => {
    failedRef.current = failed;
  }, [failed]);
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    card?.setPhase('refreshing');
    const started = Date.now();
    try {
      await onRefresh();
    } catch {
      failedRef.current = true;
    }
    const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - started));
    timers.current.push(
      setTimeout(() => {
        busy.current = false;
        setRefreshing(false);
        // Read after the screen has re-rendered with the load result.
        const ok = !failedRef.current;
        if (ok) successFeedback();
        card?.setPhase(ok ? 'done' : 'failed');
        timers.current.push(setTimeout(() => card?.phase !== 'refreshing' && card?.setPhase('idle'), RESULT_MS));
      }, wait),
    );
  }, [card, onRefresh]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!card || busy.current) return;
      // contentInset only exists on iOS; Android and web leave it out.
      const y = (e.nativeEvent.contentOffset?.y ?? 0) + (e.nativeEvent.contentInset?.top ?? 0);
      const progress = Math.max(0, -y) / PULL_DISTANCE;
      const following = card.phase === 'pulling' || card.phase === 'ready';
      if (progress === 0 && !following) return;
      card.pull.set(progress);
      if (progress > 0.08 && card.phase === 'idle') card.setPhase('pulling');
      else if (progress <= 0.02 && following) card.setPhase('idle');
      else if (progress >= 1 && card.phase === 'pulling') {
        card.setPhase('ready');
        tapFeedback();
      } else if (progress < 0.85 && card.phase === 'ready') card.setPhase('pulling');
    },
    [card],
  );

  const control = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={run}
      // Hide the system spinner; the card shows progress instead.
      tintColor="transparent"
      colors={['transparent']}
      progressBackgroundColor="transparent"
      progressViewOffset={Platform.OS === 'android' ? -200 : undefined}
      style={styles.clear}
    />
  );

  return { control, onScroll, refreshing, scrollEventThrottle: 16 };
}

// --- The card -------------------------------------------------------------------

const CARD_HEIGHT = 44;
const MARK_WIDTH = 22;

function RefreshCard({ controller }: { controller: Controller }) {
  const [phase, setPhase] = useState<Phase>(controller.phase);
  useEffect(() => controller.subscribe(setPhase), [controller]);
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const { pull } = controller;

  const rest = insets.top + space.sm;
  const hidden = -(rest + CARD_HEIGHT + 24);
  // 0 hidden, 1 following the finger, 2 settled (loading or showing the result)
  const drop = useSharedValue(0);
  const sun = useSharedValue(0);
  const pop = useSharedValue(1);
  const following = useSharedValue(0);

  useEffect(() => {
    following.set(phase === 'pulling' || phase === 'ready' ? 1 : 0);
    if (phase === 'idle') {
      drop.set(withTiming(0, { duration: 320, easing: Easing.in(Easing.cubic) }));
      pull.set(withTiming(0, { duration: 320 }));
    } else if (phase === 'pulling' || phase === 'ready') {
      drop.set(withTiming(1, timing(duration.base)));
    } else {
      drop.set(withTiming(2, timing(duration.base)));
    }

    cancelAnimation(sun);
    if (phase === 'refreshing') {
      // The sun bobs on the water while loading.
      sun.set(
        reduceMotion
          ? withTiming(0.5, { duration: 200 })
          : withSequence(
              withTiming(0.42, { duration: 260 }),
              withRepeat(withTiming(0.62, { duration: 620, easing: Easing.inOut(Easing.sin) }), -1, true),
            ),
      );
    } else if (phase === 'done') {
      sun.set(withTiming(1, timing(duration.slow)));
    } else if (phase === 'failed') {
      sun.set(withTiming(0, { duration: 400 }));
    } else if (phase === 'idle') {
      sun.set(withDelay(200, withTiming(0, { duration: 1 })));
    }

    if (phase === 'done' || phase === 'failed') {
      pop.set(withSequence(withTiming(0.8, { duration: 0 }), withTiming(1, timing(duration.base))));
    }
  }, [phase, drop, sun, pop, pull, following, reduceMotion]);

  const cardStyle = useAnimatedStyle(() => {
    const d = drop.get();
    const p = pull.get();
    // While pulling, follow the finger with a little rubber band past the threshold.
    const following = interpolate(Math.min(p, 1), [0, 1], [hidden, rest]) + Math.max(0, p - 1) * 14;
    const y = d <= 1 ? interpolate(d, [0, 1], [hidden, following]) : interpolate(d, [1, 2], [following, rest]);
    return {
      opacity: interpolate(d, [0, 0.3], [0, 1], Extrapolation.CLAMP),
      transform: [{ translateY: y }, { scale: interpolate(d, [0, 1], [0.92, 1], Extrapolation.CLAMP) }],
    };
  });

  // While pulling, the sun rises with the finger up to its resting place.
  const markSun = useDerivedValue(() => (following.get() ? Math.min(pull.get(), 1) * 0.5 : sun.get()));

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  const label =
    phase === 'refreshing'
      ? 'Updating'
      : phase === 'done'
        ? 'Up to date'
        : phase === 'failed'
          ? 'Couldn’t update'
          : phase === 'ready'
            ? 'Release to update'
            : 'Pull to update';

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityLabel={phase === 'idle' ? undefined : label}
        style={[
          styles.card,
          { backgroundColor: colors.elevated, borderColor: colors.border, shadowColor: '#000' },
          cardStyle,
        ]}
      >
        <AnimatedLogoMark width={MARK_WIDTH} sun={markSun} />
        <AppText variant="subhead" style={styles.label} numberOfLines={1}>
          {label}
        </AppText>
        {(phase === 'done' || phase === 'failed') && (
          <Animated.View style={iconStyle}>
            {phase === 'done' ? (
              <CheckCircle size={18} color={colors.success} weight="fill" />
            ) : (
              <WifiSlash size={18} color={colors.danger} weight="bold" />
            )}
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clear: { backgroundColor: 'transparent' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 1000, elevation: 1000 },
  card: {
    height: CARD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingLeft: space.sm + 6,
    paddingRight: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  label: { fontWeight: '600' },
});
