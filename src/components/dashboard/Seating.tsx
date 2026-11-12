import { Armchair, LockSimple, Plus, Trash } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { Field } from '../Field';
import { IconButton } from '../IconButton';
import { SeatPicker } from '../SeatPicker';
import type { EventItem, Tier } from '@/data/events';
import { confirm } from '@/lib/confirm';
import { toast } from '@/lib/dialog';
import { errorFeedback, successFeedback, tapFeedback } from '@/lib/haptics';
import { clearSeating, fetchSeatMap, saveSeating, setSeatsHeld, type SectionDraft } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

type Layout = 'rows' | 'tables';
// `groups` is rows or tables; `per` is seats per row or per table.
type Draft = { key: string; section: string; layout: Layout; groups: string; per: string };

const templates: { label: string; detail: string; sections: Omit<Draft, 'key'>[] }[] = [
  { label: 'Theatre', detail: 'Rows facing a stage', sections: [{ section: 'Stalls', layout: 'rows', groups: '8', per: '14' }] },
  { label: 'Gala dinner', detail: 'Round tables of 8', sections: [{ section: 'Ballroom', layout: 'tables', groups: '12', per: '8' }] },
  { label: 'Cabaret', detail: 'Small tables of 4', sections: [{ section: 'Floor', layout: 'tables', groups: '15', per: '4' }] },
  {
    label: 'Stage and VIP',
    detail: 'VIP tables, rows behind',
    sections: [
      { section: 'VIP', layout: 'tables', groups: '4', per: '6' },
      { section: 'Stalls', layout: 'rows', groups: '6', per: '12' },
    ],
  },
];

const limits = { rows: { groups: [1, 26], per: [1, 60] }, tables: { groups: [1, 200], per: [2, 20] } } as const;

// Seat maps for halls, stands and dinners. A ticket type becomes seated once it
// has a layout, and its capacity becomes the number of seats. The layout can
// change only before it sells; seats can be held back at any time.
export function Seating({ event }: { event: EventItem }) {
  const colors = useColors();
  const [editing, setEditing] = useState<string | null>(null);
  const [holding, setHolding] = useState<string | null>(null);
  return (
    <View style={styles.section}>
      <AppText variant="title3" accessibilityRole="header">
        Seating
      </AppText>
      <AppText variant="subhead" muted>
        Rows for halls and stands, round tables for dinners and weddings. Buyers pick their seat on a map, or a whole table, and the seat is printed on
        their ticket.
      </AppText>
      {event.tiers.map((t) =>
        editing === t.id ? (
          <Builder key={t.id} event={event} tier={t} onDone={() => setEditing(null)} />
        ) : holding === t.id ? (
          <HoldSeats key={t.id} event={event} tier={t} onDone={() => setHolding(null)} />
        ) : (
          <View key={t.id} style={[styles.item, { backgroundColor: colors.surface }]}>
            <View style={styles.itemTop}>
              <Armchair size={22} color={t.seated ? colors.accent : colors.textMuted} weight={t.seated ? 'fill' : 'regular'} />
              <View style={styles.fill}>
                <AppText variant="headline">{t.name}</AppText>
                <AppText variant="subhead" muted>
                  {t.seated ? `${t.capacity} seats for sale on a map` : 'General admission, no seats'}
                </AppText>
              </View>
            </View>
            {(t.seated || t.sold === 0) && (
              <View style={styles.itemActions}>
                {t.sold === 0 && (
                  <Button label={t.seated ? 'Change layout' : 'Add seats'} variant="secondary" onPress={() => setEditing(t.id)} style={[styles.fill, { backgroundColor: colors.background }]} />
                )}
                {t.seated && <Button label="Hold seats" icon={LockSimple} variant="secondary" onPress={() => setHolding(t.id)} style={[styles.fill, { backgroundColor: colors.background }]} />}
              </View>
            )}
          </View>
        ),
      )}
    </View>
  );
}

