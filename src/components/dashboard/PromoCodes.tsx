import { Ticket } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { Field } from '../Field';
import type { Promo } from '@/data/community';
import { createPromo, fetchPromos, setPromoActive } from '@/lib/api';
import { errorFeedback, successFeedback, tapFeedback } from '@/lib/haptics';
import { useRemote } from '@/lib/useRemote';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

const presets = [10, 25, 50, 100];

// Discount codes for early birds, partners and guest lists. A 100% code lets
// someone in free, which works before card payments exist.
export function PromoCodes({ eventId }: { eventId: string }) {
  const colors = useColors();
  const load = useCallback(() => fetchPromos(eventId), [eventId]);
  const { data, reload } = useRemote(load);
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState(100);
  const [uses, setUses] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const cleanCode = code.toUpperCase().replace(/\s+/g, '');
  const codeError = cleanCode && !/^[A-Z0-9]{4,20}$/.test(cleanCode) ? '4 to 20 letters or numbers.' : undefined;
  const usesError = uses && !/^[1-9]\d{0,4}$/.test(uses) ? 'A number, or leave empty for no limit.' : undefined;

  const add = async () => {
    setNote(null);
    if (!cleanCode || codeError || usesError) return errorFeedback();
    setBusy(true);
    try {
      await createPromo(eventId, cleanCode, percent, uses ? Number(uses) : undefined);
      successFeedback();
      setCode('');
      setUses('');
      await reload();
    } catch (e) {
      errorFeedback();
      setNote(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (p: Promo) => {
    tapFeedback();
    try {
      await setPromoActive(p.id, !p.active);
      await reload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    }
  };

  return (
    <View style={styles.section}>
      <AppText variant="title3" accessibilityRole="header">
        Promo codes
      </AppText>
      {data && data.length > 0 && (
        <View style={[styles.list, { backgroundColor: colors.surface }]}>
          {data.map((p, i) => (
            <View key={p.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
              <Ticket size={20} color={p.active ? colors.accent : colors.textMuted} />
              <View style={styles.fill}>
                <AppText variant="headline" style={styles.mono}>
                  {p.code}
                </AppText>
                <AppText variant="footnote" muted>
                  {p.percentOff === 100 ? 'Free entry' : `${p.percentOff}% off`}, used {p.used}
                  {p.maxUses ? ` of ${p.maxUses}` : ''}
                  {p.active ? '' : ', turned off'}
                </AppText>
              </View>
              <Switch
                value={p.active}
                onValueChange={() => toggle(p)}
                trackColor={{ true: colors.accent, false: colors.border }}
                accessibilityLabel={`Code ${p.code} on`}
              />
            </View>
          ))}
        </View>
      )}

      <View style={[styles.form, { borderColor: colors.border }]}>
        <Field
          label="New code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
          placeholder="GUESTLIST"
          error={codeError}
        />
        <View style={styles.block}>
          <AppText variant="subhead" style={styles.bold}>
            Discount
          </AppText>
          <View style={styles.chips}>
            {presets.map((n) => (
              <Chip key={n} label={n === 100 ? 'Free' : `${n}%`} selected={percent === n} onPress={() => setPercent(n)} />
            ))}
          </View>
        </View>
        <Field
          label="Uses (optional)"
          value={uses}
          onChangeText={setUses}
          keyboardType="number-pad"
          placeholder="No limit"
          helper="How many orders can use it."
          error={usesError}
        />
        <Button label="Add code" variant="secondary" loading={busy} disabled={!cleanCode} onPress={add} />
        {note && (
          <AppText variant="subhead" color={colors.danger}>
            {note}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  mono: { letterSpacing: 1 },
  section: { gap: space.sm + 4 },
  list: { borderRadius: radius.control, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  form: { gap: space.md, padding: space.md, borderRadius: radius.control, borderWidth: StyleSheet.hairlineWidth },
  block: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
