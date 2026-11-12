import { router } from 'expo-router';
import { Lifebuoy, ShieldCheck } from '@/components/icons';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Container } from '@/components/Container';
import { Group, Heading, Row } from '@/components/SettingsList';
import { helpArticles, helpGroups } from '@/content/help';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function HelpScreen() {
  const colors = useColors();
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Container>
        <View style={[styles.hero, { backgroundColor: colors.surface }]}>
          <ShieldCheck size={32} color={colors.success} weight="fill" />
          <View style={styles.fill}>
            <AppText variant="headline">Protected by the Tikkit Guarantee</AppText>
            <AppText variant="subhead" muted>
              Pay through Tikkit, never directly. If an event is cancelled or isn’t real, you’re refunded.
            </AppText>
          </View>
        </View>
        {helpGroups.map((g) => {
          const list = helpArticles.filter((a) => a.group === g);
          return (
            <View key={g}>
              <Heading>{g}</Heading>
              <Group>
                {list.map((a, i) => (
                  <Row
                    key={a.slug}
                    icon={a.group === 'Safety' ? ShieldCheck : Lifebuoy}
                    label={a.title}
                    detail={a.summary}
                    divider={i > 0}
                    onPress={() => router.push({ pathname: '/help/[slug]', params: { slug: a.slug } })}
                  />
                ))}
              </Group>
            </View>
          );
        })}
        <AppText variant="footnote" muted style={styles.foot} onPress={() => Linking.openURL('mailto:support@eventspace.mv')}>
          Still stuck? Email support@eventspace.mv and a person will reply.
        </AppText>
      </Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: space.lg },
  fill: { flex: 1 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.card },
  foot: { marginTop: space.lg },
});