function Builder({ event, tier, onDone }: { event: EventItem; tier: Tier; onDone: () => void }) {
  const colors = useColors();
  const { loadEvent } = useAppStore();
  const [sections, setSections] = useState<Draft[]>([{ key: 's1', ...templates[0].sections[0] }]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const parsed = sections.map((s) => ({ ...s, n: Number(s.groups), each: Number(s.per) }));
  const problem = (s: (typeof parsed)[number]) => {
    const l = limits[s.layout];
    if (!s.section.trim()) return 'Name the section.';
    if (!Number.isInteger(s.n) || s.n < l.groups[0] || s.n > l.groups[1])
      return s.layout === 'rows' ? 'Rows: 1 to 26.' : 'Tables: 1 to 200.';
    if (!Number.isInteger(s.each) || s.each < l.per[0] || s.each > l.per[1])
      return s.layout === 'rows' ? 'Seats per row: 1 to 60.' : 'Seats per table: 2 to 20.';
    return null;
  };
  const valid = parsed.every((s) => !problem(s));
  const total = valid ? parsed.reduce((n, s) => n + s.n * s.each, 0) : 0;
  const update = (key: string, patch: Partial<Draft>) => setSections((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const applyTemplate = (t: (typeof templates)[number]) => {
    tapFeedback();
    setSections(t.sections.map((s, i) => ({ key: `t${Date.now()}${i}`, ...s })));
  };

  const save = async () => {
    setFailure(null);
    if (!valid || total > 2000) return errorFeedback();
    setBusy(true);
    try {
      const payload: SectionDraft[] = parsed.map((s) =>
        s.layout === 'tables'
          ? { section: s.section.trim(), layout: 'tables', tables: s.n, seatsPerTable: s.each }
          : { section: s.section.trim(), layout: 'rows', rows: s.n, seatsPerRow: s.each },
      );
      await saveSeating(event.id, tier.id, payload);
      await loadEvent(event.id);
      successFeedback();
      toast(`${total} seats saved for ${tier.name}`);
      onDone();
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const remove = () =>
    confirm('Remove the seat map?', `${tier.name} goes back to general admission.`, 'Remove seats', async () => {
      try {
        await clearSeating(event.id, tier.id);
        await loadEvent(event.id);
        toast('Seat map removed');
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Couldn’t remove the seats. Try again.');
      }
    });

  return (
    <View style={[styles.builder, { borderColor: colors.accent }]}>
      <AppText variant="headline">Seats for {tier.name}</AppText>
      <View style={styles.templates}>
        {templates.map((t) => (
          <Pressable
            key={t.label}
            accessibilityRole="button"
            accessibilityLabel={`${t.label}: ${t.detail}`}
            onPress={() => applyTemplate(t)}
            style={({ pressed }) => [styles.template, { backgroundColor: colors.surface }, pressed && styles.pressed]}
          >
            <AppText variant="subhead" style={styles.bold}>
              {t.label}
            </AppText>
            <AppText variant="caption" muted>
              {t.detail}
            </AppText>
          </Pressable>
        ))}
      </View>

      {sections.map((s, i) => {
        const p = problem(parsed[i]);
        return (
          <View key={s.key} style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
            <View style={styles.sectionRow}>
              <View style={styles.fill}>
                <Field label="Section" value={s.section} onChangeText={(t) => update(s.key, { section: t })} placeholder="Balcony" maxLength={30} />
              </View>
              {sections.length > 1 && (
                <IconButton icon={Trash} accessibilityLabel={`Remove ${s.section || 'section'}`} onPress={() => setSections((list) => list.filter((x) => x.key !== s.key))} />
              )}
            </View>
            <View style={[styles.segment, { backgroundColor: colors.background }]} accessibilityRole="radiogroup">
              {(['rows', 'tables'] as const).map((l) => (
                <Pressable
                  key={l}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: s.layout === l }}
                  onPress={() => update(s.key, l === 'tables' ? { layout: l, groups: '10', per: '8' } : { layout: l, groups: '6', per: '12' })}
                  style={[styles.segmentItem, s.layout === l && { backgroundColor: colors.elevated }]}
                >
                  <AppText variant="subhead" style={styles.bold}>
                    {l === 'rows' ? 'Rows' : 'Round tables'}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <View style={styles.sectionRow}>
              <View style={styles.fill}>
                <Field label={s.layout === 'rows' ? 'Rows' : 'Tables'} value={s.groups} onChangeText={(t) => update(s.key, { groups: t })} keyboardType="number-pad" />
              </View>
              <View style={styles.fill}>
                <Field label={s.layout === 'rows' ? 'Seats per row' : 'Seats per table'} value={s.per} onChangeText={(t) => update(s.key, { per: t })} keyboardType="number-pad" />
              </View>
            </View>
            {p && (
              <AppText variant="footnote" color={colors.danger}>
                {p}
              </AppText>
            )}
          </View>
        );
      })}
      {sections.length < 8 && (
        <Button
          label="Add a section"
          icon={Plus}
          variant="plain"
          onPress={() => setSections((list) => [...list, { key: `s${Date.now()}`, section: '', layout: 'rows', groups: '4', per: '10' }])}
          style={styles.left}
        />
      )}
      <AppText variant="subhead" muted>
        {valid
          ? total > 2000
            ? `${total} seats. The most one ticket type can have is 2,000.`
            : `${total} seats. Rows are lettered A, B, C from the front; tables are numbered across the room.`
          : 'Fix the sections marked in red.'}
      </AppText>
      {failure && (
        <AppText variant="footnote" color={colors.danger}>
          {failure}
        </AppText>
      )}
      <View style={styles.actions}>
        <Button label="Cancel" variant="plain" onPress={onDone} />
        {tier.seated && <Button label="Remove" variant="secondary" onPress={remove} />}
        <Button label="Save seats" loading={busy} disabled={!valid || total > 2000} onPress={save} style={styles.fill} />
      </View>
    </View>
  );
}

// Keep seats back from sale: sponsors, wheelchair spaces, the band's family.
function HoldSeats({ event, tier, onDone }: { event: EventItem; tier: Tier; onDone: () => void }) {
  const colors = useColors();
  const { loadEvent } = useAppStore();
  const load = useCallback(async () => (await fetchSeatMap(event.id)).filter((s) => s.tierId === tier.id), [event.id, tier.id]);
  const { data, reload } = useRemote(load);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const toHold = picked.filter((id) => data.find((s) => s.id === id)?.free);
  const toRelease = picked.filter((id) => data.find((s) => s.id === id)?.held);
  const heldNow = data.filter((s) => s.held).length;

  const apply = async () => {
    setBusy(true);
    try {
      if (toHold.length) await setSeatsHeld(event.id, toHold, true);
      if (toRelease.length) await setSeatsHeld(event.id, toRelease, false);
      await loadEvent(event.id);
      setPicked([]);
      reload();
      successFeedback();
      toast([toHold.length && `${toHold.length} held`, toRelease.length && `${toRelease.length} back on sale`].filter(Boolean).join(', '));
    } catch (e) {
      errorFeedback();
      toast.error(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.builder, { borderColor: colors.accent }]}>
      <AppText variant="headline">Hold seats for {tier.name}</AppText>
      <AppText variant="subhead" muted>
        Tap seats to keep them back from sale, for sponsors, wheelchair spaces or guests. Tap held seats to put them back on sale.
        {heldNow > 0 ? ` ${heldNow} held now.` : ''}
      </AppText>
      <SeatPicker seats={data} tiers={event.tiers} currency={event.currency} selected={picked} onChange={setPicked} max={500} mode="hold" />
      <View style={styles.actions}>
        <Button label="Done" variant="plain" onPress={onDone} />
        <Button
          label={
            toHold.length || toRelease.length
              ? [toHold.length && `Hold ${toHold.length}`, toRelease.length && `Release ${toRelease.length}`].filter(Boolean).join(', ')
              : 'Pick seats'
          }
          loading={busy}
          disabled={!toHold.length && !toRelease.length}
          onPress={apply}
          style={styles.fill}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm + 4 },
  item: { gap: space.sm + 4, padding: space.md, borderRadius: radius.control },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  itemActions: { flexDirection: 'row', gap: space.sm },
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  builder: { gap: space.sm + 4, padding: space.md, borderRadius: radius.card, borderWidth: 1.5 },
  templates: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  template: { flexGrow: 1, flexBasis: '45%', padding: space.sm + 4, borderRadius: radius.control, gap: 2 },
  sectionCard: { padding: space.sm + 4, borderRadius: radius.control, gap: space.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  segment: { flexDirection: 'row', borderRadius: radius.control, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 36, borderRadius: radius.control - 3 },
  left: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  actions: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  pressed: { opacity: 0.8 },
});
