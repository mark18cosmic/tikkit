import type { Icon } from 'phosphor-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { AppText } from './AppText';
import { tapFeedback } from '@/lib/haptics';
import { minTouchTarget, radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: 'primary' | 'secondary' | 'plain';
  icon?: Icon;
  loading?: boolean;
};

export function Button({ label, variant = 'primary', icon: IconCmp, loading, disabled, onPress, style, ...rest }: Props) {
  const colors = useColors();
  const fg = variant === 'primary' ? colors.onAccent : variant === 'plain' ? colors.accent : colors.text;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={(e) => {
        tapFeedback();
        onPress?.(e);
      }}
      style={(state) => [
        styles.base,
        variant === 'primary' && { backgroundColor: colors.accent },
        variant === 'secondary' && { backgroundColor: colors.surface },
        state.pressed && styles.pressed,
        inactive && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <>
            {IconCmp && <IconCmp size={20} color={fg} weight="bold" />}
            <AppText variant="headline" color={fg} numberOfLines={1}>
              {label}
            </AppText>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouchTarget + 6,
    paddingHorizontal: space.md + 4,
    paddingVertical: space.sm + 4,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
});
