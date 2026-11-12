import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { useScheme } from './appearance';
import { palette, type ColorTokens } from './tokens';

export function useColors(): ColorTokens {
  return useScheme() === 'dark' ? palette.dark : palette.light;
}

// One shared subscription per accessibility setting instead of one per component.
function a11ySetting(
  event: 'boldTextChanged' | 'reduceMotionChanged',
  read: () => Promise<boolean>,
  supported: boolean,
) {
  let value = false;
  const listeners = new Set<() => void>();
  if (supported) {
    const set = (v: boolean) => {
      value = v;
      listeners.forEach((l) => l());
    };
    read().then(set).catch(() => {});
    AccessibilityInfo.addEventListener(event, set);
  }
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return () => useSyncExternalStore(subscribe, () => value, () => false);
}

// iOS "Bold Text" is not applied to explicit fontWeight values, so text
// components read it and bump weights themselves. The setting is iOS-only.
export const useBoldText = a11ySetting(
  'boldTextChanged',
  () => AccessibilityInfo.isBoldTextEnabled(),
  Platform.OS === 'ios',
);

export const useReduceMotion = a11ySetting(
  'reduceMotionChanged',
  () => AccessibilityInfo.isReduceMotionEnabled(),
  Platform.OS !== 'web',
);
