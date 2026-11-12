import { Pressable, StyleSheet } from 'react-native';

import { AppText } from './AppText';
import { tapFeedback } from '@/lib/haptics';
import { minTouchTarget, radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: selected ? colors.text : colors.surface },
        pressed && { opacity: 0.8 },
      ]}
    >
      <AppText variant="subhead" color={selected ? colors.background : colors.text} style={styles.label}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouchTarget - 8,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  label: { fontWeight: '600' },
});
