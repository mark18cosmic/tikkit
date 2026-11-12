import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { CheckCircle, Copy, Crown, Link as LinkIcon, MegaphoneSimple, RocketLaunch } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Pressable, Share, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { Field } from '../Field';
import type { EventItem } from '@/data/events';
import type { PromoterStat } from '@/data/money';
import { isPro } from '@/data/trust';
import { formatAmount, formatDay, formatMoney } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { eventLink } from '@/lib/links';
import { broadcast, buyPromotion, fetchMyPromotions, savePromoterLink, setPromoterActive } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// Promoter links: each promoter gets their own link and a commission on what
// it sells, credited to their Tikkit wallet automatically.
export function Promoters({ event, promoters, onChange }: { event: EventItem; promoters: PromoterStat[]; onChange: () => void }) {
  const colors = useColors();
  const { status } = useAppStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [pct, setPct] = useState(10);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const atLimit = !isPro(status) && promoters.length >= 2;

  const create = async () => {
    setFailure(null);
    setBusy(true);
    try {
      await savePromoterLink(event.id, name.trim(), code.trim() || name.trim(), email.trim(), pct);
      successFeedback();
      setOpen(false);
      setName('');
      setCode('');
      setEmail('');
      onChange();
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const copy = async (c: string) => {
    await Clipboard.setStringAsync(eventLink(event.id, c)).catch(() => false);
    successFeedback();
    setCopied(c);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <View style={styles.section}>
      <AppText variant="title3" accessibilityRole="header">
        Promoters
      </AppText>
      <AppText variant="subhead" muted>
        Give each promoter their own link. Sales are tracked and their commission is paid into their Tikkit wallet after the event.
      </AppText>
      {promoters.map((p) => (
        <View key={p.id} style={[styles.item, { backgroundColor: colors.surface }]}>
          <View style={styles.row}>
            <LinkIcon size={20} color={p.active ? colors.accent : colors.textMuted} />
            <View style={styles.fill}>
              <AppText variant="headline">{p.name}</AppText>
              <AppText variant="subhead" muted>
                {p.tickets} tickets, {formatAmount(p.commission, event.currency)} commission at {p.pct}%
              </AppText>
              <AppText variant="footnote" muted numberOfLines={1}>
                {p.hasAccount ? `Paid to ${p.email}` : p.email ? `${p.email} has no account yet: you pay them directly` : 'No account: you pay them directly'}
              </AppText>
            </View>
            <Switch
              value={p.active}
              onValueChange={(v) => setPromoterActive(p.id, v).then(onChange, () => errorFeedback())}
              trackColor={{ true: colors.accent }}
              thumbColor="#FFFFFF"
              accessibilityLabel={`${p.name} link active`}
            />
          </View>
          <View style={styles.row}>
            <Button label={copied === p.code ? 'Copied' : 'Copy link'} icon={copied === p.code ? CheckCircle : Copy} variant="plain" onPress={() => copy(p.code)} />
            <Button
              label="Share"
              variant="plain"
              onPress={() => Share.share({ message: `${event.title}: ${eventLink(event.id, p.code)}` }).catch(() => {})}
            />
          </View>
        </View>
      ))}
      {open ? (
        <View style={styles.form}>
          <Field label="Promoter’s name" value={name} onChangeText={setName} autoCapitalize="words" />
          <Field label="Link code" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} placeholder="zara" helper={`Their link ends in ?ref=${(code || name || 'name').toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`} />
          <Field label="Their Tikkit email (optional)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" helper="So their commission is paid to them automatically." />
          <AppText variant="subhead" style={styles.bold}>
            Commission
          </AppText>
          <View style={styles.chips}>
            {[5, 10, 15, 20].map((n) => (
              <Chip key={n} label={`${n}%`} selected={pct === n} onPress={() => setPct(n)} />
            ))}
          </View>
          {failure && (
            <AppText variant="footnote" color={colors.danger}>
              {failure}
            </AppText>
          )}
          <View style={styles.row}>
            <Button label="Cancel" variant="plain" onPress={() => setOpen(false)} />
            <Button label="Create link" loading={busy} disabled={name.trim().length < 2} onPress={create} style={styles.fill} />
          </View>
        </View>
      ) : atLimit ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/pro')} style={[styles.upsell, { borderColor: colors.border }]}>
          <Crown size={20} color={colors.accent} weight="fill" />
          <AppText variant="subhead" style={styles.fill}>
            Two links per event on the free plan. Pro is unlimited.
          </AppText>
        </Pressable>
      ) : (
        <Button label="Add a promoter link" icon={LinkIcon} variant="secondary" onPress={() => setOpen(true)} />
      )}
    </View>
  );
}

