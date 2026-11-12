import { Check, LockSimple, X } from '@/components/icons';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import type { Tier } from '@/data/events';
import { formatMoney, type Currency } from '@/lib/format';
import { errorFeedback, tapFeedback } from '@/lib/haptics';
import type { Seat } from '@/lib/market';
import { radius, space, type ColorTokens } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

const SIZE = 30;
const TABLE_SEAT = 26;

type Props = {
  seats: Seat[];
  tiers: Tier[];
  currency?: Currency;
  selected: string[];
  onChange: (ids: string[]) => void;
  max: number;
  // 'hold': the organiser taps seats to keep them back from sale.
  mode?: 'buy' | 'hold';
};

type Group = { key: string; label: string; seats: Seat[] };
type Section = { name: string; kind: 'row' | 'table'; tierId: string; groups: Group[] };

// Seats laid out by section, stage at the top. Rows are lines of seats; tables
// are drawn round, seats around the edge. Free, yours and taken differ by shape
// as well as colour: a tick on yours, a cross on taken, a lock on held.
export function SeatPicker({ seats, tiers, currency = 'MVR', selected, onChange, max, mode = 'buy' }: Props) {
  const colors = useColors();
  const sections = useMemo(() => {
    const out: Section[] = [];
    for (const s of [...seats].sort((a, b) => a.position - b.position)) {
      let sec = out.find((x) => x.name === s.section);
      if (!sec) {
        sec = { name: s.section, kind: s.kind, tierId: s.tierId, groups: [] };
        out.push(sec);
      }
      let g = sec.groups.find((x) => x.key === s.row);
      if (!g) {
        g = { key: s.row, label: s.kind === 'table' ? `Table ${s.row}` : s.row, seats: [] };
        sec.groups.push(g);
      }
      g.seats.push(s);
    }
    return out;
  }, [seats]);

  const holding = mode === 'hold';
  // In hold mode, seats already sold can't be held; held ones can be released.
  const tappable = (s: Seat) => (holding ? s.free || s.held : s.free);

  const toggle = (s: Seat) => {
    if (!tappable(s)) return;
    if (selected.includes(s.id)) {
      tapFeedback();
      return onChange(selected.filter((x) => x !== s.id));
    }
    if (selected.length >= max) return errorFeedback();
    tapFeedback();
    onChange([...selected, s.id]);
  };

  // Tapping a table picks every free seat at it (or as many as allowed),
  // or clears them if they're all already picked.
  const toggleTable = (g: Group) => {
    const open = g.seats.filter(tappable);
    if (open.length === 0) return errorFeedback();
    const allMine = open.every((s) => selected.includes(s.id));
    if (allMine) {
      tapFeedback();
      return onChange(selected.filter((id) => !open.some((s) => s.id === id)));
    }
    const room = max - selected.length;
    const add = open.filter((s) => !selected.includes(s.id)).slice(0, Math.max(0, room));
    if (add.length === 0) return errorFeedback();
    tapFeedback();
    onChange([...selected, ...add.map((s) => s.id)]);
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.stage, { backgroundColor: colors.surface }]}>
        <AppText variant="caption" muted style={styles.stageText}>
          STAGE
        </AppText>
      </View>
      {sections.map((sec) => {
        const tier = tiers.find((t) => t.id === sec.tierId);
        return (
          <View key={sec.name} style={styles.section}>
            <View style={styles.sectionHead}>
              <AppText variant="headline">{sec.name}</AppText>
              {tier && (
                <AppText variant="subhead" muted>
                  {tier.name}, {formatMoney(tier.price, currency)}
                  {sec.kind === 'table' ? ' a seat' : ''}
                </AppText>
              )}
            </View>
            {sec.kind === 'table' ? (
              <>
                <AppText variant="footnote" muted>
                  {holding ? 'Tap a table to hold all of it, or single seats.' : 'Tap a table to book the whole table, or pick single seats.'}
                </AppText>
                <View style={styles.tables}>
                  {sec.groups.map((g) => (
                    <Table key={g.key} group={g} selected={selected} colors={colors} holding={holding} onSeat={toggle} onTable={() => toggleTable(g)} />
                  ))}
                </View>
              </>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowsScroll}>
                <View style={styles.rows}>
                  {sec.groups.map((g) => (
                    <View key={g.key} style={styles.row}>
                      <AppText variant="caption" muted style={styles.rowLabel}>
                        {g.label}
                      </AppText>
                      {g.seats.map((s) => (
                        <SeatButton
                          key={s.id}
                          seat={s}
                          label={`${sec.name}, row ${g.label}, seat ${s.number}`}
                          mine={selected.includes(s.id)}
                          holding={holding}
                          colors={colors}
                          size={SIZE}
                          onPress={() => toggle(s)}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        );
      })}
      <View style={styles.legend}>
        <Legend label="Free">
          <View style={[styles.key, { backgroundColor: colors.elevated, borderColor: colors.border }]} />
        </Legend>
        <Legend label={holding ? 'Chosen' : 'Yours'}>
          <View style={[styles.key, { backgroundColor: colors.accent, borderColor: colors.accent }]}>
            <Check size={10} color={colors.onAccent} weight="bold" />
          </View>
        </Legend>
        {holding && (
          <Legend label="Held">
            <View style={[styles.key, { backgroundColor: colors.surface, borderColor: colors.text }]}>
              <LockSimple size={9} color={colors.text} weight="bold" />
            </View>
          </Legend>
        )}
        <Legend label={holding ? 'Sold' : 'Taken'}>
          <View style={[styles.key, { backgroundColor: colors.surface, borderColor: colors.surface }]}>
            <X size={9} color={colors.textMuted} />
          </View>
        </Legend>
      </View>
    </View>
  );
}

function SeatButton({
  seat: s,
  label,
  mine,
  holding,
  colors,
  size,
  onPress,
  style,
}: {
  seat: Seat;
  label: string;
  mine: boolean;
  holding: boolean;
  colors: ColorTokens;
  size: number;
  onPress: () => void;
  style?: object;
}) {
  const held = holding && s.held;
  const open = holding ? s.free || s.held : s.free;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${mine ? ', selected' : held ? ', held' : open ? '' : ', taken'}`}
      accessibilityState={{ selected: mine, disabled: !open }}
      disabled={!open}
      onPress={onPress}
      hitSlop={2}
      style={[
        styles.seat,
        { width: size, height: size },
        mine
          ? { backgroundColor: colors.accent, borderColor: colors.accent }
          : held
            ? { backgroundColor: colors.surface, borderColor: colors.text }
            : open
              ? { backgroundColor: colors.elevated, borderColor: colors.border }
              : { backgroundColor: colors.surface, borderColor: colors.surface },
        style,
      ]}
    >
      {mine ? (
        <Check size={14} color={colors.onAccent} weight="bold" />
      ) : held ? (
        <LockSimple size={12} color={colors.text} weight="bold" />
      ) : open ? (
        <AppText variant="caption" style={styles.num}>
          {s.number}
        </AppText>
      ) : (
        <X size={12} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

// A round table with its seats spaced evenly around it.
function Table({
  group: g,
  selected,
  colors,
  holding,
  onSeat,
  onTable,
}: {
  group: Group;
  selected: string[];
  colors: ColorTokens;
  holding: boolean;
  onSeat: (s: Seat) => void;
  onTable: () => void;
}) {
  const n = g.seats.length;
  // Big enough that neighbouring seats don't touch.
  const ring = Math.max(44, (n * (TABLE_SEAT + 8)) / (2 * Math.PI));
  const box = ring * 2 + TABLE_SEAT;
  const table = ring * 2 - TABLE_SEAT - 10;
  const free = g.seats.filter((s) => s.free).length;
  const mine = g.seats.filter((s) => selected.includes(s.id)).length;
  return (
    <View style={[styles.tableBox, { width: box, height: box }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${g.label}, ${free} of ${n} seats free${mine ? `, ${mine} selected` : ''}. Tap to pick the whole table.`}
        onPress={onTable}
        style={({ pressed }) => [
          styles.table,
          {
            width: table,
            height: table,
            left: (box - table) / 2,
            top: (box - table) / 2,
            backgroundColor: mine === n ? colors.accent : colors.surface,
            borderColor: mine > 0 ? colors.accent : colors.border,
          },
          pressed && styles.pressed,
        ]}
      >
        <AppText variant="caption" color={mine === n ? colors.onAccent : colors.text} style={styles.tableNum}>
          {g.key}
        </AppText>
        <AppText variant="caption" color={mine === n ? colors.onAccent : colors.textMuted} style={styles.tableFree}>
          {free === 0 ? 'full' : `${free} free`}
        </AppText>
      </Pressable>
      {g.seats.map((s, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return (
          <SeatButton
            key={s.id}
            seat={s}
            label={`${g.label}, seat ${s.number}`}
            mine={selected.includes(s.id)}
            holding={holding}
            colors={colors}
            size={TABLE_SEAT}
            onPress={() => onSeat(s)}
            style={{ position: 'absolute', left: box / 2 + Math.cos(a) * ring - TABLE_SEAT / 2, top: box / 2 + Math.sin(a) * ring - TABLE_SEAT / 2, borderRadius: TABLE_SEAT / 2 }}
          />
        );
      })}
    </View>
  );
}

function Legend({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.legendItem}>
      {children}
      <AppText variant="footnote" muted>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  stage: { alignSelf: 'center', width: '70%', paddingVertical: space.xs + 2, borderRadius: radius.pill, alignItems: 'center' },
  stageText: { letterSpacing: 2, fontWeight: '700' },
  section: { gap: space.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  rowsScroll: { flexGrow: 1, justifyContent: 'center' },
  rows: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowLabel: { width: 14, textAlign: 'center', fontWeight: '700' },
  seat: { borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  num: { fontSize: 11, lineHeight: 13, fontVariant: ['tabular-nums'] },
  tables: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: space.md, rowGap: space.sm },
  tableBox: { position: 'relative' },
  table: { position: 'absolute', borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tableNum: { fontWeight: '700', fontSize: 15, lineHeight: 18 },
  tableFree: { fontSize: 10, lineHeight: 12 },
  pressed: { opacity: 0.8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  key: { width: 16, height: 16, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
