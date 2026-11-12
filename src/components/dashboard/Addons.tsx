import { Boat, Package, Trash, UsersThree } from '@/components/icons';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { Field } from '../Field';
import { IconButton } from '../IconButton';
import type { Addon } from '@/data/money';
import { formatMoney, formatTime, mvDateInput, parseMv, type Currency } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { fetchAddons, fetchManifest, saveAddons, type AddonDraft } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// Speedboats and extras sold with tickets, plus who's on which boat.
export function Addons({ eventId, startsAt, editable, currency }: { eventId: string; startsAt: string; editable: boolean; currency: Currency }) {
  const colors = useColors();
  const load = useCallback(async () => {
    const [list, manifest] = await Promise.all([fetchAddons(eventId), fetchManifest(eventId).catch(() => [])]);
    return { list, manifest };
  }, [eventId]);
  const { data, reload } = useRemote(load);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<Addon['kind']>('transfer');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [capacity, setCapacity] = useState('');
  const [departs, setDeparts] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [showList, setShowList] = useState<string | null>(null);

  const list = data?.list ?? [];
  const toDraft = (a: Addon): AddonDraft => ({ id: a.id, kind: a.kind, name: a.name, description: a.description, price: a.price, capacity: a.capacity, departsAt: a.departsAt });

  const save = async (next: AddonDraft[]) => {
    setFailure(null);
    setBusy(true);
    try {
      await saveAddons(eventId, next);
      successFeedback();
      await reload();
      return true;
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const p = Math.round(Number(price.replace(',', '.')) * 100);
    const c = Number(capacity);
    if (name.trim().length < 2 || !Number.isFinite(p) || p < 0 || !Number.isInteger(c) || c < 1) {
      setFailure('Add a name, a price (0 for free) and how many seats or items.');
      return errorFeedback();
    }
    // "14:30" on the event's day, as Maldives time.
    let departsAt: string | undefined;
    const m = /^(\d{1,2}):(\d{2})$/.exec(departs.trim());
    if (kind === 'transfer' && m) {
      const at = parseMv(mvDateInput(startsAt).date, `${m[1].padStart(2, '0')}:${m[2]}`);
      if (!Number.isNaN(at.getTime())) departsAt = at.toISOString();
    }
    const ok = await save([...list.map(toDraft), { kind, name: name.trim(), description: '', price: p, capacity: c, departsAt }]);
    if (ok) {
      setAdding(false);
      setName('');
      setPrice('');
      setCapacity('');
      setDeparts('');
    }
  };

  return (
    <View style={styles.section}>
      <AppText variant="title3" accessibilityRole="header">
        Transfers and extras
      </AppText>
      <AppText variant="subhead" muted>
        Sell speedboat seats, parking or merch with tickets. You get the full price, less the booking fee.
      </AppText>
      {list.map((a) => {
        const riders = data?.manifest.filter((x) => x.addonId === a.id) ?? [];
        return (
          <View key={a.id} style={[styles.item, { backgroundColor: colors.surface }]}>
            <View style={styles.row}>
              {a.kind === 'transfer' ? <Boat size={22} color={colors.text} /> : <Package size={22} color={colors.text} />}
              <View style={styles.fill}>
                <AppText variant="headline">{a.name}</AppText>
                <AppText variant="subhead" muted>
                  {formatMoney(a.price, currency)}, {a.sold} of {a.capacity} sold{a.departsAt ? `, leaves ${formatTime(a.departsAt)}` : ''}
                </AppText>
              </View>
              {editable && a.sold === 0 && (
                <IconButton icon={Trash} accessibilityLabel={`Remove ${a.name}`} onPress={() => save(list.filter((x) => x.id !== a.id).map(toDraft))} />
              )}
            </View>
            {riders.length > 0 && (
              <Button
                label={showList === a.id ? 'Hide list' : `${a.kind === 'transfer' ? 'Passenger' : 'Buyer'} list (${riders.reduce((s, r) => s + r.quantity, 0)})`}
                icon={UsersThree}
                variant="plain"
                onPress={() => setShowList(showList === a.id ? null : a.id)}
                style={styles.left}
              />
            )}
            {showList === a.id &&
              riders.map((r, i) => (
                <AppText key={`${r.holderName}-${i}`} variant="subhead">
                  {r.holderName}
                  {r.quantity > 1 ? ` × ${r.quantity}` : ''}
                </AppText>
              ))}
          </View>
        );
      })}
      {editable &&
        (adding ? (
          <View style={styles.form}>
            <View style={styles.chips}>
              <Chip label="Boat transfer" selected={kind === 'transfer'} onPress={() => setKind('transfer')} />
              <Chip label="Other extra" selected={kind === 'extra'} onPress={() => setKind('extra')} />
            </View>
            <Field label="Name" value={name} onChangeText={setName} placeholder={kind === 'transfer' ? 'Speedboat from Malé, Jetty 1' : 'Festival T-shirt'} />
            <View style={styles.row}>
              <View style={styles.fill}>
                <Field label={`Price (${currency})`} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
              </View>
              <View style={styles.fill}>
                <Field label={kind === 'transfer' ? 'Seats' : 'How many'} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" />
              </View>
            </View>
            {kind === 'transfer' && (
              <Field label="Leaves at (optional)" value={departs} onChangeText={setDeparts} placeholder="14:30" keyboardType="numbers-and-punctuation" helper="Maldives time, on the day of the event" />
            )}
            <View style={styles.row}>
              <Button label="Cancel" variant="plain" onPress={() => setAdding(false)} />
              <Button label="Add" loading={busy} onPress={add} style={styles.fill} />
            </View>
          </View>
        ) : (
          <Button label="Add a transfer or extra" icon={Boat} variant="secondary" onPress={() => setAdding(true)} />
        ))}
      {failure && (
        <AppText variant="footnote" color={colors.danger}>
          {failure}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm + 4 },
  item: { padding: space.md, borderRadius: radius.control, gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  fill: { flex: 1 },
  left: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  form: { gap: space.md },
  chips: { flexDirection: 'row', gap: space.sm },
});
