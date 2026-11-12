import { StyleSheet, View, type ViewProps } from 'react-native';

import { useLayout } from '@/lib/useLayout';
import { maxContentWidth, space } from '@/theme/tokens';

// Centers content and caps line length on tablets and desktop browsers.
// Wide pages use the same side margins as Explore and the desktop top bar, so
// left edges line up across the app.
export function Container({ style, wide, ...rest }: ViewProps & { wide?: boolean }) {
  const { gutter } = useLayout();
  return <View style={[styles.base, wide ? { paddingHorizontal: gutter } : styles.narrow, style]} {...rest} />;
}

const styles = StyleSheet.create({
  base: { width: '100%', alignSelf: 'center', paddingHorizontal: space.md },
  narrow: { maxWidth: maxContentWidth },
});
