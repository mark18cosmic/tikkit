import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { EventItem } from '@/data/events';
import { formatTime } from './format';

// Local notifications only. Server push needs an APNs/FCM setup and a backend.
const supported = Platform.OS !== 'web';
const CHANNEL = 'reminders';

export function configureNotifications() {
  if (!supported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Event reminders',
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => {});
  }
}

export async function ensureReminderPermission(): Promise<boolean> {
  if (!supported) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const next = await Notifications.requestPermissionsAsync();
    return next.granted;
  } catch {
    return false;
  }
}

export async function scheduleReminders(event: EventItem): Promise<string[]> {
  if (!(await ensureReminderPermission())) return [];
  const start = new Date(event.startsAt).getTime();
  const plan = [
    { at: start - 24 * 3_600_000, title: `Tomorrow: ${event.title}`, body: `${formatTime(event.startsAt)} at ${event.venue.name}. Your tickets are in the app.` },
    { at: start - 3_600_000, title: `Starts in an hour: ${event.title}`, body: `${event.venue.name}, ${event.venue.address}. Have your QR code ready.` },
  ].filter((p) => p.at > Date.now() + 60_000);

  const ids: string[] = [];
  for (const p of plan) {
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: p.title, body: p.body, data: { eventId: event.id } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(p.at),
        ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
      },
    });
    ids.push(id);
  }
  return ids;
}

export async function cancelReminders(ids: string[]) {
  if (!supported) return;
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}
