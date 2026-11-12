import { Star } from '@/components/icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { tapFeedback } from '@/lib/haptics';
import { brand } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// Star rating. Read-only when there's no onChange.
export function Stars({ value, size = 16, onChange }: { value: number; size?: number; onChange?: (n: number) => void }) {
  const colors = useColors();
  if (!onChange) {
    return (
      <View style={styles.row} accessible accessibilityLabel={`${value.toFixed(1)} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} size={size} color={n <= Math.round(value) ? brand.peach : colors.border} weight="fill" />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityLabel="Rating" accessibilityValue={{ min: 1, max: 5, now: value }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={`${n} ${n === 1 ? 'star' : 'stars'}`}
          accessibilityState={{ selected: n === value }}
          hitSlop={4}
          onPress={() => {
            tapFeedback();
            onChange(n);
          }}
          style={styles.hit}
        >
          <Star size={size} color={n <= value ? brand.peach : colors.textMuted} weight={n <= value ? 'fill' : 'regular'} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  hit: { padding: 4 },
});
