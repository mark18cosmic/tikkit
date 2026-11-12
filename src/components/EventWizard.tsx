import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { CaretLeft, ImageSquare, PencilSimple, Plus, Trash } from '@/components/icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { Chip } from './Chip';
import { Container } from './Container';
import { DateField, TimeField } from './DateTimeField';
import { Field } from './Field';
import { IconButton } from './IconButton';
import { KeyboardScreen } from './KeyboardScreen';
import { Stepper } from './Stepper';
import { categories, type Category } from '@/data/events';
import { bookingHours, type Booking, type Venue } from '@/data/venues';
import { CURRENCIES, formatDay, formatMoney, formatRange, formatTime, mvDateInput, mvInstant, parseMv, type Currency } from '@/lib/format';
import { errorFeedback, successFeedback, tapFeedback } from '@/lib/haptics';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// Creating or editing an event, one step at a time:
//   1 Basics  2 When and where  3 Tickets  4 Details and review
// Each step checks its own fields before moving on. Editing can jump to any step.

export type TierDraft = { key: string; id?: string; sold?: number; name: string; price: string; quantity: string };
// Where the event happens: a venue the organiser owns, a space they booked, or typed in.
export type Place = { kind: 'venue'; id: string } | { kind: 'booking'; id: string } | { kind: 'other' };

export type WizardValues = {
  title: string;
  organizer: string;
  category: Category;
  date: string;
  time: string;
  hours: number;
  place: Place;
  venueName: string;
  area: string;
  address: string;
  access: string;
  description: string;
  tiers: TierDraft[];
  // What every ticket and add-on is priced in.
  currency: Currency;
  // Creating only: repeat on a schedule, and a members-only head start.
  repeat?: 'none' | 'week' | 'fortnight' | 'month';
  repeatCount?: number;
  presaleDays?: number;
};

const repeatOptions = [
  { id: 'none', label: 'Just once' },
  { id: 'week', label: 'Weekly' },
  { id: 'fortnight', label: 'Every 2 weeks' },
  { id: 'month', label: 'Monthly' },
] as const;

export type WizardResult = WizardValues & {
  start: Date;
  booking?: Booking;
  venue?: Venue;
  photo?: { uri: string; mimeType?: string };
};

type Props = {
  mode: 'create' | 'edit';
  initial: WizardValues;
  // Existing photo when editing.
  imageUri?: string;
  venues: Venue[];
  bookings: Booking[];
  organizers: string[];
  // Editing an event at a venue: the place is shown but can't change.
  fixedPlace?: string;
  onSubmit(result: WizardResult): Promise<void>;
};

const STEPS = ['Basics', 'When and where', 'Tickets', 'Details and review'] as const;

