import type { BottomTabBarProps } from 'expo-router/tabs';
import { router } from 'expo-router';
import { ArrowLeft, Plus } from 'phosphor-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { Wordmark } from './LogoMark';
import { useLayout } from '@/lib/useLayout';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// Top navigation for desktop browsers. Phones keep the native bottom tab bar.
// The same bar sits above every page, so nothing jumps when you move around.

const TABS = [
  { name: 'index', label: 'Explore', href: '/' },
  { name: 'tickets', label: 'Tickets', href: '/tickets' },
  { name: 'profile', label: 'Account', href: '/profile' },
] as const;

function Bar({ active, onTab }: { active?: string; onTab: (name: (typeof TABS)[number]['name'], href: string) => void }) {
  const colors = useColors();
  const { gutter } = useLayout();
  return (
    <View style={[styles.bar, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={[styles.inner, { paddingHorizontal: gutter }]}>
        <Pressable accessibilityRole="link" accessibilityLabel="Tikkit home" onPress={() => onTab('index', '/')} style={styles.home}>
          <Wordmark height={32} color={colors.accent} />
        </Pressable>

        <View style={styles.links} accessibilityRole="tablist">
          {TABS.map((t) => {
            const focused = active === t.name;
            return (
              <Pressable
                key={t.name}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                onPress={() => onTab(t.name, t.href)}
                style={(s) => [
                  styles.link,
                  focused && { backgroundColor: colors.surface },
                  (s as { hovered?: boolean }).hovered && !focused && { backgroundColor: colors.surface },
                ]}
              >
                <AppText variant="callout" color={focused ? colors.text : colors.textMuted} style={styles.linkText}>
                  {t.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <Button label="Create event" icon={Plus} variant="secondary" onPress={() => router.push('/organiser/new')} style={styles.cta} />
      </View>
    </View>
  );
}

export function DesktopNav({ state, navigation }: BottomTabBarProps) {
  const active = state.routes[state.index]?.name;
  return (
    <Bar
      active={active}
      onTab={(name) => {
        const route = state.routes.find((r) => r.name === name);
        if (!route) return;
        const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (active !== name && !e.defaultPrevented) navigation.navigate(name);
      }}
    />
  );
}

// Header for every other page on desktop: the same bar, then back and the
// page title lined up with the content below.
export function DesktopStackHeader({ title, canGoBack }: { title?: string; canGoBack: boolean }) {
  const colors = useColors();
  const { gutter } = useLayout();
  return (
    <View style={{ backgroundColor: colors.background }}>
      <Bar onTab={(_, href) => router.navigate(href as '/')} />
      <View style={[styles.sub, { paddingHorizontal: gutter }]}>
        {canGoBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={(s) => [styles.back, (s as { hovered?: boolean }).hovered && { backgroundColor: colors.surface }]}
          >
            <ArrowLeft size={18} color={colors.accent} weight="bold" />
            <AppText variant="subhead" color={colors.accent} style={styles.linkText}>
              Back
            </AppText>
          </Pressable>
        )}
        {!!title && (
          <AppText variant="headline" numberOfLines={1} style={styles.title}>
            {title}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  inner: { height: 68, flexDirection: 'row', alignItems: 'center', gap: space.xl },
  home: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  links: { flexDirection: 'row', gap: space.xs, flex: 1 },
  link: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill },
  linkText: { fontWeight: '600' },
  cta: { minHeight: 40, paddingVertical: space.xs },
  sub: { flexDirection: 'row', alignItems: 'center', gap: space.md, height: 52 },
  back: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, marginLeft: -space.sm },
  title: { flex: 1 },
});
