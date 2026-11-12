import { Easing, FadeIn, FadeInDown, FadeOut, SlideInDown } from 'react-native-reanimated';

// Motion that settles like a wave reaching the sand: quick to start, long and
// soft to stop, never overshooting. No springs that wobble or bounce.
export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export const easeInOut = Easing.bezier(0.45, 0, 0.25, 1);

export const duration = { quick: 180, base: 280, slow: 460 } as const;

export const timing = (ms: number = duration.base) => ({ duration: ms, easing: ease });

// Entering animations for Animated.View.
export const enter = {
  // Content arriving: fades in while drifting up a few points.
  rise: (delay = 0) => FadeInDown.duration(duration.slow).delay(delay).easing(ease),
  fade: (delay = 0) => FadeIn.duration(duration.base).delay(delay).easing(ease),
  // Bottom sheets and dialogs.
  sheet: () => SlideInDown.duration(duration.base + 60).easing(ease),
};
export const exit = { fade: () => FadeOut.duration(duration.quick) };
