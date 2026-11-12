import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

// Scrollable form with a bottom action bar that rides above the keyboard.
// iOS: KeyboardAvoidingView pads by the keyboard height. Android: the window
// resizes (adjustResize), so no extra padding is needed.
export function KeyboardScreen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const keyboard = useKeyboardVisible();
  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        style={styles.fill}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={false}
        contentContainerStyle={styles.content}
      >
        {children}
      </ScrollView>
      {footer && (
        <View
          style={[
            styles.bar,
            {
              paddingBottom: keyboard ? space.sm + 4 : Math.max(insets.bottom, space.md),
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          {footer}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingVertical: space.lg },
  bar: { paddingTop: space.sm + 4, borderTopWidth: StyleSheet.hairlineWidth },
});
