import * as Haptics from 'expo-haptics';

import { errorFeedback, successFeedback, tapFeedback } from '../haptics';

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  impactAsync: jest.fn(() => Promise.reject(new Error('no haptic engine'))),
  notificationAsync: jest.fn(() => Promise.reject(new Error('no haptic engine'))),
}));

test('haptic calls swallow native failures (Simulator has no haptic engine)', async () => {
  expect(() => {
    tapFeedback();
    successFeedback();
    errorFeedback();
  }).not.toThrow();
  await new Promise<void>((r) => setTimeout(r, 0));
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2);
});
