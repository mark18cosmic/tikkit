import { router } from 'expo-router';
import { CaretRight, SealCheck } from '@/components/icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Avatar } from './SettingsList';
import { tapFeedback } from '@/lib/haptics';
import { useAppStore } from '@/store/AppStore';
import { minTouchTarget, radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

type Org = { id: string; slug: string; name: string; avatar?: string; verified?: boolean };

// An organiser in a row: logo, name, a line about them, and Follow.
// The whole row opens their page.
export function OrganizerCard({ org, detail, label = 'Organiser' }: { org: Org; detail?: string; label?: string }) {
  const colors = useColors();
  const { following, toggleFollow } = useAppStore();
  const on = following.includes(org.id);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${org.name}${org.verified ? ', verified' : ''}`}
      onPress={() => router.push({ pathname: '/organizer/[slug]', params: { slug: org.slug } })}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && styles.pressed]}
    >
      <Avatar name={org.name} uri={org.avatar} size={48} />
      <View style={styles.text}>
        <AppText variant="caption" muted>
          {label}
        </AppText>
        <View style={styles.nameRow}>
          <AppText variant="headline" numberOfLines={1} style={styles.shrink}>
            {org.name}
          </AppText>
          {org.verified && <SealCheck size={16} color={colors.accent} weight="fill" />}
        </View>
        {!!detail && (
          <AppText variant="footnote" muted numberOfLines={1}>
            {detail}
          </AppText>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={on ? `Unfollow ${org.name}` : `Follow ${org.name}`}
        accessibilityState={{ selected: on }}
        hitSlop={6}
        onPress={() => {
          tapFeedback();
          toggleFollow({ id: org.id, slug: org.slug, name: org.name, avatar: org.avatar });
        }}
        style={({ pressed }) => [
          styles.follow,
          on ? { borderColor: colors.border, borderWidth: 1 } : { backgroundColor: colors.text },
          pressed && styles.pressed,
        ]}
      >
        <AppText variant="footnote" color={on ? colors.text : colors.background} style={styles.bold}>
          {on ? 'Following' : 'Follow'}
        </AppText>
      </Pressable>
      <CaretRight size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, padding: space.sm + 4, borderRadius: radius.control },
  text: { flex: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  shrink: { flexShrink: 1 },
  follow: { minHeight: minTouchTarget - 12, paddingHorizontal: space.sm + 6, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  bold: { fontWeight: '600' },
  pressed: { opacity: 0.8 },
});
