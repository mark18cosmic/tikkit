import { router } from 'expo-router';
import { CaretRight, Flag, ShieldWarning } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Decision } from '@/components/admin/Decision';
import { Chip } from '@/components/Chip';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { usePullRefresh } from '@/components/PullRefresh';
import { SignInRequired } from '@/components/SignInRequired';
import { ListSkeleton } from '@/components/Skeleton';
import { Stat, StatRow } from '@/components/Stat';
import { isListed } from '@/data/events';
import { reportReasons } from '@/data/trust';
import { formatAmount, formatWhen } from '@/lib/format';
import {
  confirmTransfer,
  decidePayout,
  fetchAdminOverview,
  fetchMoneyQueue,
  fetchOpenReports,
  fetchPendingVerifications,
  fetchReviewQueue,
  markRefunded,
  resolveReport,
  reviewEvent,
  saveCollection,
  takedownEvent,
} from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { useLayout } from '@/lib/useLayout';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

type Tab = 'people' | 'listings' | 'reports' | 'money' | 'collections';

// Rufiyaa, plus dollars when there are any. The two are never added together.
const both = (mvr: number, usd: number) => (usd ? `${formatAmount(mvr, 'MVR')}\n${formatAmount(usd, 'USD')}` : formatAmount(mvr, 'MVR'));

export default function AdminScreen() {
  return (
    <SignInRequired title="Admins only" body="Sign in with an admin account.">
      <Admin />
    </SignInRequired>
  );
}

function ago(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return h < 1 ? 'just now' : h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

function Admin() {
  const { status } = useAppStore();
  const { isWide } = useLayout();
  const [tab, setTab] = useState<Tab>('people');
  const loadOverview = useCallback(() => fetchAdminOverview(), []);
  const overview = useRemote(loadOverview);
  const refresh = usePullRefresh(overview.reload, { failed: !!overview.error });

  if (status && !status.admin) {
    return <EmptyState icon={ShieldWarning} title="Admins only" body="This account doesn’t have admin access." />;
  }
  const o = overview.data;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'people', label: 'People', count: o?.verifications },
    { id: 'listings', label: 'Listings', count: o?.listings },
    { id: 'reports', label: 'Reports', count: o?.reports },
    { id: 'money', label: 'Money', count: o ? o.transfers + o.refunds + o.payouts : undefined },
    { id: 'collections', label: 'Collections' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.scroll} refreshControl={refresh.control} onScroll={refresh.onScroll} scrollEventThrottle={refresh.scrollEventThrottle}>
      <Container wide={isWide} style={styles.gap}>
        <StatRow>
          <Stat label="Fees, last 30 days" value={o ? both(o.revenue30d, o.revenue30dUsd) : '…'} />
          <Stat label="Paid through Tikkit" value={o ? both(o.gmv30d, o.gmv30dUsd) : '…'} />
        </StatRow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {tabs.map((t) => (
            <Chip key={t.id} label={t.count ? `${t.label} ${t.count}` : t.label} selected={tab === t.id} onPress={() => setTab(t.id)} />
          ))}
        </ScrollView>
        {tab === 'people' && <People onChange={overview.reload} />}
        {tab === 'listings' && <Listings onChange={overview.reload} />}
        {tab === 'reports' && <Reports onChange={overview.reload} />}
        {tab === 'money' && <Money onChange={overview.reload} />}
        {tab === 'collections' && <Collections />}
      </Container>
    </ScrollView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.surface }]}>{children}</View>;
}

function Empty({ text }: { text: string }) {
  return (
    <AppText variant="subhead" muted style={styles.empty}>
      {text}
    </AppText>
  );
}

