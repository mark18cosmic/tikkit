import { useEffect, useRef, type ReactNode } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { ease, easeInOut } from '@/theme/motion';
import { useReduceMotion } from '@/theme/useTheme';

// A soft swell whenever `trigger` changes (not on first render). No bounce.
export function Pop({ trigger, children }: { trigger: unknown; children: ReactNode }) {
  const scale = useSharedValue(1);
  const reduceMotion = useReduceMotion();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduceMotion) return;
    scale.set(withSequence(withTiming(1.12, { duration: 140, easing: ease }), withTiming(1, { duration: 320, easing: easeInOut })));
  }, [trigger, reduceMotion, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
