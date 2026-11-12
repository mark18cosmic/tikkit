import { router } from 'expo-router';
import { SmileySad } from 'phosphor-react-native';
import { View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';

export default function NotFound() {
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState
        icon={SmileySad}
        title="Page not found"
        body="That link does not go anywhere."
        action={{ label: 'Back to Explore', onPress: () => router.replace('/') }}
      />
    </View>
  );
}
