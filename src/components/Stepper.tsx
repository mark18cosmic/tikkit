import { Minus, Plus } from '@/components/icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { space } from '@/theme/tokens';

type Props = { value: number; min?: number; max: number; onChange: (n: number) => void; label: string };

export function Stepper({ value, min = 0, max, onChange, label }: Props) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + 1));
        if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - 1));
      }}
    >
      <IconButton
        icon={Minus}
        accessibilityLabel={`Remove one ${label}`}
        disabled={value <= min}
        style={value <= min && styles.off}
        onPress={() => onChange(Math.max(min, value - 1))}
      />
      <AppText variant="headline" style={styles.value}>
        {value}
      </AppText>
      <IconButton
        icon={Plus}
        accessibilityLabel={`Add one ${label}`}
        disabled={value >= max}
        style={value >= max && styles.off}
        onPress={() => onChange(Math.min(max, value + 1))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  value: { minWidth: 24, textAlign: 'center', fontVariant: ['tabular-nums'] },
  off: { opacity: 0.35 },
});