export function EventWizard({ mode, initial, imageUri, venues, bookings, organizers, fixedPlace, onSubmit }: Props) {
  const colors = useColors();
  const [step, setStep] = useState(0);
  const [v, setValues] = useState<WizardValues>(initial);
  const [photo, setPhoto] = useState<{ uri: string; mimeType?: string } | null>(null);
  const [checked, setChecked] = useState<boolean[]>([false, false, false, false]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const set = <K extends keyof WizardValues>(k: K, value: WizardValues[K]) => setValues((s) => ({ ...s, [k]: value }));

  const booking = v.place.kind === 'booking' ? bookings.find((b) => b.id === (v.place as { id: string }).id) : undefined;
  const venue = v.place.kind === 'venue' ? venues.find((x) => x.id === (v.place as { id: string }).id) : undefined;
  const typedVenue = v.place.kind === 'other' && !fixedPlace;
  const start = parseMv(v.date, v.time);
  const end = new Date(start.getTime() + v.hours * 3_600_000);

  const errors = [
    {
      title: v.title.trim().length < 3 ? 'Give the event a name.' : undefined,
      organizer: v.organizer.trim().length < 2 ? 'Enter who is running the event.' : undefined,
    },
    {
      date: !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || isNaN(start.getTime())
        ? 'Use the format 2026-10-23.'
        : start <= new Date()
          ? 'Pick a date in the future.'
          : booking && (start < new Date(booking.startsAt) || end > new Date(booking.endsAt))
            ? `Fit the event inside your booking, ${formatRange(booking.startsAt, booking.endsAt)}.`
            : undefined,
      time: !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) ? 'Use 24-hour time, like 19:30.' : undefined,
      venueName: typedVenue && v.venueName.trim().length < 2 ? 'Enter the venue name.' : undefined,
      area: typedVenue && v.area.trim().length < 2 ? 'Enter the island, like Hulhumalé.' : undefined,
      address: typedVenue && v.address.trim().length < 5 ? 'Enter the street address.' : undefined,
    },
    {},
    { description: v.description.trim().length < 20 ? 'Write at least a sentence about the event.' : undefined },
  ] as Record<string, string | undefined>[];
  // Buyers paid in the event's currency, so it can't change after a sale.
  const currencyLocked = mode === 'edit' && v.tiers.some((t) => (t.sold ?? 0) > 0);
  const tierErrors = v.tiers.map((t) => ({
    name: t.name.trim().length < 2 ? 'Name this ticket type.' : undefined,
    price: !/^\d+(\.\d{1,2})?$/.test(t.price.trim()) ? 'Enter a price, or 0 for free.' : undefined,
    quantity: !/^[1-9]\d{0,4}$/.test(t.quantity.trim())
      ? 'Enter how many are available, up to 99,999.'
      : Number(t.quantity) < (t.sold ?? 0)
        ? `At least ${t.sold}, since that many have sold.`
        : undefined,
  }));
  const stepValid = (i: number) =>
    Object.values(errors[i]).every((x) => !x) && (i !== 2 || tierErrors.every((t) => !t.name && !t.price && !t.quantity));
  const show = (i: number, k: string) => (checked[i] ? errors[i][k] : undefined);

  const go = (to: number) => {
    setFailure(null);
    setStep(to);
  };
  const next = async () => {
    setChecked((c) => c.map((x, i) => (i === step ? true : x)));
    if (!stepValid(step)) return errorFeedback();
    tapFeedback();
    if (step < STEPS.length - 1) return go(step + 1);
    // Last step: everything must be valid.
    const firstBad = STEPS.findIndex((_, i) => !stepValid(i));
    if (firstBad >= 0) {
      setChecked([true, true, true, true]);
      errorFeedback();
      return go(firstBad);
    }
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit({ ...v, start, booking, venue, photo: photo ?? undefined });
      successFeedback();
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 2], quality: 0.7 });
    const asset = res.canceled ? null : res.assets[0];
    if (asset) setPhoto({ uri: asset.uri, mimeType: asset.mimeType ?? undefined });
  };

  // A booking fixes the window, so start the event at its beginning.
  const pickBooking = (b: Booking) => {
    const at = mvDateInput(b.startsAt);
    setValues((s) => ({ ...s, place: { kind: 'booking', id: b.id }, date: at.date, time: at.time, hours: Math.min(12, bookingHours(b)) }));
  };
  const updateTier = (key: string, patch: Partial<TierDraft>) =>
    set('tiers', v.tiers.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const shownImage = photo?.uri ?? imageUri;
  const last = step === STEPS.length - 1;

  return (
    <KeyboardScreen
      footer={
        <Container style={styles.footer}>
          {step > 0 && <IconButton icon={CaretLeft} accessibilityLabel="Back a step" onPress={() => go(step - 1)} style={styles.backBtn} />}
          <Button
            label={last ? (mode === 'create' ? 'Publish event' : 'Save changes') : 'Continue'}
            loading={busy}
            onPress={next}
            style={styles.fill}
          />
        </Container>
      }
    >
      <Container style={styles.gap}>
        <Progress step={step} onJump={mode === 'edit' ? go : undefined} />

        {step === 0 && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={shownImage ? 'Change event photo' : 'Add event photo'}
              onPress={pickImage}
              style={({ pressed }) => [styles.photo, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.8 }]}
            >
              {shownImage ? (
                <Image source={shownImage} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={styles.photoEmpty}>
                  <ImageSquare size={32} color={colors.textMuted} />
                  <AppText variant="subhead" muted style={styles.center}>
                    Add a photo. Without one, we draw a sunset cover for you.
                  </AppText>
                </View>
              )}
            </Pressable>
            <Field label="Event name" value={v.title} onChangeText={(t) => set('title', t)} autoCapitalize="words" maxLength={120} error={show(0, 'title')} />
            <View style={styles.block}>
              <Field
                label="Organiser"
                value={v.organizer}
                onChangeText={(t) => set('organizer', t)}
                autoCapitalize="words"
                maxLength={80}
                editable={mode === 'create'}
                helper={mode === 'create' ? 'Your organiser page. People follow it.' : 'Rename it from your organiser page.'}
                error={show(0, 'organizer')}
              />
              {mode === 'create' && organizers.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chipRow}>
                  {organizers.map((o) => (
                    <Chip key={o} label={o} selected={v.organizer.trim().toLowerCase() === o.toLowerCase()} onPress={() => set('organizer', o)} />
                  ))}
                </ScrollView>
              )}
            </View>
            <View style={styles.block}>
              <AppText variant="subhead" style={styles.bold}>
                Category
              </AppText>
              <View style={styles.chips}>
                {categories.map((c) => (
                  <Chip key={c} label={c} selected={v.category === c} onPress={() => set('category', c)} />
                ))}
              </View>
            </View>
          </>
        )}

        {step === 1 && (
          <>
            {fixedPlace ? (
              <View style={[styles.summary, { backgroundColor: colors.surface }]}>
                <AppText variant="subhead" muted>
                  Where
                </AppText>
                <AppText variant="headline">{fixedPlace}</AppText>
              </View>
            ) : (
              (venues.length > 0 || bookings.length > 0) && (
                <View style={styles.block}>
                  <AppText variant="subhead" style={styles.bold}>
                    Where
                  </AppText>
                  <View style={styles.chips}>
                    {venues.map((x) => (
                      <Chip key={x.id} label={x.name} selected={venue?.id === x.id} onPress={() => set('place', { kind: 'venue', id: x.id })} />
                    ))}
                    {bookings.map((b) => (
                      <Chip
                        key={b.id}
                        label={`${b.venue?.name ?? 'Booked space'}, ${formatDay(b.startsAt)}`}
                        selected={booking?.id === b.id}
                        onPress={() => pickBooking(b)}
                      />
                    ))}
                    <Chip label="Somewhere else" selected={v.place.kind === 'other'} onPress={() => set('place', { kind: 'other' })} />
                  </View>
                  {venue && (
                    <AppText variant="footnote" muted>
                      Your space. This time is blocked on its calendar when you publish.
                    </AppText>
                  )}
                  {booking && (
                    <AppText variant="footnote" muted>
                      Your booking: {formatRange(booking.startsAt, booking.endsAt)}.
                    </AppText>
                  )}
                </View>
              )
            )}

            {!booking && <QuickDates onPick={(d) => set('date', d)} selected={v.date} />}
            <View style={styles.pair}>
              <View style={styles.fill}>
                <DateField label="Date" value={v.date} onChange={(t) => set('date', t)} helper="Maldives time" error={show(1, 'date')} />
              </View>
              <View style={styles.fill}>
                <TimeField label="Starts" value={v.time} onChange={(t) => set('time', t)} error={show(1, 'time')} />
              </View>
            </View>
            <View style={styles.inline}>
              <View style={styles.fill}>
                <AppText variant="subhead" style={styles.bold}>
                  Length
                </AppText>
                <AppText variant="subhead" muted>
                  {v.hours} {v.hours === 1 ? 'hour' : 'hours'}
                  {!isNaN(start.getTime()) ? `, ends ${formatTime(end.toISOString())}` : ''}
                </AppText>
              </View>
              <Stepper label="hour" value={v.hours} min={1} max={12} onChange={(n) => set('hours', n)} />
            </View>

            {typedVenue && (
              <>
                <Field label="Venue" value={v.venueName} onChangeText={(t) => set('venueName', t)} autoCapitalize="words" error={show(1, 'venueName')} />
                <Field
                  label="Island or atoll"
                  value={v.area}
                  onChangeText={(t) => set('area', t)}
                  autoCapitalize="words"
                  helper="What people search for, like Hulhumalé or Baa Atoll."
                  error={show(1, 'area')}
                />
                <Field label="Address" value={v.address} onChangeText={(t) => set('address', t)} autoComplete="street-address" error={show(1, 'address')} />
              </>
            )}
            <Field
              label="Getting there (optional)"
              value={v.access}
              onChangeText={(t) => set('access', t)}
              placeholder="Ferry from Malé, 10 minutes"
              helper="Boats, ferries or flights people need to plan for."
            />
            {mode === 'create' && !booking && (
              <View style={styles.repeat}>
                <AppText variant="subhead" style={styles.bold}>
                  Repeats
                </AppText>
                <View style={styles.chips}>
                  {repeatOptions.map((o) => (
                    <Chip key={o.id} label={o.label} selected={(v.repeat ?? 'none') === o.id} onPress={() => set('repeat', o.id)} />
                  ))}
                </View>
                {v.repeat && v.repeat !== 'none' && (
                  <View style={styles.inline}>
                    <View style={styles.fill}>
                      <AppText variant="subhead" style={styles.bold}>
                        Number of dates
                      </AppText>
                      <AppText variant="subhead" muted>
                        {v.repeatCount ?? 4} dates, each with its own tickets. Edit or cancel any one later.
                      </AppText>
                    </View>
                    <Stepper label="date" value={v.repeatCount ?? 4} min={2} max={12} onChange={(n) => set('repeatCount', n)} />
                  </View>
                )}
              </View>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <View style={styles.repeat}>
              <AppText variant="subhead" style={styles.bold}>
                Currency
              </AppText>
              <View style={styles.chips}>
                {CURRENCIES.map((c) => (
                  <Chip
                    key={c}
                    label={c === 'MVR' ? 'MVR, rufiyaa' : 'USD, US dollars'}
                    selected={v.currency === c}
                    onPress={() => !currencyLocked && set('currency', c)}
                  />
                ))}
              </View>
              <AppText variant="footnote" muted>
                {currencyLocked
                  ? 'Tickets have been sold, so the currency is fixed.'
                  : v.currency === 'USD'
                    ? 'Good for trips and nights sold to visitors. Buyers pay in dollars and your earnings are paid out to a USD account.'
                    : 'Most events in the Maldives sell in rufiyaa. Choose USD for trips and nights sold to visitors.'}
              </AppText>
            </View>
            {mode === 'create' && (
              <View style={styles.repeat}>
                <AppText variant="subhead" style={styles.bold}>
                  Members-only presale
                </AppText>
                <View style={styles.chips}>
                  {[0, 1, 3, 7].map((d) => (
                    <Chip key={d} label={d === 0 ? 'No presale' : `First ${d} ${d === 1 ? 'day' : 'days'}`} selected={(v.presaleDays ?? 0) === d} onPress={() => set('presaleDays', d)} />
                  ))}
                </View>
                <AppText variant="footnote" muted>
                  Only your members can buy at first, then general sale opens. Set up a membership from your organiser page.
                </AppText>
              </View>
            )}
            {v.tiers.map((t, i) => {
              const locked = (t.sold ?? 0) > 0;
              const err = checked[2] ? tierErrors[i] : undefined;
              return (
                <View key={t.key} style={[styles.tierCard, { borderColor: colors.border }]}>
                  <View style={styles.inline}>
                    <AppText variant="headline" style={styles.fill}>
                      Ticket type {i + 1}
                    </AppText>
                    {locked ? (
                      <AppText variant="footnote" muted>
                        {t.sold} sold
                      </AppText>
                    ) : (
                      v.tiers.length > 1 && (
                        <IconButton
                          icon={Trash}
                          accessibilityLabel={`Remove ticket type ${i + 1}`}
                          onPress={() => set('tiers', v.tiers.filter((x) => x.key !== t.key))}
                        />
                      )
                    )}
                  </View>
                  <Field label="Name" value={t.name} onChangeText={(x) => updateTier(t.key, { name: x })} error={err?.name} />
                  <View style={styles.pair}>
                    <View style={styles.fill}>
                      <Field
                        label={`Price (${v.currency})`}
                        value={t.price}
                        onChangeText={(x) => updateTier(t.key, { price: x })}
                        keyboardType="decimal-pad"
                        editable={!locked}
                        helper={locked ? 'Locked once sold' : undefined}
                        error={err?.price}
                      />
                    </View>
                    <View style={styles.fill}>
                      <Field
                        label="Available"
                        value={t.quantity}
                        onChangeText={(x) => updateTier(t.key, { quantity: x })}
                        keyboardType="number-pad"
                        error={err?.quantity}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
            {v.tiers.length < 5 && (
              <Button
                label="Add ticket type"
                icon={Plus}
                variant="secondary"
                onPress={() => set('tiers', [...v.tiers, { key: `t${Date.now()}`, name: '', price: '', quantity: '' }])}
              />
            )}
            <AppText variant="footnote" muted>
              Free events use a price of 0. Card payments for paid tickets are coming; until then a 100% promo code lets
              guests in free.
            </AppText>
          </>
        )}

        {step === 3 && (
          <>
            <Field
              label="About the event"
              value={v.description}
              onChangeText={(t) => set('description', t)}
              multiline
              maxLength={5000}
              textAlignVertical="top"
              placeholder="What happens, who it’s for, what to bring."
              style={styles.multiline}
              error={show(3, 'description')}
            />
            <AppText variant="title3" accessibilityRole="header">
              Check it over
            </AppText>
            <ReviewRow label="Basics" onEdit={() => go(0)} lines={[v.title || 'No name yet', `${v.category}, by ${v.organizer || '…'}`]} />
            <ReviewRow
              label="When and where"
              onEdit={() => go(1)}
              lines={[
                isNaN(start.getTime()) ? 'Date not set' : formatRange(start.toISOString(), end.toISOString()),
                fixedPlace ?? venue?.name ?? booking?.venue?.name ?? ([v.venueName, v.area].filter(Boolean).join(', ') || 'Venue not set'),
              ]}
            />
            <ReviewRow
              label="Tickets"
              onEdit={() => go(2)}
              lines={v.tiers.map((t) => `${t.name || 'Unnamed'}: ${/^\d/.test(t.price) ? formatMoney(Math.round(Number(t.price) * 100), v.currency) : '…'}, ${t.quantity || 0} available`)}
            />
            {mode === 'create' && (
              <AppText variant="footnote" muted>
                Published events appear on Explore for everyone straight away. You can edit or cancel later.
              </AppText>
            )}
          </>
        )}

        {failure && (
          <AppText variant="subhead" color={colors.danger} accessibilityLiveRegion="polite">
            {failure}
          </AppText>
        )}
      </Container>
    </KeyboardScreen>
  );
}

function Progress({ step, onJump }: { step: number; onJump?: (i: number) => void }) {
  const colors = useColors();
  return (
    <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: step + 1 }}>
      <AppText variant="footnote" color={colors.accent} style={styles.bold}>
        STEP {step + 1} OF {STEPS.length}
      </AppText>
      <AppText variant="title2" accessibilityRole="header">
        {STEPS[step]}
      </AppText>
      <View style={styles.bars}>
        {STEPS.map((name, i) => (
          <Pressable
            key={name}
            disabled={!onJump}
            accessibilityRole={onJump ? 'button' : undefined}
            accessibilityLabel={onJump ? `Go to ${name}` : undefined}
            onPress={() => onJump?.(i)}
            style={styles.barHit}
          >
            <View style={[styles.bar, { backgroundColor: i <= step ? colors.accent : colors.border }]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Tonight, tomorrow and the coming weekend, as one-tap dates.
function QuickDates({ selected, onPick }: { selected: string; onPick: (date: string) => void }) {
  const now = new Date();
  const today = mvDateInput(now.toISOString()).date;
  const [y, m, d] = today.split('-').map(Number);
  const dayAt = (offset: number) => mvDateInput(mvInstant(y, m - 1, d + offset, 12).toISOString()).date;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const toFri = (5 - dow + 7) % 7 || 7;
  const options = [
    { label: 'Today', date: dayAt(0) },
    { label: 'Tomorrow', date: dayAt(1) },
    { label: 'Friday', date: dayAt(toFri) },
    { label: 'Saturday', date: dayAt(toFri + 1) },
  ].filter((o, i, all) => all.findIndex((x) => x.date === o.date) === i);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((o) => (
        <Chip key={o.label} label={o.label} selected={selected === o.date} onPress={() => onPick(o.date)} />
      ))}
    </ScrollView>
  );
}

function ReviewRow({ label, lines, onEdit }: { label: string; lines: string[]; onEdit: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.summary, { backgroundColor: colors.surface }]}>
      <View style={styles.inline}>
        <AppText variant="subhead" muted style={styles.fill}>
          {label}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${label}`} onPress={onEdit} hitSlop={8} style={styles.editLink}>
          <PencilSimple size={16} color={colors.accent} />
          <AppText variant="subhead" color={colors.accent} style={styles.bold}>
            Edit
          </AppText>
        </Pressable>
      </View>
      {lines.map((l, i) => (
        <AppText key={i} variant={i === 0 ? 'headline' : 'body'}>
          {l}
        </AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  repeat: { gap: space.sm },
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  bold: { fontWeight: '600' },
  gap: { gap: space.lg },
  block: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chipRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md },
  bleed: { marginHorizontal: -space.md },
  pair: { flexDirection: 'row', gap: space.sm + 4, alignItems: 'flex-start' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  backBtn: { width: 50, height: 50 },
  photo: {
    aspectRatio: 3 / 2,
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmpty: { alignItems: 'center', gap: space.sm, padding: space.lg },
  multiline: { minHeight: 140, paddingTop: space.sm + 4 },
  tierCard: { gap: space.md, padding: space.md, borderRadius: radius.control, borderWidth: StyleSheet.hairlineWidth },
  progress: { gap: space.xs },
  bars: { flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  barHit: { flex: 1, paddingVertical: space.xs },
  bar: { height: 4, borderRadius: radius.pill },
  summary: { padding: space.md, borderRadius: radius.control, gap: space.xxs },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
