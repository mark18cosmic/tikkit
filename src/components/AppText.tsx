import { Text, type TextProps } from 'react-native';

import { type } from '@/theme/tokens';
import { useBoldText, useColors } from '@/theme/useTheme';

export type TextVariant = keyof typeof type;

const bolder: Record<string, '600' | '700' | '800'> = { '400': '600', '500': '600', '600': '700', '700': '800' };

export function AppText({
  variant = 'body',
  muted,
  color,
  style,
  ...rest
}: TextProps & { variant?: TextVariant; muted?: boolean; color?: string }) {
  const colors = useColors();
  const bold = useBoldText();
  const base = type[variant];
  return (
    <Text
      {...rest}
      style={[
        base,
        bold && { fontWeight: bolder[base.fontWeight] },
        { color: color ?? (muted ? colors.textMuted : colors.text) },
        style,
      ]}
    />
  );
}
