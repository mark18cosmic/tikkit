import { router } from 'expo-router';
import { Crown, Info } from '@/components/icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Chip } from '../Chip';
import type { EventItem } from '@/data/events';
import { fixedFee, percent, type EventSales } from '@/data/money';
import { formatAmount, type Currency } from '@/lib/format';
import { errorFeedback, tapFeedback } from '@/lib/haptics';
import { setFeeMode } from '@/lib/market';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// Where the money from this event goes, who pays the booking fee, and (Pro)
// tickets sold per day.
export function Sales({ event, sales, onChange }: { event: EventItem; sales: EventSales; onChange: () => void }) {
  const colors = useColors();
  const { paymentConfig: cfg, loadEvent } = useAppStore();
  const [mode, setMode] = useState(event.feeMode);
  const money = (n: number) => formatAmount(n, event.currency);
  const choose = async (m: 'pass' | 'absorb') => {
    const prev = mode;
    setMode(m);
    try {
      await setFeeMode(event.id, m);
      await loadEvent(event.id);
      onChange();
    } catch {
      errorFeedback();
      setMode(prev);
    }
  };
  return (
    <View style={styles.section}>
      <AppText variant="title3" accessibilityRole="header">
        Money
      </AppText>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Line label="Paid by buyers" value={money(sales.gross)} />
        <Line label="Tikkit fees" value={`−${money(sales.fees)}`} muted />
        {sales.promoters.some((p) => p.commission > 0) && (
          <Line label="Promoter commission" value={`−${money(sales.promoters.reduce((s, p) => s + p.commission, 0))}`} muted />
        )}
        <View style={[styles.rule, { borderColor: colors.border }]} />
        <Line label="Yours" value={money(sales.net)} strong />
        {sales.refunded > 0 && <Line label="Refunded" value={money(sales.refunded)} muted />}
        {sales.pending > 0 && (
          <AppText variant="footnote" muted>
            {sales.pending} {sales.pending === 1 ? 'checkout is' : 'checkouts are'} waiting for payment.
          </AppText>
        )}
        <Pressable accessibilityRole="link" onPress={() => router.push('/wallet')}>
          <AppText variant="subhead" color={colors.accent} style={styles.bold}>
            Open wallet
          </AppText>
        </Pressable>
      </View>

      <AppText variant="headline">Who pays the booking fee?</AppText>
      <View style={styles.chips} accessibilityRole="radiogroup">
        <Chip label="Buyers, on top" selected={mode === 'pass'} onPress={() => choose('pass')} />
        <Chip label="I include it" selected={mode === 'absorb'} onPress={() => choose('absorb')} />
      </View>
      {cfg && (
        <View style={styles.hint}>
          <Info size={16} color={colors.textMuted} />
          <AppText variant="footnote" muted style={styles.fill}>
            {percent(cfg.ticketFeeBps)} plus {money(fixedFee(cfg, event.currency))} per paid ticket ({percent(cfg.proTicketFeeBps)} on Pro), never more than{' '}
            {percent(cfg.feeCapBps)} of the price. Free tickets have no fee.
          </AppText>
        </View>
      )}

      {sales.byDay ? (
        <DailyChart days={sales.byDay} currency={event.currency} />
      ) : (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/pro')}
          style={({ pressed }) => [styles.upsell, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
        >
          <Crown size={20} color={colors.accent} weight="fill" />
          <AppText variant="subhead" style={styles.fill}>
            See sales day by day, and pay a lower fee, with Organiser Pro.
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

function Line({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <AppText variant={strong ? 'headline' : 'subhead'} muted={muted} style={styles.fill}>
        {label}
      </AppText>
      <AppText variant={strong ? 'headline' : 'subhead'} muted={muted} style={styles.tabular}>
        {value}
      </AppText>
    </View>
  );
}

const CHART_H = 96;

// Tickets per day: one series, so no legend; the title names it. Only the
// best day is labelled; tap any bar for its numbers. The list underneath is
// the same data as text.
function DailyChart({ days, currency }: { days: { day: string; tickets: number; net: number }[]; currency: Currency }) {
  const colors = useColors();
  const [picked, setPicked] = useState<number | null>(null);
  if (days.length === 0) return null;
  const recent = days.slice(-21);
  const max = Math.max(1, ...recent.map((d) => d.tickets));
  const best = recent.findIndex((d) => d.tickets === max);
  const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const shown = picked ?? best;
  return (
    <View style={styles.chartWrap}>
      <AppText variant="headline">Tickets sold per day</AppText>
      <AppText variant="subhead" muted accessibilityLiveRegion="polite">
        {label(recent[shown].day)}: {recent[shown].tickets} {recent[shown].tickets === 1 ? 'ticket' : 'tickets'}, {formatAmount(recent[shown].net, currency)}
      </AppText>
      <View style={[styles.chart, { borderColor: colors.border }]}>
        {recent.map((d, i) => (
          <Pressable
            key={d.day}
            accessibilityRole="button"
            accessibilityLabel={`${label(d.day)}, ${d.tickets} tickets`}
            onPress={() => {
              tapFeedback();
              setPicked(i);
            }}
            style={styles.barHit}
          >
            <View
              style={[
                styles.bar,
                {
                  height: Math.max(2, (d.tickets / max) * CHART_H),
                  backgroundColor: colors.accent,
                  opacity: picked === null || picked === i ? 1 : 0.45,
                },
              ]}
            />
          </Pressable>
        ))}
      </View>
      <View style={styles.axis}>
        <AppText variant="caption" muted>
          {label(recent[0].day)}
        </AppText>
        <AppText variant="caption" muted>
          {label(recent[recent.length - 1].day)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm + 4 },
  card: { padding: space.md, borderRadius: radius.card, gap: space.xs + 2 },
  line: { flexDirection: 'row', gap: space.md },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: space.xs },
  fill: { flex: 1 },
  bold: { fontWeight: '600', marginTop: space.xs },
  tabular: { fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', gap: space.sm },
  hint: { flexDirection: 'row', gap: space.sm },
  upsell: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, padding: space.md, borderRadius: radius.control, borderWidth: StyleSheet.hairlineWidth },
  chartWrap: { gap: space.xs },
  chart: { height: CHART_H + 4, flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: space.sm },
  barHit: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
});
