import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { completeOAuth, useAuth } from '@/lib/auth';
import { useColors } from '@/theme/useTheme';
import { SmileySad } from 'phosphor-react-native';

// Where Google sends people back to. On web the Supabase client exchanges the
// code itself; on Android the deep link can also open this screen directly.
export default function AuthCallback() {
  const colors = useColors();
  const { session, ready } = useAuth();
  const url = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && session) router.replace('/');
  }, [ready, session]);

  useEffect(() => {
    if (!ready || session || !url || !url.includes('code=')) return;
    completeOAuth(url).catch((e: Error) => setError(e.message));
  }, [ready, session, url]);

  if (error) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <EmptyState
          icon={SmileySad}
          title="Sign-in didn’t finish"
          body={error}
          action={{ label: 'Try again', onPress: () => router.replace('/sign-in') }}
        />
      </View>
    );
  }
  return (
    <View style={[styles.fill, styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