function People({ onChange }: { onChange: () => void }) {
  const colors = useColors();
  const load = useCallback(() => fetchPendingVerifications(), []);
  const { data } = useRemote(load);
  if (!data) return <ListSkeleton />;
  if (!data.length) return <Empty text="No one waiting. New verification requests appear here." />;
  return (
    <View style={styles.list}>
      {data.map((v) => (
        <Pressable
          key={v.id}
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/admin/verification/[id]', params: { id: v.id } })}
          style={({ pressed }) => [styles.card, styles.rowCard, { backgroundColor: colors.surface }, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.fill}>
            <AppText variant="headline">{v.legalName}</AppText>
            <AppText variant="subhead" muted>
              {v.kind === 'identity' ? (v.idKind === 'business' ? `Business: ${v.businessName}` : 'Identity') : 'Space check'}, {ago(v.createdAt)}
            </AppText>
          </View>
          <CaretRight size={18} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

function Listings({ onChange }: { onChange: () => void }) {
  const colors = useColors();
  const load = useCallback(() => fetchReviewQueue(), []);
  const { data, reload } = useRemote(load);
  const done = () => {
    reload();
    onChange();
  };
  if (!data) return <ListSkeleton />;
  if (!data.length) return <Empty text="Nothing to review. Pending events, edits after approval and recent auto-approvals show here." />;
  return (
    <View style={styles.list}>
      {data.map((e) => {
        const why = e.listing === 'pending' ? 'New listing' : e.editedAfterReview ? 'Edited after approval' : 'Auto-approved, spot check';
        const flagText: Record<string, string> = {
          similar_title: 'Name is close to another organiser’s live event. Check it isn’t a copy.',
          high_price: 'A ticket costs over MVR 10,000 (or USD 650).',
        };
        const minPrice = Math.min(...e.tiers.map((t) => t.price));
        return (
          <Card key={e.id}>
            <AppText variant="caption" color={colors.accent} style={styles.bold}>
              {why.toUpperCase()}
            </AppText>
            <AppText variant="headline">{e.title}</AppText>
            {e.reviewFlags.map((f) => (
              <AppText key={f} variant="subhead" color={colors.danger} style={styles.bold}>
                {flagText[f] ?? f}
              </AppText>
            ))}
            {!!e.seriesId && (
              <AppText variant="footnote" muted>
                Part of a series: approving approves every date.
              </AppText>
            )}
            <AppText variant="subhead" muted>
              {e.organizer}
              {e.organizerVerified ? ' (verified)' : ''}, {formatWhen(e.startsAt)}, {e.venue.name}, {e.venue.area}
            </AppText>
            <AppText variant="subhead" muted>
              {e.tiers.length} ticket {e.tiers.length === 1 ? 'type' : 'types'}, from {formatAmount(minPrice, e.currency)}, {e.tiers.reduce((s, t) => s + t.capacity, 0)} capacity
            </AppText>
            <AppText variant="subhead" numberOfLines={4}>
              {e.description}
            </AppText>
            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}>
              <AppText variant="subhead" color={colors.accent} style={styles.bold}>
                Open listing
              </AppText>
            </Pressable>
            <Decision
              placeholder="Note to the organiser (needed to reject)"
              onDone={done}
              actions={[
                { label: e.listing === 'approved' ? 'Looks fine' : 'Approve', run: (n) => reviewEvent(e.id, true, n) },
                { label: 'Needs changes', needsNote: true, run: (n) => reviewEvent(e.id, false, n) },
                ...(isListed(e) ? [{ label: 'Take down', needsNote: true, destructive: true, run: (n: string) => takedownEvent(e.id, n) }] : []),
              ]}
            />
          </Card>
        );
      })}
    </View>
  );
}

function Reports({ onChange }: { onChange: () => void }) {
  const colors = useColors();
  const load = useCallback(() => fetchOpenReports(), []);
  const { data, reload } = useRemote(load);
  const done = () => {
    reload();
    onChange();
  };
  if (!data) return <ListSkeleton />;
  if (!data.length) return <Empty text="No open reports." />;
  return (
    <View style={styles.list}>
      {data.map((r) => (
        <Card key={r.id}>
          <View style={styles.inline}>
            <Flag size={16} color={r.reason === 'scam' || r.reason === 'fake' ? colors.danger : colors.accent} weight="fill" />
            <AppText variant="headline">{reportReasons.find((x) => x.id === r.reason)?.label}</AppText>
          </View>
          <AppText variant="subhead" muted>
            {r.targetKind} {r.targetId}, {ago(r.createdAt)}
          </AppText>
          {!!r.details && <AppText variant="subhead">“{r.details}”</AppText>}
          {r.targetKind === 'event' && (
            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/event/[id]', params: { id: r.targetId } })}>
              <AppText variant="subhead" color={colors.accent} style={styles.bold}>
                Open event
              </AppText>
            </Pressable>
          )}
          <Decision
            placeholder="What you found"
            onDone={done}
            actions={[
              { label: 'Dismiss', run: (n) => resolveReport(r.id, false, n) },
              { label: 'Uphold', needsNote: true, run: (n) => resolveReport(r.id, true, n) },
              ...(r.targetKind === 'event'
                ? [{ label: 'Uphold and take down', needsNote: true, run: (n: string) => takedownEvent(r.targetId, n) }]
                : []),
            ]}
          />
        </Card>
      ))}
    </View>
  );
}

function Money({ onChange }: { onChange: () => void }) {
  const colors = useColors();
  const load = useCallback(() => fetchMoneyQueue(), []);
  const { data, reload } = useRemote(load);
  const done = () => {
    reload();
    onChange();
  };
  if (!data) return <ListSkeleton />;
  return (
    <View style={styles.gap}>
      <View style={styles.list}>
        <AppText variant="title3">Bank transfers to match</AppText>
        <AppText variant="footnote" muted>
          Find the line on Tikkit’s statement with this reference and amount. Never confirm from a slip or screenshot.
        </AppText>
        {data.transfers.length === 0 ? (
          <Empty text="No transfers waiting." />
        ) : (
          data.transfers.map((p) => (
            <Card key={p.id}>
              <View style={styles.inline}>
                <AppText variant="title3" color={colors.accent} selectable>
                  {p.reference}
                </AppText>
                <AppText variant="title3" style={styles.tabular}>
                  {formatAmount(p.amount, p.currency)}
                </AppText>
              </View>
              <AppText variant="subhead" muted>
                {p.label}, held until {formatWhen(p.expiresAt)}
              </AppText>
              <Decision
                placeholder="Bank statement reference"
                onDone={done}
                actions={[{ label: 'Confirm received', needsNote: true, run: (n) => confirmTransfer(p.id, n) }]}
              />
            </Card>
          ))
        )}
      </View>

      <View style={styles.list}>
        <AppText variant="title3">Refunds to send</AppText>
        {data.refunds.length === 0 ? (
          <Empty text="No refunds due." />
        ) : (
          data.refunds.map((p) => (
            <Card key={p.id}>
              <View style={styles.inline}>
                <AppText variant="headline">{p.reference}</AppText>
                <AppText variant="headline" style={styles.tabular}>
                  {formatAmount(p.amount, p.currency)}
                </AppText>
              </View>
              <AppText variant="subhead" muted>
                {p.label}. Paid by {p.method === 'transfer' ? `transfer (${p.bankRef ?? 'no ref'})` : 'card'}. {p.note}
              </AppText>
              <Decision
                placeholder={p.method === 'card' ? 'Refund ID from the bank portal' : 'Transfer reference'}
                onDone={done}
                actions={[{ label: 'Mark refunded', needsNote: true, run: (n) => markRefunded(p.id, n) }]}
              />
            </Card>
          ))
        )}
      </View>

      <View style={styles.list}>
        <AppText variant="title3">Withdrawals to pay</AppText>
        {data.payouts.length === 0 ? (
          <Empty text="No withdrawals waiting." />
        ) : (
          data.payouts.map((p) => (
            <Card key={p.id}>
              <View style={styles.inline}>
                <AppText variant="headline">{p.account.accountName}</AppText>
                <AppText variant="headline" style={styles.tabular}>
                  {formatAmount(p.amount, p.currency)}
                </AppText>
              </View>
              <AppText variant="subhead" muted selectable>
                {p.account.bank} {p.account.accountNumber}, requested {ago(p.createdAt)}
              </AppText>
              {p.account.verifiedName && (
                <AppText variant="subhead" muted>
                  Verified as {p.account.verifiedName}
                </AppText>
              )}
              {p.flags.includes('name_mismatch') && (
                <AppText variant="subhead" color={colors.danger} style={styles.bold}>
                  Account name doesn’t match the verified name. Confirm with them before paying.
                </AppText>
              )}
              {p.flags.includes('first_payout') && (
                <AppText variant="subhead" color={colors.accent} style={styles.bold}>
                  First withdrawal from this person.
                </AppText>
              )}
              <Decision
                placeholder="Transfer reference, or why it’s returned"
                onDone={done}
                actions={[
                  { label: 'Mark paid', needsNote: true, run: (n) => decidePayout(p.id, true, n) },
                  { label: 'Return', needsNote: true, run: (n) => decidePayout(p.id, false, n) },
                ]}
              />
            </Card>
          ))
        )}
      </View>
    </View>
  );
}

function Collections() {
  const colors = useColors();
  const { collections, events, refreshEvents } = useAppStore();
  const [editing, setEditing] = useState<string | null>(null);
  const upcoming = events.filter((e) => isListed(e));
  const toggle = async (cid: string, eventId: string) => {
    const c = collections.find((x) => x.id === cid);
    if (!c) return;
    const eventIds = c.eventIds.includes(eventId) ? c.eventIds.filter((x) => x !== eventId) : [...c.eventIds, eventId];
    await saveCollection({ ...c, eventIds }).catch(() => {});
    refreshEvents();
  };
  return (
    <View style={styles.list}>
      <AppText variant="footnote" muted>
        Rows on Explore. Each shows once it has at least two upcoming events.
      </AppText>
      {collections.map((c) => (
        <Card key={c.id}>
          <Pressable accessibilityRole="button" onPress={() => setEditing(editing === c.id ? null : c.id)} style={styles.inline}>
            <View style={styles.fill}>
              <AppText variant="headline">{c.title}</AppText>
              <AppText variant="subhead" muted>
                {c.subtitle || 'No subtitle'}, {c.eventIds.length} events
              </AppText>
            </View>
            <CaretRight size={18} color={colors.textMuted} style={editing === c.id ? styles.open : undefined} />
          </Pressable>
          {editing === c.id && (
            <View style={styles.chips}>
              {upcoming.map((e) => (
                <Chip key={e.id} label={e.title} selected={c.eventIds.includes(e.id)} onPress={() => toggle(c.id, e.id)} />
              ))}
            </View>
          )}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: space.lg, paddingBottom: space.xxl },
  gap: { gap: space.lg },
  list: { gap: space.sm + 4 },
  tabs: { gap: space.sm },
  card: { padding: space.md, borderRadius: radius.card, gap: space.xs },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  fill: { flex: 1 },
  bold: { fontWeight: '600', letterSpacing: 0.4 },
  tabular: { fontVariant: ['tabular-nums'] },
  inline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  empty: { paddingVertical: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  open: { transform: [{ rotate: '90deg' }] },
});