// Promoted listing: shows in the "Coming up" feed, labelled Promoted, at most
// one card in six.
export function Boost({ event }: { event: EventItem }) {
  const colors = useColors();
  const { paymentConfig: cfg, status } = useAppStore();
  const load = useCallback(() => fetchMyPromotions(event.id), [event.id]);
  const { data } = useRemote(load);
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  if (!cfg || event.listing !== 'approved') return null;
  const live = data?.find((p) => p.status === 'active' && p.ends_at && new Date(p.ends_at) > new Date());
  const price = Math.round(cfg.promotedDayPrice * days * (isPro(status) ? 0.75 : 1));
  const buy = async () => {
    setFailure(null);
    setBusy(true);
    try {
      const paymentId = await buyPromotion(event.id, days);
      router.push({ pathname: '/pay/[id]', params: { id: paymentId } });
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.section}>
      <AppText variant="title3" accessibilityRole="header">
        Promote on Explore
      </AppText>
      {live ? (
        <View style={[styles.item, styles.row, { backgroundColor: colors.surface }]}>
          <RocketLaunch size={22} color={colors.success} weight="fill" />
          <AppText variant="subhead" style={styles.fill}>
            Promoted until {formatDay(live.ends_at!)}. It appears in the main feed with a Promoted label.
          </AppText>
        </View>
      ) : (
        <>
          <AppText variant="subhead" muted>
            Put this event in front of everyone browsing Explore, labelled as promoted. Paid placements are capped so the feed stays useful.
          </AppText>
          <View style={styles.chips}>
            {[1, 3, 7].map((d) => (
              <Chip key={d} label={d === 1 ? '1 day' : `${d} days`} selected={days === d} onPress={() => setDays(d)} />
            ))}
          </View>
          <Button label={`Promote for ${formatMoney(price)}`} icon={RocketLaunch} variant="secondary" loading={busy} onPress={buy} />
        </>
      )}
      {failure && (
        <AppText variant="footnote" color={colors.danger}>
          {failure}
        </AppText>
      )}
    </View>
  );
}

// Pro: a notification to everyone following the organiser.
export function Broadcast({ event }: { event: EventItem }) {
  const colors = useColors();
  const { status } = useAppStore();
  const [title, setTitle] = useState(`New: ${event.title}`.slice(0, 80));
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!event.organizerId || event.listing !== 'approved') return null;
  const pro = isPro(status);
  const send = async () => {
    setNote(null);
    setBusy(true);
    try {
      const n = Number(await broadcast(event.organizerId!, title, body, event.id));
      successFeedback();
      setNote(`Sent to ${n} ${n === 1 ? 'follower' : 'followers'}.`);
      setBody('');
    } catch (e) {
      errorFeedback();
      setNote(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.section}>
      <AppText variant="title3" accessibilityRole="header">
        Tell your followers
      </AppText>
      {pro ? (
        <>
          <Field label="Headline" value={title} onChangeText={setTitle} maxLength={80} />
          <Field label="Message (optional)" value={body} onChangeText={setBody} maxLength={300} multiline style={styles.multi} />
          <Button label="Send to followers" icon={MegaphoneSimple} variant="secondary" loading={busy} disabled={title.trim().length < 2} onPress={send} />
          <AppText variant="footnote" muted>
            Up to 3 a week, so people keep reading them.
          </AppText>
        </>
      ) : (
        <Pressable accessibilityRole="link" onPress={() => router.push('/pro')} style={[styles.upsell, { borderColor: colors.border }]}>
          <Crown size={20} color={colors.accent} weight="fill" />
          <AppText variant="subhead" style={styles.fill}>
            Message everyone who follows you with Organiser Pro.
          </AppText>
        </Pressable>
      )}
      {note && (
        <AppText variant="footnote" muted>
          {note}
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
  bold: { fontWeight: '600' },
  form: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  upsell: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, padding: space.md, borderRadius: radius.control, borderWidth: StyleSheet.hairlineWidth },
  multi: { minHeight: 80, textAlignVertical: 'top' },
});
