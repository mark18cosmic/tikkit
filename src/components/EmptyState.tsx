import type { Icon } from '@/components/icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

type Props = { icon: Icon; title: string; body: string; action?: { label: string; onPress: () => void } };

export function EmptyState({ icon: IconCmp, title, body, action }: Props) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <View style={[styles.badge, { backgroundColor: colors.surface }]}>
        <IconCmp size={28} color={colors.textMuted} weight="regular" />
      </View>
      <AppText variant="title3" style={styles.center}>
        {title}
      </AppText>
      <AppText muted style={styles.center}>
        {body}
      </AppText>
      {action && <Button label={action.label} onPress={action.onPress} style={styles.action} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.lg, gap: space.sm },
  badge: { width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  center: { textAlign: 'center', maxWidth: 360 },
  action: { marginTop: space.md, alignSelf: 'center', maxWidth: 360, width: '100%' },
});
