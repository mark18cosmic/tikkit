import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { BrandIntro } from '@/components/BrandIntro';
import { DesktopStackHeader } from '@/components/DesktopNav';
import { DialogHost } from '@/components/DialogHost';
import { useLayout } from '@/lib/useLayout';
import { RefreshProvider } from '@/components/PullRefresh';
import { AuthProvider } from '@/lib/auth';
import { hasOnboarded } from '@/lib/onboarding';
import { configureNotifications } from '@/lib/reminders';
import { AppStoreProvider } from '@/store/AppStore';
import { useScheme } from '@/theme/appearance';
import { useColors } from '@/theme/useTheme';

configureNotifications();

// Tapping a reminder opens its event.
function useReminderTaps() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (data: unknown) => {
      const eventId = (data as { eventId?: string } | undefined)?.eventId;
      if (eventId) router.push({ pathname: '/event/[id]', params: { id: eventId } });
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last.notification.request.content.data);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
    return () => sub.remove();
  }, []);
}

// First launch on a phone: a short tour, after the brand intro.
function useOnboarding() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let live = true;
    hasOnboarded().then((done) => {
      if (live && !done) setTimeout(() => router.push('/welcome'), 1200);
    });
    return () => {
      live = false;
    };
  }, []);
}

export default function RootLayout() {
  const colors = useColors();
  const scheme = useScheme();
  const { isDesktop } = useLayout();
  useReminderTaps();
  useOnboarding();
  return (
    <AuthProvider>
    <AppStoreProvider>
    <RefreshProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTintColor: colors.accent,
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.text },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
          // Desktop browsers keep the site's top bar on every page.
          ...(isDesktop
            ? {
                header: ({ options, back }) => (
                  <DesktopStackHeader title={typeof options.title === 'string' ? options.title : undefined} canGoBack={!!back} />
                ),
              }
            : {}),
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Explore' }} />
        <Stack.Screen name="event/[id]" options={{ headerShown: isDesktop, title: '' }} />
        <Stack.Screen name="checkout/[id]" options={{ title: 'Checkout', presentation: 'modal' }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Order confirmed', presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="ticket/[code]" options={{ title: 'Ticket' }} />
        <Stack.Screen name="transfer/[code]" options={{ title: 'Transfer ticket', presentation: 'modal' }} />
        <Stack.Screen name="scan" options={{ title: 'Scan tickets' }} />
        <Stack.Screen name="enter-code" options={{ title: 'Check in' }} />
        <Stack.Screen name="organiser/index" options={{ title: 'Organiser' }} />
        <Stack.Screen name="organiser/new" options={{ title: 'New event', presentation: 'modal' }} />
        <Stack.Screen name="organiser/[id]" options={{ title: 'Event dashboard' }} />
        <Stack.Screen name="venues/index" options={{ title: 'Find a space' }} />
        <Stack.Screen name="venues/[id]" options={{ title: 'Space' }} />
        <Stack.Screen name="venues/edit" options={{ title: 'New space', presentation: 'modal' }} />
        <Stack.Screen name="venues/book/[id]" options={{ title: 'Request to book', presentation: 'modal' }} />
        <Stack.Screen name="bookings/[id]" options={{ title: 'Booking' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="organizer/[slug]" options={{ title: 'Organiser' }} />
        <Stack.Screen name="organizers" options={{ title: 'Organisers' }} />
        <Stack.Screen name="memberships" options={{ title: 'Memberships' }} />
        <Stack.Screen name="organizer/edit" options={{ title: 'Edit page', presentation: 'modal' }} />
        <Stack.Screen name="organiser/edit/[id]" options={{ title: 'Edit event', presentation: 'modal' }} />
        <Stack.Screen name="organiser/cancel/[id]" options={{ title: 'Cancel event', presentation: 'modal' }} />
        <Stack.Screen name="sign-in" options={{ title: '', presentation: 'modal' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="pay/[id]" options={{ title: 'Payment', presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="pay/gateway/[id]" options={{ title: 'Card payment', presentation: 'modal' }} />
        <Stack.Screen name="pay/return" options={{ headerShown: false }} />
        <Stack.Screen name="wallet" options={{ title: 'Wallet' }} />
        <Stack.Screen name="verify/index" options={{ title: 'Verification' }} />
        <Stack.Screen name="verify/space/[id]" options={{ title: 'Verify a space' }} />
        <Stack.Screen name="inbox" options={{ title: 'Notifications' }} />
        <Stack.Screen name="pro" options={{ title: 'Organiser Pro' }} />
        <Stack.Screen name="report" options={{ title: 'Report', presentation: 'modal' }} />
        <Stack.Screen name="help/index" options={{ title: 'Help' }} />
        <Stack.Screen name="help/[slug]" options={{ title: 'Help' }} />
        <Stack.Screen name="admin/index" options={{ title: 'Admin' }} />
        <Stack.Screen name="admin/verification/[id]" options={{ title: 'Review' }} />
        <Stack.Screen name="collection/[slug]" options={{ title: '' }} />
        <Stack.Screen name="story/[id]" options={{ title: 'Share to your story', presentation: 'modal' }} />
        <Stack.Screen name="organizer/membership" options={{ title: 'Membership', presentation: 'modal' }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
      <BrandIntro />
      <DialogHost />
    </RefreshProvider>
    </AppStoreProvider>
    </AuthProvider>
  );
}
