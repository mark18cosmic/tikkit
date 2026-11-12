import { Tag } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { Field } from './Field';
import { resaleCap } from '@/data/money';
import type { Ticket } from '@/data/tickets';
import { confirm } from '@/lib/confirm';
import { formatMoney, type Currency } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { cancelResale, fetchMyListing, listResale } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// Sell a ticket you can't use, through Tikkit only, at most 10% over face value.
export function ResalePanel({ ticket, facePrice, currency }: { ticket: Ticket; facePrice: number; currency: Currency }) {
  const colors = useColors();
  const { paymentConfig: cfg, refreshTickets } = useAppStore();
  const load = useCallback(() => fetchMyListing(ticket.id), [ticket.id]);
  const { data: listing, reload } = useRemote(load);
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(String(facePrice / 100));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!cfg || facePrice === 0 || !cfg.card) return null;
  const cap = resaleCap(cfg, facePrice);
  const laari = Math.round(Number(price.replace(',', '.')) * 100);
  const valid = Number.isFinite(laari) && laari >= 100 && laari <= cap;
  const net = valid ? laari - Math.round((laari * cfg.resaleFeeBps) / 10000) : 0;

  const submit = async () => {
    setFailure(null);
    setBusy(true);
    try {
      await listResale(ticket.code, laari);
      successFeedback();
      setOpen(false);
      await Promise.all([reload(), refreshTickets()]);
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const takeDown = () =>
    listing &&
    confirm('Take it off resale?', 'Your ticket works again straight away.', 'Take off resale', async () => {
      try {
        await cancelResale(listing.id);
        await Promise.all([reload(), refreshTickets()]);
      } catch (e) {
        setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      }
    });

  if (listing) {
    return (
      <View style={[styles.box, { backgroundColor: colors.surface }]}>
        <View style={styles.row}>
          <Tag size={22} color={colors.accent} weight="fill" />
          <View style={styles.fill}>
            <AppText variant="headline">{listing.status === 'reserved' ? 'Someone is buying it now' : `On resale for ${formatMoney(listing.price, currency)}`}</AppText>
            <AppText variant="subhead" muted>
              {listing.status === 'reserved'
                ? 'If they don’t finish paying in 20 minutes, it goes back on sale.'
                : 'This ticket can’t be used or sent while it’s listed. When it sells, the money goes to your wallet.'}
            </AppText>
          </View>
        </View>
        {listing.status === 'active' && <Button label="Take off resale" variant="secondary" onPress={takeDown} />}
        {failure && (
          <AppText variant="footnote" color={colors.danger}>
            {failure}
          </AppText>
        )}
      </View>
    );
  }

  if (!open) return <Button label="Sell on resale" icon={Tag} variant="secondary" onPress={() => setOpen(true)} />;

  return (
    <View style={[styles.box, { backgroundColor: colors.surface }]}>
      <AppText variant="headline">Sell this ticket</AppText>
      <AppText variant="subhead" muted>
        Buyers pay Tikkit, so there’s no chasing transfers. People on the waitlist hear about it first.
      </AppText>
      <Field
        label={`Price (${currency})`}
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        helper={`Up to ${formatMoney(cap, currency)}. You paid ${formatMoney(facePrice, currency)}.`}
        error={price && !valid ? `Choose between ${currency} 1 and ${formatMoney(cap, currency)}.` : undefined}
      />
      {valid && (
        <AppText variant="subhead">
          You get <AppText variant="subhead" style={styles.bold}>{formatMoney(net, currency)}</AppText> after the {cfg.resaleFeeBps / 100}% resale fee, available after the event.
        </AppText>
      )}
      <View style={styles.row}>
        <Button label="Cancel" variant="plain" onPress={() => setOpen(false)} />
        <Button label="List ticket" loading={busy} disabled={!valid} onPress={submit} style={styles.fill} />
      </View>
      {failure && (
        <AppText variant="footnote" color={colors.danger} accessibilityLiveRegion="polite">
          {failure}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: space.md, borderRadius: radius.card, gap: space.sm + 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4 },
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
});
