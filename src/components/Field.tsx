import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from './AppText';
import { minTouchTarget, radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

type Props = TextInputProps & { label: string; error?: string; helper?: string };

// Label above, helper or error below. Never placeholder-as-label.
export const Field = forwardRef<TextInput, Props>(function Field({ label, error, helper, style, ...rest }, ref) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <AppText variant="subhead" style={styles.label}>
        {label}
      </AppText>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? helper}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          type.body,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.surface,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <AppText variant="footnote" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="footnote" muted>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.xs + 2 },
  label: { fontWeight: '600' },
  input: {
    minHeight: minTouchTarget + 6,
    borderRadius: radius.control,
    borderWidth: 1.5,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
});
