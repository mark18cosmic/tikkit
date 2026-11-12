import { Stack, useLocalSearchParams } from 'expo-router';
import { Question } from 'phosphor-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { findArticle } from '@/content/help';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function HelpArticle() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const colors = useColors();
  const a = findArticle(slug);
  if (!a) return <EmptyState icon={Question} title="Article not found" body="It may have moved. Open Help to see everything." />;
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Stack.Screen options={{ title: a.group }} />
      <Container style={styles.gap}>
        <View style={styles.head}>
          <AppText variant="title" accessibilityRole="header">
            {a.title}
          </AppText>
          <AppText muted>{a.summary}</AppText>
        </View>
        {a.body.map((b, i) => (
          <View key={i} style={styles.block}>
            {b.h && (
              <AppText variant="headline" accessibilityRole="header">
                {b.h}
              </AppText>
            )}
            {b.p && <AppText style={styles.para}>{b.p}</AppText>}
            {b.list?.map((item) => (
              <View key={item} style={styles.item}>
                <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                <AppText style={[styles.fill, styles.para]}>{item}</AppText>
              </View>
            ))}
          </View>
        ))}
      </Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: space.lg, paddingBottom: space.xxl },
  gap: { gap: space.lg },
  head: { gap: space.xs },
  block: { gap: space.sm },
  para: { maxWidth: 640 },
  item: { flexDirection: 'row', gap: space.sm + 4 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 10 },
  fill: { flex: 1 },
});
