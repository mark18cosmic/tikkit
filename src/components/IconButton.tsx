import type { Icon } from 'phosphor-react-native';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { tapFeedback } from '@/lib/haptics';
import { minTouchTarget, radius } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

type Props = Omit<PressableProps, 'children'> & {
  icon: Icon;
  accessibilityLabel: string;
  tone?: 'surface' | 'overlay';
  active?: boolean;
  weight?: 'regular' | 'bold' | 'fill';
};

export function IconButton({ icon: IconCmp, tone = 'surface', active, weight, onPress, style, ...rest }: Props) {
  const colors = useColors();
  const overlay = tone === 'overlay';
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={4}
      onPress={(e) => {
        tapFeedback();
        onPress?.(e);
      }}
      style={(state) => [
        styles.base,
        { backgroundColor: overlay ? colors.scrim : colors.surface },
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      <IconCmp
        size={20}
        weight={weight ?? (active ? 'fill' : 'bold')}
        color={active ? colors.accent : overlay ? colors.onScrim : colors.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
});
