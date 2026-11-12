import { CheckCircle, Info, WarningCircle } from '@/components/icons';
import { useEffect, type ReactNode } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { AppText } from './AppText';
import { Button } from './Button';
import { dismissToast, useDialogState, type Dialog } from '@/lib/dialog';
import { tapFeedback } from '@/lib/haptics';
import { enter, exit } from '@/theme/motion';
import { radius, space } from '@/theme/tokens';
import { useColors, useReduceMotion } from '@/theme/useTheme';

// iOS draws modal screens in their own layer; this keeps prompts above them.
function Overlay({ children }: { children: ReactNode }) {
  return Platform.OS === 'ios' ? <FullWindowOverlay>{children}</FullWindowOverlay> : <>{children}</>;
}

export function DialogHost() {
  const { dialogs, toast } = useDialogState();
  const top = dialogs[dialogs.length - 1];
  if (!top && !toast) return null;
  return (
    <Overlay>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {top && <DialogView key={top.id} dialog={top} />}
        {toast && <ToastView key={toast.id} message={toast.message} tone={toast.tone} />}
      </View>
    </Overlay>
  );
}

function DialogView({ dialog }: { dialog: Dialog }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const cancel = () => dialog.resolve(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dialog.resolve(false);
      return true;
    });
    if (Platform.OS !== 'web') return () => sub.remove();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dialog.resolve(false);
    window.addEventListener('keydown', onKey);
    return () => {
      sub.remove();
      window.removeEventListener('keydown', onKey);
    };
  }, [dialog]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={reduce ? undefined : enter.fade()} style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}>
        <Pressable accessibilityLabel={dialog.cancel ?? dialog.action} style={StyleSheet.absoluteFill} onPress={dialog.cancel ? cancel : undefined} />
      </Animated.View>
      <View style={[styles.sheetWrap, { paddingBottom: insets.bottom + space.md }]} pointerEvents="box-none">
        <Animated.View
          entering={reduce ? undefined : enter.sheet()}
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[styles.sheet, { backgroundColor: colors.elevated }]}
        >
          <AppText variant="title3" accessibilityRole="header">
            {dialog.title}
          </AppText>
          {!!dialog.body && (
            <AppText variant="subhead" muted>
              {dialog.body}
            </AppText>
          )}
          <View style={styles.buttons}>
            <Button
              label={dialog.action}
              onPress={() => dialog.resolve(true)}
              style={dialog.tone === 'danger' ? { backgroundColor: colors.danger } : undefined}
            />
            {dialog.cancel && <Button label={dialog.cancel} variant="secondary" onPress={cancel} />}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

function ToastView({ message, tone }: { message: string; tone: 'success' | 'error' | 'info' }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const look = {
    success: { icon: CheckCircle, tint: colors.success },
    error: { icon: WarningCircle, tint: colors.danger },
    info: { icon: Info, tint: colors.accent },
  }[tone];
  return (
    <View style={[styles.toastWrap, { top: insets.top + space.sm }]} pointerEvents="box-none">
      <Animated.View entering={reduce ? undefined : enter.rise()} exiting={reduce ? undefined : exit.fade()}>
        <Pressable
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          onPress={() => {
            tapFeedback();
            dismissToast();
          }}
          style={[styles.toast, { backgroundColor: colors.elevated, borderColor: colors.border }]}
        >
          <look.icon size={20} color={look.tint} weight="fill" />
          <AppText variant="subhead" style={styles.toastText}>
            {message}
          </AppText>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetWrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: space.md },
  sheet: { width: '100%', maxWidth: 440, borderRadius: radius.card, padding: space.lg, gap: space.sm },
  buttons: { gap: space.sm, marginTop: space.md },
  toastWrap: { position: 'absolute', left: space.md, right: space.md, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: 480,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 4,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0 6px 24px rgba(12,12,14,0.14)',
  },
  toastText: { flexShrink: 1, fontWeight: '600' },
});
