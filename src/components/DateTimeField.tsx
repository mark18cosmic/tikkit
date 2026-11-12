import { CalendarBlank, CaretLeft, CaretRight, Clock } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { mvDateInput } from '@/lib/format';
import { tapFeedback } from '@/lib/haptics';
import { minTouchTarget, radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';
import { enter } from '@/theme/motion';

// Date and time pickers that work the same on iOS, Android and the web, in
// Maldives time. Values stay the form strings the rest of the app uses:
// dates as YYYY-MM-DD and times as HH:MM.

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const longFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const parse = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
};
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const labelFor = (v: string) => {
  const p = parse(v);
  return p ? longFmt.format(new Date(Date.UTC(p.y, p.m, p.d))) : '';
};

function Trigger({ label, value, placeholder, icon: IconCmp, error, helper, onPress }: { label: string; value: string; placeholder: string; icon: typeof Clock; error?: string; helper?: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <AppText variant="subhead" style={styles.label}>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || 'not set'}`}
        accessibilityHint={error ?? helper}
        onPress={() => {
          tapFeedback();
          onPress();
        }}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.surface },
          pressed && { opacity: 0.8 },
        ]}
      >
        <IconCmp size={18} color={colors.textMuted} />
        <AppText style={styles.fill} muted={!value} numberOfLines={1}>
          {value || placeholder}
        </AppText>
      </Pressable>
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
}

function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={enter.fade()} style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <View style={styles.sheetHost} pointerEvents="box-none">
        <Animated.View
          entering={enter.sheet()}
          style={[styles.sheet, { backgroundColor: colors.elevated, paddingBottom: Math.max(insets.bottom, space.md) }]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <AppText variant="headline" style={styles.sheetTitle} accessibilityRole="header">
            {title}
          </AppText>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

export function DateField({ label, value, onChange, error, helper, minDate }: { label: string; value: string; onChange: (v: string) => void; error?: string; helper?: string; minDate?: string }) {
  const colors = useColors();
  const today = mvDateInput(new Date().toISOString()).date;
  const min = minDate ?? today;
  const start = parse(value) ?? parse(min)!;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState({ y: start.y, m: start.m });

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(month.y, month.m, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Monday first
    const days = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)] as (number | null)[];
  }, [month]);

  const shift = (n: number) => setMonth((c) => {
    const d = new Date(Date.UTC(c.y, c.m + n, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });
  const minP = parse(min)!;
  const canBack = month.y > minP.y || (month.y === minP.y && month.m > minP.m);

  return (
    <>
      <Trigger label={label} value={labelFor(value)} placeholder="Choose a date" icon={CalendarBlank} error={error} helper={helper} onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View style={styles.monthRow}>
          <IconButton icon={CaretLeft} accessibilityLabel="Previous month" onPress={() => shift(-1)} disabled={!canBack} style={!canBack && styles.off} />
          <AppText variant="headline" accessibilityLiveRegion="polite">
            {monthFmt.format(new Date(Date.UTC(month.y, month.m, 1)))}
          </AppText>
          <IconButton icon={CaretRight} accessibilityLabel="Next month" onPress={() => shift(1)} />
        </View>
        <View style={styles.grid}>
          {WEEKDAYS.map((w) => (
            <AppText key={w} variant="caption" muted style={styles.weekday}>
              {w}
            </AppText>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <View key={`e${i}`} style={styles.cell} />;
            const v = iso(month.y, month.m, d);
            const disabled = v < min;
            const selected = v === value;
            // The Maldivian weekend is Friday and Saturday.
            const weekend = i % 7 === 4 || i % 7 === 5;
            return (
              <Pressable
                key={v}
                accessibilityRole="button"
                accessibilityLabel={labelFor(v)}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => {
                  tapFeedback();
                  onChange(v);
                  setOpen(false);
                }}
                style={styles.cell}
              >
                <View style={[styles.day, selected && { backgroundColor: colors.accent }, v === today && !selected && { borderWidth: 1.5, borderColor: colors.accent }]}>
                  <AppText
                    variant="callout"
                    color={selected ? colors.onAccent : disabled ? colors.border : weekend ? colors.accent : colors.text}
                    style={selected || weekend ? styles.bold : undefined}
                  >
                    {d}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
        <AppText variant="footnote" muted style={styles.sheetNote}>
          Fridays and Saturdays, the weekend, are highlighted. Maldives time.
        </AppText>
      </Sheet>
    </>
  );
}

const TIMES = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

export function TimeField({ label, value, onChange, error, helper }: { label: string; value: string; onChange: (v: string) => void; error?: string; helper?: string }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  // Start the list near the current choice, or early evening.
  const anchor = Math.max(0, TIMES.indexOf(TIMES.includes(value) ? value : '18:00') - 4);
  return (
    <>
      <Trigger label={label} value={value} placeholder="Choose a time" icon={Clock} error={error} helper={helper} onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <ScrollView style={styles.times} contentOffset={{ x: 0, y: anchor * (minTouchTarget + 4) }} contentContainerStyle={styles.timesInner}>
          {TIMES.map((t) => {
            const selected = t === value;
            return (
              <Pressable
                key={t}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  tapFeedback();
                  onChange(t);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.time, selected && { backgroundColor: colors.accent }, pressed && !selected && { backgroundColor: colors.surface }]}
              >
                <AppText variant="headline" color={selected ? colors.onAccent : colors.text} style={styles.tabular}>
                  {t}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
        <Button label="Done" variant="secondary" onPress={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs + 2 },
  label: { fontWeight: '600' },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: minTouchTarget + 6,
    borderRadius: radius.control,
    borderWidth: 1.5,
    paddingHorizontal: space.md,
  },
  fill: { flex: 1 },
  bold: { fontWeight: '700' },
  off: { opacity: 0.3 },
  tabular: { fontVariant: ['tabular-nums'] },
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, paddingHorizontal: space.md, paddingTop: space.sm, gap: space.sm, maxWidth: 560, width: '100%', alignSelf: 'center' },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3 },
  sheetTitle: { textAlign: 'center' },
  sheetNote: { textAlign: 'center' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', paddingVertical: space.xs },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  times: { maxHeight: 320 },
  timesInner: { gap: 4 },
  time: { minHeight: minTouchTarget, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
});
