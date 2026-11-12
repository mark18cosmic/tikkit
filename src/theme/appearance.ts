import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

export type AppearancePref = 'system' | 'light' | 'dark';

const KEY = 'eventspace/appearance';
let pref: AppearancePref = 'system';
const listeners = new Set<() => void>();

// Native: also tell the OS layer, so alerts, switches, the keyboard and the
// status bar match the app.
function apply(next: AppearancePref) {
  pref = next;
  if (Platform.OS !== 'web') Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
  listeners.forEach((l) => l());
}

AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v === 'light' || v === 'dark') apply(v);
  })
  .catch(() => {});

export function setAppearance(next: AppearancePref) {
  apply(next);
  AsyncStorage.setItem(KEY, next).catch(() => {});
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useAppearancePref = () => useSyncExternalStore(subscribe, () => pref, () => pref);

export function useScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const chosen = useAppearancePref();
  if (chosen !== 'system') return chosen;
  return system === 'dark' ? 'dark' : 'light';
}
