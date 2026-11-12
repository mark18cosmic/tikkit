import { Stack, useLocalSearchParams } from 'expo-router';
import { SmileySad } from '@/components/icons';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { EventRow } from '@/components/EventCards';
import { isListed, type EventItem } from '@/data/events';
import { useAppStore } from '@/store/AppStore';
import { space } from '@/theme/tokens';

// One curated collection from Explore, everything in it that's still on.
export default function CollectionScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { collections, getEvent } = useAppStore();
  const c = collections.find((x) => x.slug === slug);
  if (!c) return <EmptyState icon={SmileySad} title="Collection not found" body="It may have been taken down." />;
  const list = c.eventIds.map(getEvent).filter((e): e is EventItem => !!e && isListed(e));
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Stack.Screen options={{ title: c.title }} />
      <Container>
        <View style={styles.head}>
          <AppText variant="title" accessibilityRole="header">
            {c.title}
          </AppText>
          {!!c.subtitle && <AppText muted>{c.subtitle}</AppText>}
        </View>
        {list.length === 0 ? (
          <AppText muted>Nothing in this collection is on right now.</AppText>
        ) : (
          list.map((e) => <EventRow key={e.id} e={e} />)
        )}
      </Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: space.lg, paddingBottom: space.xxl },
  head: { gap: space.xs, marginBottom: space.md },
});
