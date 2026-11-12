import { Tabs } from 'expo-router';
import { Compass, Ticket, UserCircle } from 'phosphor-react-native';

import { DesktopNav } from '@/components/DesktopNav';
import { useLayout } from '@/lib/useLayout';
import { ticketStatus, useAppStore } from '@/store/AppStore';
import { useColors } from '@/theme/useTheme';

export default function TabsLayout() {
  const colors = useColors();
  const { tickets, getEvent } = useAppStore();
  const { isDesktop } = useLayout();
  const now = new Date();
  const unused = tickets.filter((t) => {
    const e = getEvent(t.eventId);
    return ticketStatus(t) === 'active' && e && new Date(e.endsAt) > now;
  }).length;
  return (
    <Tabs
      tabBar={isDesktop ? (props) => <DesktopNav {...props} /> : undefined}
      screenOptions={{
        tabBarPosition: isDesktop ? 'top' : 'bottom',
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, focused, size }) => <Compass color={color as string} size={size} weight={focused ? 'fill' : 'regular'} />,
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: 'Tickets',
          tabBarBadge: unused > 0 ? unused : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.onAccent },
          tabBarIcon: ({ color, focused, size }) => <Ticket color={color as string} size={size} weight={focused ? 'fill' : 'regular'} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, focused, size }) => (
            <UserCircle color={color as string} size={size} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
    </Tabs>
  );
}
