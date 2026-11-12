import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export function Stat({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={[styles.tile, { backgroundColor: colors.surface }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="footnote" muted>
        {label}
      </AppText>
      {/* Long values (money) step down a size: adjustsFontSizeToFit doesn't work on the web. */}
      <AppText variant={value.length > 9 ? 'title3' : 'title'} style={styles.tabular} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
    </View>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { flexGrow: 1, flexBasis: 140, padding: space.md, borderRadius: radius.control, gap: space.xs },
  tabular: { fontVariant: ['tabular-nums'] },
});
