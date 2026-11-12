import { usePathname } from 'expo-router';
import { UserCircle } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { EmptyState } from './EmptyState';
import { goSignIn, useAuth } from '@/lib/auth';
import { useColors } from '@/theme/useTheme';

// Renders children only for signed-in people. The server enforces the same
// rules; this just puts the sign-in step where people expect it.
export function SignInRequired({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  const { session, ready } = useAuth();
  const pathname = usePathname();
  const colors = useColors();
  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  if (!session) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <EmptyState icon={UserCircle} title={title} body={body} action={{ label: 'Sign in', onPress: () => goSignIn(pathname) }} />
      </View>
    );
  }
  return children;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
