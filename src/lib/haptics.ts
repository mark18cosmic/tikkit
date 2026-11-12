import * as Haptics from 'expo-haptics';

// Haptics are feedback, never behavior: failures (Simulator, web, Low Power
// Mode, user setting) are swallowed.
export function tapFeedback(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function successFeedback(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function errorFeedback(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
