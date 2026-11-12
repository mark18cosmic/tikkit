import { router } from 'expo-router';
import { ArrowDown, ArrowUp, Bank, ClockCountdown, LockSimple, Wallet as WalletIcon } from '@/components/icons';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { usePullRefresh } from '@/components/PullRefresh';
import { Heading } from '@/components/SettingsList';
import { SignInRequired } from '@/components/SignInRequired';
import { Bone } from '@/components/Skeleton';
import { banks, type Balance, type LedgerLine, type Payout, type Wallet as WalletData } from '@/data/money';
import { confirm } from '@/lib/confirm';
import { formatAmount, formatDay } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { fetchWallet, requestPayout, setPayoutAccount } from '@/lib/market';
import { useRemote } from '@/lib/useRemote';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function WalletScreen() {
  return (
    <SignInRequired title="Sign in to see your wallet" body="Money from ticket sales, rentals and resale collects here.">
      <Wallet />
    </SignInRequired>
  );
}

const kindLabel: Record<string, string> = {
  sale: 'Ticket sales',
  commission: 'Promoter commission',
  resale: 'Resale',
  rental: 'Space rental',
  payout: 'Withdrawal',
  reversal: 'Reversed',
  adjustment: 'Adjustment',
};

function Wallet() {
  const colors = useColors();
  const { status } = useAppStore();
  const load = useCallback(() => fetchWallet(), []);
  const { data, error, reload } = useRemote(load);
  const refresh = usePullRefresh(reload, { failed: !!error });
  const [editing, setEditing] = useState(false);

  if (!data) {
    if (error) return <EmptyState icon={WalletIcon} title="Can’t load your wallet" body={error} action={{ label: 'Try again', onPress: reload }} />;
    return (
      <Container style={styles.loading}>
        <Bone height={140} />
        <Bone height={56} />
        <Bone height={56} />
      </Container>
    );
  }
  const { wallet, lines, payouts } = data;
  const anyHeld = wallet.balances.some((b) => b.held !== 0);

  return (
    <ScrollView contentContainerStyle={styles.scroll} refreshControl={refresh.control} onScroll={refresh.onScroll} scrollEventThrottle={refresh.scrollEventThrottle}>
      <Container style={styles.gap}>
        {wallet.balances.map((b) => (
          <BalanceCard key={b.currency} balance={b} wallet={wallet} payouts={payouts} verified={!!status?.verified} onDone={reload} />
        ))}
        {anyHeld && (
          <AppText variant="footnote" muted>
            Money on hold is from an event with open reports. It’s released once our team has looked, usually within 2 days.
          </AppText>
        )}

        <View>
          <Heading action={wallet.account && !editing ? <Button label="Change" variant="plain" onPress={() => setEditing(true)} /> : undefined}>
            Bank account
          </Heading>
          {wallet.account && !editing ? (
            <View style={[styles.account, { backgroundColor: colors.surface }]}>
              <Bank size={22} color={colors.text} />
              <View style={styles.fill}>
                <AppText variant="headline">{wallet.account.accountName}</AppText>
                <AppText variant="subhead" muted>
                  {wallet.account.bank} {wallet.account.accountNumber}
                  {wallet.account.usdAccountNumber ? `, USD ${wallet.account.usdAccountNumber}` : ''}
                </AppText>
              </View>
            </View>
          ) : (
            <AccountForm
              onSaved={() => {
                setEditing(false);
                reload();
              }}
              onCancel={wallet.account ? () => setEditing(false) : undefined}
            />
          )}
        </View>

        {payouts.length > 0 && (
          <View>
            <Heading>Withdrawals</Heading>
            <View style={[styles.list, { backgroundColor: colors.surface }]}>
              {payouts.map((p, i) => (
                <PayoutRow key={p.id} p={p} divider={i > 0} />
              ))}
            </View>
          </View>
        )}

        <View>
          <Heading>Activity</Heading>
          {lines.length === 0 ? (
            <View style={styles.empty}>
              <AppText variant="subhead" muted>
                Sales, rentals and resale show up here.
              </AppText>
              <Button label="Create an event" variant="secondary" onPress={() => router.push('/organiser/new')} />
            </View>
          ) : (
            <View style={[styles.list, { backgroundColor: colors.surface }]}>
              {lines.map((l, i) => (
                <LineRow key={l.id} l={l} divider={i > 0} />
              ))}
            </View>
          )}
        </View>
      </Container>
    </ScrollView>
  );
}

