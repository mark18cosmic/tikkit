import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// A placeholder block that gently pulses while content loads. The pulse tells
// people something is on its way; Reduce Motion keeps it still.
export function Bone({ width = '100%', height = 16, round, style }: { width?: DimensionValue; height?: number; round?: boolean; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.45, { duration: 750, reduceMotion: ReduceMotion.System }), -1, true);
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[{ width, height, backgroundColor: colors.surface, borderRadius: round ? radius.pill : radius.control - 4 }, anim, style]}
    />
  );
}

// Matches EventRow: thumbnail on the left, four lines of text.
export function EventRowSkeleton() {
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Bone width={96} height={96} style={styles.thumb} />
      <View style={styles.lines}>
        <Bone width="35%" height={12} />
        <Bone width="85%" height={18} />
        <Bone width="60%" height={14} />
        <Bone width="30%" height={14} />
      </View>
    </View>
  );
}

// A list screen loading: a few rows.
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.list}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.listRow}>
          <Bone width={44} height={44} />
          <View style={styles.lines}>
            <Bone width="70%" height={16} />
            <Bone width="45%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm },
  thumb: { marginTop: space.sm },
  lines: { flex: 1, gap: space.sm, paddingTop: space.sm },
  list: { gap: space.md, paddingVertical: space.md },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
