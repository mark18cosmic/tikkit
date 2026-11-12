import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { CaretRight, type Icon } from '@/components/icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { tapFeedback } from '@/lib/haptics';
import { setAppearance, useAppearancePref, type AppearancePref } from '@/theme/appearance';
import { brand, minTouchTarget, radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// Building blocks shared by the Account and Settings screens.

export function Heading({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View style={styles.headingRow}>
      <AppText variant="title3" accessibilityRole="header" style={styles.fill}>
        {children}
      </AppText>
      {action}
    </View>
  );
}

export function Group({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.group, { backgroundColor: colors.surface }]}>{children}</View>;
}

export function Note({ icon: IconCmp, text }: { icon: Icon; text: string }) {
  const colors = useColors();
  return (
    <View style={[styles.note, { backgroundColor: colors.surface }]}>
      <IconCmp size={20} color={colors.textMuted} />
      <AppText variant="subhead" muted style={styles.fill}>
        {text}
      </AppText>
    </View>
  );
}

export function Row({
  icon: IconCmp,
  label,
  detail,
  onPress,
  danger,
  trailing,
  divider,
}: {
  icon: Icon;
  label: string;
  detail?: string;
  onPress: () => void;
  danger?: boolean;
  trailing?: string;
  divider?: boolean;
}) {
  const colors = useColors();
  const tint = danger ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[trailing, label, detail].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <IconCmp size={22} color={tint} />
      <View style={styles.fill}>
        <AppText color={tint} numberOfLines={2}>
          {label}
        </AppText>
        {!!detail && (
          <AppText variant="footnote" muted numberOfLines={1}>
            {detail}
          </AppText>
        )}
      </View>
      {trailing ? (
        <AppText variant="subhead" color={colors.accent} style={styles.bold}>
          {trailing}
        </AppText>
      ) : (
        !danger && <CaretRight size={18} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

// Initials on the brand gradient instead of a generic person icon.
// A profile photo when there is one, otherwise initials on the brand gradient.
export function Avatar({ name, size = 48, uri }: { name: string; size?: number; uri?: string }) {
  const colors = useColors();
  if (uri) {
    return (
      <Image
        source={uri}
        contentFit="cover"
        transition={150}
        accessibilityIgnoresInvertColors
        style={[styles.avatar, { width: size, height: size, backgroundColor: colors.surface }]}
      />
    );
  }
  const initials =
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';
  return (
    <LinearGradient
      colors={[brand.crimson, brand.coral]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.avatar, { width: size, height: size }]}
    >
      <AppText variant="headline" color="#FFFFFF" style={styles.avatarText}>
        {initials}
      </AppText>
    </LinearGradient>
  );
}

const appearanceOptions: { id: AppearancePref; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function AppearancePicker() {
  const colors = useColors();
  const pref = useAppearancePref();
  return (
    <View style={[styles.segment, { backgroundColor: colors.surface }]} accessibilityRole="radiogroup">
      {appearanceOptions.map((o) => (
        <Pressable
          key={o.id}
          accessibilityRole="radio"
          accessibilityState={{ selected: pref === o.id }}
          onPress={() => {
            tapFeedback();
            setAppearance(o.id);
          }}
          style={[styles.segmentItem, pref === o.id && { backgroundColor: colors.elevated }]}
        >
          <AppText variant="subhead" style={styles.bold} muted={pref !== o.id}>
            {o.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

export const listStyles = StyleSheet.create({
  foot: { marginTop: space.sm },
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  headingRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.xl, marginBottom: space.sm, gap: space.sm },
  note: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, padding: space.md, borderRadius: radius.control },
  group: { borderRadius: radius.control, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: minTouchTarget + 12,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  avatar: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700', letterSpacing: 0.5 },
  segment: { flexDirection: 'row', borderRadius: radius.control, padding: 3 },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: minTouchTarget - 4,
    borderRadius: radius.control - 3,
  },
});
