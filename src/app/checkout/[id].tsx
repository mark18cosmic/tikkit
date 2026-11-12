import { router, useLocalSearchParams } from 'expo-router';
import { Boat, Crown, Gift, Package, ShieldCheck, Ticket } from '@/components/icons';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { Field } from '@/components/Field';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { SignInRequired } from '@/components/SignInRequired';
import { SeatPicker } from '@/components/SeatPicker';
import { Stepper } from '@/components/Stepper';
import { inPresale } from '@/data/events';
import { ticketFee, type Addon } from '@/data/money';
import { checkPromo } from '@/lib/api';
import { isEmail, useAuth } from '@/lib/auth';
import { formatMoney, formatTime, formatWhen, type Currency } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { fetchAddons, fetchOrder, fetchOrganizerTrust, fetchSeatMap } from '@/lib/market';
import { useLayout } from '@/lib/useLayout';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

const MAX_PER_ORDER = 8;

export default function CheckoutScreen() {
  return (
    <SignInRequired title="Sign in to get tickets" body="Tickets are saved to your account, so they’re on every phone you sign in to.">
      <Checkout />
    </SignInRequired>
  );
}

function Checkout() {
  const { id, ref } = useLocalSearchParams<{ id: string; ref?: string }>();
  const { getEvent, remaining, purchase, paymentConfig: cfg, memberOf } = useAppStore();
  const { email, displayName, userId } = useAuth();
  const event = getEvent(id);
  const colors = useColors();
  const { isDesktop } = useLayout();
  const loadAddons = useCallback(() => fetchAddons(id), [id]);
  const addons = useRemote(loadAddons).data ?? [];
  const hasSeats = !!event?.tiers.some((t) => t.seated);
  const loadSeats = useCallback(() => (hasSeats ? fetchSeatMap(id) : Promise.resolve([])), [id, hasSeats]);
  const seatMap = useRemote(loadSeats);
  const [seatSel, setSeatSel] = useState<string[]>([]);
  // Members get their organiser's standing discount (when there's no promo code).
  const memberOrg = event?.organizerId && memberOf[event.organizerId] ? event.organizerId : null;
  const loadTrust = useCallback(() => (memberOrg ? fetchOrganizerTrust(memberOrg) : Promise.resolve(null)), [memberOrg]);
  const memberPct = useRemote(loadTrust).data?.membership?.discountPct ?? 0;

  const [qty, setQty] = useState<Record<string, number>>(() => {
    const first = event?.tiers.find((t) => !t.seated && remaining(event.id, t.id) > 0);
    return first ? { [first.id]: 1 } : {};
  });
  const [extras, setExtras] = useState<Record<string, number>>({});
  // Null until edited, so it can follow the profile name as that loads.
  const [nameInput, setName] = useState<string | null>(null);
  const name = nameInput ?? displayName;
  const [gift, setGift] = useState(false);
  const [giftName, setGiftName] = useState('');
  const [giftEmail, setGiftEmail] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [paying, setPaying] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<{ code: string; percentOff: number } | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoNote, setPromoNote] = useState<string | null>(null);

  if (!event) return null;

  // Seated types count the seats picked; others count the steppers.
  const seatsByTier: Record<string, number> = {};
  for (const sid of seatSel) {
    const seat = seatMap.data?.find((x) => x.id === sid);
    if (seat) seatsByTier[seat.tierId] = (seatsByTier[seat.tierId] ?? 0) + 1;
  }
  const qtyFor = (tierId: string) => (event.tiers.find((t) => t.id === tierId)?.seated ? seatsByTier[tierId] ?? 0 : qty[tierId] ?? 0);
  const count = event.tiers.reduce((n, t) => n + qtyFor(t.id), 0);
  const paidTickets = event.tiers.reduce((n, t) => n + (t.price > 0 ? qtyFor(t.id) : 0), 0);
  const subtotal = event.tiers.reduce((sum, t) => sum + qtyFor(t.id) * t.price, 0);
  const presaleLocked = inPresale(event) && !!event.organizerId && !memberOf[event.organizerId] && event.ownerId !== userId;
  // Same rounding as the server.
  const discount = promo ? Math.round((subtotal * promo.percentOff) / 100) : Math.round((subtotal * memberPct) / 100);
  const extrasTotal = addons.reduce((sum, a) => sum + (extras[a.id] ?? 0) * a.price, 0);
  const base = subtotal - discount + extrasTotal;
  const fee = cfg ? ticketFee(cfg, base, paidTickets, event.currency) : 0;
  const passFee = event.feeMode === 'pass' && fee > 0;
  const total = base + (passFee ? fee : 0);

  const applyPromo = async () => {
    setPromoNote(null);
    if (!promoInput.trim()) return;
    setPromoBusy(true);
    try {
      const found = await checkPromo(event.id, promoInput);
      if (found) {
        successFeedback();
        setPromo(found);
        setPromoInput('');
      } else {
        errorFeedback();
        setPromoNote('That code doesn’t work for this event, or it’s been used up.');
      }
    } catch (e) {
      errorFeedback();
      setPromoNote(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setPromoBusy(false);
    }
  };

  const errors = {
    tickets: count === 0 ? (hasSeats ? 'Pick at least one seat or ticket.' : 'Choose at least one ticket.') : undefined,
    name: name.trim().length < 2 ? 'Enter your name.' : undefined,
    giftName: gift && giftName.trim().length < 2 ? 'Enter your friend’s name.' : undefined,
    giftEmail: gift && !isEmail(giftEmail) ? 'Enter your friend’s email.' : gift && giftEmail.trim().toLowerCase() === email?.toLowerCase() ? 'That’s your own email.' : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);
  const payLabel = total === 0 && count > 0 ? (gift ? 'Send tickets' : 'Reserve') : 'Continue to payment';

  const pay = async () => {
    setShowErrors(true);
    setFailure(null);
    if (!valid) {
      errorFeedback();
      return;
    }
    setPaying(true);
    try {
      const orderId = await purchase({
        eventId: event.id,
        holderName: name.trim(),
        promo: promo?.code,
        lines: Object.entries(qty)
          .filter(([tierId, n]) => n > 0 && !event.tiers.find((t) => t.id === tierId)?.seated)
          .map(([tierId, quantity]) => ({ tierId, quantity })),
        seats: seatSel,
        addons: Object.entries(extras)
          .filter(([, n]) => n > 0)
          .map(([addonId, quantity]) => ({ addonId, quantity })),
        ref: ref || undefined,
        gift: gift ? { name: giftName.trim(), email: giftEmail.trim() } : undefined,
      });
      const order = await fetchOrder(orderId).catch(() => null);
      if (order?.payment_id && order.status === 'pending_payment') {
        router.replace({ pathname: '/pay/[id]', params: { id: order.payment_id } });
      } else {
        successFeedback();
        router.replace({ pathname: '/order/[id]', params: { id: orderId } });
      }
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setPaying(false);
    }
  };

  const tiers = (
    <View>
      <AppText variant="title3" accessibilityRole="header" style={styles.h}>
        Tickets
      </AppText>
      {event.tiers.map((t) => {
        const left = remaining(event.id, t.id);
        const max = Math.min(left, MAX_PER_ORDER - count + (qty[t.id] ?? 0));
        if (t.seated) {
          return (
            <View key={t.id} style={[styles.tier, { borderColor: colors.border }]}>
              <View style={styles.fill}>
                <AppText variant="headline">{t.name}</AppText>
                <AppText variant="subhead" muted>
                  {left === 0 ? 'Sold out' : `${formatMoney(t.price, event.currency)}, pick seats on the map`}
                </AppText>
              </View>
              <AppText variant="headline" style={styles.tabular}>
                {seatsByTier[t.id] ?? 0}
              </AppText>
            </View>
          );
        }
        return (
          <View key={t.id} style={[styles.tier, { borderColor: colors.border }]}>
            <View style={styles.fill}>
              <AppText variant="headline">{t.name}</AppText>
              <AppText variant="subhead" muted>
                {left === 0 ? 'Sold out' : `${formatMoney(t.price, event.currency)}, ${t.description.toLowerCase()}`}
              </AppText>
              {left > 0 && left <= 10 && (
                <AppText variant="footnote" color={colors.accent}>
                  Only {left} left
                </AppText>
              )}
            </View>
            {left > 0 && (
              <Stepper label={t.name} value={qty[t.id] ?? 0} max={max} onChange={(n) => setQty((q) => ({ ...q, [t.id]: n }))} />
            )}
          </View>
        );
      })}
      {showErrors && errors.tickets && (
        <AppText variant="footnote" color={colors.danger} style={styles.err}>
          {errors.tickets}
        </AppText>
      )}
      <AppText variant="footnote" muted style={styles.err}>
        Up to {MAX_PER_ORDER} tickets per order.
      </AppText>
    </View>
  );

  const seatSection = hasSeats && seatMap.data && seatMap.data.length > 0 && (
    <View>
      <AppText variant="title3" accessibilityRole="header" style={styles.h}>
        Pick your seats
      </AppText>
      <SeatPicker seats={seatMap.data} tiers={event.tiers} currency={event.currency} selected={seatSel} onChange={setSeatSel} max={MAX_PER_ORDER - (count - seatSel.length)} />
    </View>
  );

  const presaleBanner = presaleLocked && (
    <View style={[styles.presale, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
      <Crown size={22} color={colors.accent} weight="fill" />
      <View style={styles.fill}>
        <AppText variant="headline">Members-only presale</AppText>
        <AppText variant="subhead" muted>
          General sale opens {formatWhen(event.publicSaleAt!)}. Members can buy now.
        </AppText>
        {event.organizerSlug && (
          <Button
            label="See membership"
            variant="secondary"
            onPress={() => router.push({ pathname: '/organizer/[slug]', params: { slug: event.organizerSlug! } })}
            style={styles.presaleBtn}
          />
        )}
      </View>
    </View>
  );

  const extrasSection = addons.length > 0 && (
    <View>
      <AppText variant="title3" accessibilityRole="header" style={styles.h}>
        {addons.every((a) => a.kind === 'transfer') ? 'Getting there' : 'Add to your order'}
      </AppText>
      {addons.map((a) => (
        <AddonLine key={a.id} a={a} currency={event.currency} value={extras[a.id] ?? 0} onChange={(n) => setExtras((x) => ({ ...x, [a.id]: n }))} />
      ))}
    </View>
  );

  const details = (
    <View style={styles.gap}>
      <AppText variant="title3" accessibilityRole="header">
        Your details
      </AppText>
      <Field
        label={gift ? 'Your name' : 'Name on tickets'}
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        returnKeyType="done"
        helper={!gift && email ? `Tickets go to your account, ${email}.` : undefined}
        error={showErrors ? errors.name : undefined}
      />
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: gift }}
        onPress={() => setGift((g) => !g)}
        style={[styles.toggle, { backgroundColor: colors.surface }]}
      >
        <Gift size={22} color={colors.accent} weight={gift ? 'fill' : 'regular'} />
        <View style={styles.fill}>
          <AppText variant="headline">Send as a gift</AppText>
          <AppText variant="subhead" muted>
            Tickets go straight to a friend’s account.
          </AppText>
        </View>
        <Switch value={gift} onValueChange={setGift} trackColor={{ true: colors.accent }} thumbColor="#FFFFFF" accessibilityElementsHidden importantForAccessibility="no" />
      </Pressable>
      {gift && (
        <>
          <Field label="Friend’s name" value={giftName} onChangeText={setGiftName} autoCapitalize="words" error={showErrors ? errors.giftName : undefined} />
          <Field
            label="Friend’s email"
            value={giftEmail}
            onChangeText={setGiftEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            helper="If they don’t have Tikkit yet, the tickets wait for them."
            error={showErrors ? errors.giftEmail : undefined}
          />
        </>
      )}
      {promo ? (
        <View style={[styles.promo, { backgroundColor: colors.surface }]}>
          <Ticket size={20} color={colors.success} weight="bold" />
          <AppText style={styles.fill}>
            <AppText style={styles.bold}>{promo.code}</AppText>: {promo.percentOff === 100 ? 'free entry' : `${promo.percentOff}% off`}
          </AppText>
          <Button label="Remove" variant="plain" onPress={() => setPromo(null)} />
        </View>
      ) : (
        <View style={styles.promoRow}>
          <View style={styles.fill}>
            <Field
              label="Promo code (optional)"
              value={promoInput}
              onChangeText={(t) => {
                setPromoInput(t);
                setPromoNote(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
              returnKeyType="done"
              onSubmitEditing={applyPromo}
              error={promoNote ?? undefined}
            />
          </View>
          <Button label="Apply" variant="secondary" loading={promoBusy} disabled={!promoInput.trim()} onPress={applyPromo} style={styles.applyBtn} />
        </View>
      )}
    </View>
  );

  const heading = (
    <View>
      <AppText variant="title2">{event.title}</AppText>
      <AppText variant="subhead" muted>
        {formatWhen(event.startsAt)}, {event.venue.name}
      </AppText>
    </View>
  );

  const ticketLines = event.tiers.filter((t) => qtyFor(t.id) > 0);
  const extraLines = addons.filter((a) => (extras[a.id] ?? 0) > 0);
  const summary = (
    <View style={styles.gapSm}>
      {ticketLines.map((t) => (
        <Line key={t.id} label={`${qtyFor(t.id)} × ${t.name}`} value={formatMoney(qtyFor(t.id) * t.price, event.currency)} />
      ))}
      {extraLines.map((a) => (
        <Line key={a.id} label={`${extras[a.id]} × ${a.name}`} value={formatMoney((extras[a.id] ?? 0) * a.price, event.currency)} />
      ))}
      {discount > 0 && (
        <Line label={promo ? `Promo ${promo.code}` : `Member price (${memberPct}% off)`} value={`−${formatMoney(discount, event.currency)}`} tint={colors.success} />
      )}
      {passFee && <Line label="Booking fee" value={formatMoney(fee, event.currency)} muted />}
    </View>
  );

  const disclaimer = (
    <View style={styles.gapSm}>
      {failure && (
        <AppText variant="subhead" color={colors.danger} accessibilityLiveRegion="polite">
          {failure}
        </AppText>
      )}
      {total > 0 && (
        <View style={styles.trust}>
          <ShieldCheck size={18} color={colors.success} weight="fill" />
          <AppText variant="footnote" muted style={styles.fill}>
            Tickets are held for 20 minutes while you pay. Covered by the Tikkit Guarantee.
            {event.feeMode === 'absorb' && fee > 0 ? ' No booking fee: the organiser covers it.' : ''}
          </AppText>
        </View>
      )}
    </View>
  );

  if (isDesktop) {
    return (
      <ScrollView contentContainerStyle={styles.desktopScroll}>
        <Container wide style={styles.columns}>
          <View style={[styles.fill, styles.gapLg]}>
            {heading}
            {presaleBanner}
            {tiers}
            {seatSection}
            {extrasSection}
            {details}
          </View>
          <View style={[styles.summary, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
            <AppText variant="title3">Order summary</AppText>
            {count === 0 ? <AppText muted>No tickets selected yet.</AppText> : summary}
            <View style={[styles.line, styles.totalLine, { borderColor: colors.border }]}>
              <AppText variant="headline" style={styles.fill}>
                Total
              </AppText>
              <AppText variant="title3" style={styles.tabular}>
                {formatMoney(total, event.currency)}
              </AppText>
            </View>
            <Button label={payLabel} loading={paying} disabled={presaleLocked} onPress={pay} />
            {disclaimer}
          </View>
        </Container>
      </ScrollView>
    );
  }

  return (
    <KeyboardScreen
      footer={
        <Container style={styles.barInner}>
          <View style={styles.fill}>
            <AppText variant="footnote" muted>
              {count} {count === 1 ? 'ticket' : 'tickets'}
              {passFee ? ', incl. fee' : ''}
            </AppText>
            <AppText variant="title3" style={styles.tabular}>
              {formatMoney(total, event.currency)}
            </AppText>
          </View>
          <Button label={payLabel} loading={paying} disabled={presaleLocked} onPress={pay} style={styles.cta} />
        </Container>
      }
    >
      <Container style={styles.gapLg}>
        {heading}
        {presaleBanner}
        {tiers}
        {seatSection}
        {extrasSection}
        {details}
        {count > 0 && (subtotal > 0 || extrasTotal > 0) && (
          <View style={[styles.summaryInline, { backgroundColor: colors.surface }]}>
            {summary}
            <Line label="Total" value={formatMoney(total, event.currency)} strong />
          </View>
        )}
        {disclaimer}
      </Container>
    </KeyboardScreen>
  );
}

function AddonLine({ a, value, onChange, currency }: { a: Addon; value: number; onChange: (n: number) => void; currency: Currency }) {
  const colors = useColors();
  const IconCmp = a.kind === 'transfer' ? Boat : Package;
  return (
    <View style={[styles.tier, { borderColor: colors.border }]}>
      <View style={[styles.addonIcon, { backgroundColor: colors.surface }]}>
        <IconCmp size={20} color={colors.text} />
      </View>
      <View style={styles.fill}>
        <AppText variant="headline">{a.name}</AppText>
        <AppText variant="subhead" muted>
          {a.remaining === 0
            ? 'Full'
            : `${formatMoney(a.price, currency)}${a.departsAt ? `, leaves ${formatTime(a.departsAt)}` : ''}${a.description ? `. ${a.description}` : ''}`}
        </AppText>
      </View>
      {a.remaining > 0 && <Stepper label={a.name} value={value} max={Math.min(a.remaining, MAX_PER_ORDER)} onChange={onChange} />}
    </View>
  );
}

function Line({ label, value, tint, muted, strong }: { label: string; value: string; tint?: string; muted?: boolean; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <AppText variant={strong ? 'headline' : 'subhead'} muted={muted} style={styles.fill}>
        {label}
      </AppText>
      <AppText variant={strong ? 'headline' : 'subhead'} color={tint} muted={muted} style={styles.tabular}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  promo: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, paddingLeft: space.md, borderRadius: radius.control },
  bold: { fontWeight: '600' },
  promoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  applyBtn: { marginTop: 26 },
  fill: { flex: 1 },
  gap: { gap: space.lg },
  gapSm: { gap: space.sm },
  gapLg: { gap: space.xl },
  h: { marginBottom: space.xs },
  tier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addonIcon: { width: 40, height: 40, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, padding: space.md, borderRadius: radius.control },
  err: { marginTop: space.sm },
  barInner: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tabular: { fontVariant: ['tabular-nums'] },
  cta: { minWidth: 170 },
  trust: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  presale: { flexDirection: 'row', gap: space.sm + 4, padding: space.md, borderRadius: radius.control, borderLeftWidth: 4 },
  presaleBtn: { alignSelf: 'flex-start', marginTop: space.sm },
  summaryInline: { padding: space.md, borderRadius: radius.control, gap: space.sm },
  desktopScroll: { paddingVertical: space.xxl },
  columns: { flexDirection: 'row', gap: space.xxl, alignItems: 'flex-start', maxWidth: 1080 },
  summary: {
    width: 360,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    // RN Web supports sticky positioning; native ignores it.
    position: 'sticky' as 'relative',
    top: space.lg,
  },
  line: { flexDirection: 'row', gap: space.md },
  totalLine: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, alignItems: 'center' },
});