// One currency's balance. Dollars and rufiyaa are withdrawn separately, each
// to an account in that currency.
function BalanceCard({
  balance: b,
  wallet,
  payouts,
  verified,
  onDone,
}: {
  balance: Balance;
  wallet: WalletData;
  payouts: Payout[];
  verified: boolean;
  onDone: () => Promise<unknown> | void;
}) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const money = (n: number) => formatAmount(n, b.currency);
  const usd = b.currency === 'USD';
  const account = wallet.account;
  const toNumber = usd ? account?.usdAccountNumber : account?.accountNumber;
  const pendingPayout = payouts.find((p) => p.status === 'requested' && p.currency === b.currency);
  const canWithdraw = b.available >= b.minPayout && !!toNumber && !pendingPayout && verified;

  const withdraw = () =>
    confirm(
      `Withdraw ${money(b.available)}?`,
      `It goes to ${account?.bank} ${toNumber}, usually within 2 working days.`,
      'Withdraw',
      async () => {
        setFailure(null);
        setBusy(true);
        try {
          await requestPayout(b.currency);
          successFeedback();
          await onDone();
        } catch (e) {
          errorFeedback();
          setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
        } finally {
          setBusy(false);
        }
      },
    );

  return (
    <View style={[styles.balance, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
      <AppText variant="subhead" muted>
        {usd ? 'US dollars available' : 'Available to withdraw'}
      </AppText>
      <AppText variant="largeTitle" style={styles.tabular}>
        {money(b.available)}
      </AppText>
      <View style={styles.split}>
        <Mini icon={ClockCountdown} label="After the event" value={money(b.pending)} />
        {b.held !== 0 && <Mini icon={LockSimple} label="On hold" value={money(b.held)} danger />}
      </View>
      {pendingPayout ? (
        <AppText variant="subhead" color={colors.accent} style={styles.bold}>
          {money(pendingPayout.amount)} on its way to your bank
        </AppText>
      ) : (
        <Button label={usd ? 'Withdraw dollars' : 'Withdraw'} icon={Bank} loading={busy} disabled={!canWithdraw} onPress={withdraw} />
      )}
      {!pendingPayout && !canWithdraw && (
        <AppText variant="footnote" muted>
          {!verified
            ? 'Get verified to withdraw.'
            : !account
              ? 'Add your bank account below to withdraw.'
              : !toNumber
                ? 'Add a USD account number below to withdraw dollars.'
                : `You can withdraw once at least ${money(b.minPayout)} is available.`}
        </AppText>
      )}
      {failure && (
        <AppText variant="footnote" color={colors.danger}>
          {failure}
        </AppText>
      )}
    </View>
  );
}

function Mini({ icon: IconCmp, label, value, danger }: { icon: typeof Bank; label: string; value: string; danger?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.mini}>
      <IconCmp size={16} color={danger ? colors.danger : colors.textMuted} />
      <AppText variant="footnote" muted>
        {label}
      </AppText>
      <AppText variant="footnote" style={[styles.bold, styles.tabular]} color={danger ? colors.danger : undefined}>
        {value}
      </AppText>
    </View>
  );
}

function AccountForm({ onSaved, onCancel }: { onSaved: () => void; onCancel?: () => void }) {
  const colors = useColors();
  const [bank, setBank] = useState<(typeof banks)[number]>('BML');
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [usdNumber, setUsdNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const save = async () => {
    setFailure(null);
    setBusy(true);
    try {
      await setPayoutAccount(bank, name, number, usdNumber.trim());
      successFeedback();
      onSaved();
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.form}>
      <View style={styles.chips}>
        {banks.map((b) => (
          <Chip key={b} label={b} selected={bank === b} onPress={() => setBank(b)} />
        ))}
      </View>
      <Field label="Name on the account" value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="Account number (MVR)" value={number} onChangeText={setNumber} keyboardType="number-pad" />
      <Field
        label="USD account number (optional)"
        value={usdNumber}
        onChangeText={setUsdNumber}
        keyboardType="number-pad"
        helper="Needed only if you sell tickets in US dollars. For your safety, withdrawals pause for 48 hours after a change."
      />
      {failure && (
        <AppText variant="footnote" color={colors.danger}>
          {failure}
        </AppText>
      )}
      <View style={styles.row}>
        {onCancel && <Button label="Cancel" variant="plain" onPress={onCancel} />}
        <Button label="Save account" loading={busy} onPress={save} style={styles.fill} />
      </View>
    </View>
  );
}

function PayoutRow({ p, divider }: { p: Payout; divider: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.line, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      <View style={styles.fill}>
        <AppText variant="subhead" style={styles.bold}>
          {p.status === 'paid' ? 'Sent' : p.status === 'rejected' ? 'Returned' : 'Requested'}
        </AppText>
        <AppText variant="footnote" muted>
          {formatDay(p.createdAt)}
          {p.status === 'rejected' && p.note ? `. ${p.note}` : p.bankRef ? `. Ref ${p.bankRef}` : ''}
        </AppText>
      </View>
      <AppText variant="subhead" style={[styles.bold, styles.tabular]}>
        {formatAmount(p.amount, p.currency)}
      </AppText>
    </View>
  );
}

function LineRow({ l, divider }: { l: LedgerLine; divider: boolean }) {
  const colors = useColors();
  const credit = l.amount > 0;
  const later = credit && new Date(l.availableAt) > new Date();
  return (
    <View style={[styles.line, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      <View style={[styles.lineIcon, { backgroundColor: colors.background }]}>
        {credit ? <ArrowDown size={16} color={colors.success} weight="bold" /> : <ArrowUp size={16} color={colors.text} weight="bold" />}
      </View>
      <View style={styles.fill}>
        <AppText variant="subhead" style={styles.bold} numberOfLines={1}>
          {l.memo || kindLabel[l.kind] || l.kind}
        </AppText>
        <AppText variant="footnote" muted>
          {kindLabel[l.kind] ?? l.kind}, {formatDay(l.createdAt)}
          {later ? `. Available ${formatDay(l.availableAt)}` : ''}
        </AppText>
      </View>
      <AppText variant="subhead" color={credit ? colors.success : colors.text} style={[styles.bold, styles.tabular]}>
        {credit ? '+' : '−'}
        {formatAmount(Math.abs(l.amount), l.currency)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: space.lg, paddingBottom: space.xxl },
  loading: { gap: space.md, paddingTop: space.lg },
  gap: { gap: space.md },
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  tabular: { fontVariant: ['tabular-nums'] },
  balance: { padding: space.lg, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, gap: space.sm },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.sm },
  mini: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  account: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.control },
  form: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  list: { borderRadius: radius.control, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm + 4 },
  lineIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  empty: { gap: space.sm },
});
