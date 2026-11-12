import { CheckCircle, ClockCountdown, IdentificationCard, WarningCircle, XCircle } from '@/components/icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import type { CheckInResult } from '@/data/tickets';
import { formatTime } from '@/lib/format';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export function CheckInResultCard({ result }: { result: CheckInResult }) {
  const colors = useColors();

  const look = {
    admitted: { icon: CheckCircle, tint: colors.success, title: 'Admitted' },
    already: { icon: WarningCircle, tint: colors.accent, title: 'Already checked in' },
    void: { icon: XCircle, tint: colors.danger, title: 'Ticket is no longer valid' },
    unknown: { icon: XCircle, tint: colors.danger, title: 'Ticket not found' },
    expired_qr: { icon: ClockCountdown, tint: colors.danger, title: 'Old QR code' },
  }[result.status];

  let body: React.ReactNode;
  if (result.status === 'unknown') {
    body = (
      <AppText variant="subhead" muted>
        Check the code with the guest. You can only check in tickets for events you run or staff.
      </AppText>
    );
  } else if (result.status === 'expired_qr') {
    body = (
      <>
        <AppText variant="headline">{result.holderName}</AppText>
        <AppText variant="subhead" muted>
          This looks like a screenshot. Ask them to open the ticket in the Tikkit app, where the code refreshes every 30 seconds.
        </AppText>
      </>
    );
  } else {
    const voidReason = result.eventCancelled
      ? 'The event was cancelled'
      : result.listedForResale
        ? 'It’s listed for resale. The holder has to take it off resale first.'
        : result.transferredToName
          ? `Transferred to ${result.transferredToName}`
          : 'Refund requested';
    body = (
      <>
        <AppText variant="headline">{result.holderName}</AppText>
        <AppText variant="subhead" muted>
          {result.tierName}, {result.eventTitle}
        </AppText>
        {result.seat && (
          <AppText variant="headline" color={look.tint}>
            {result.seat}
          </AppText>
        )}
        {result.status === 'void' && (
          <AppText variant="subhead" muted>
            {voidReason}
          </AppText>
        )}
        {result.status === 'already' && result.checkedInAt && (
          <AppText variant="subhead" muted>
            First scanned at {formatTime(result.checkedInAt)}
          </AppText>
        )}
        {result.status === 'admitted' && result.typed && (
          <View style={[styles.hint, { backgroundColor: colors.surface }]}>
            <IdentificationCard size={18} color={colors.text} />
            <AppText variant="footnote" style={styles.fill}>
              Typed code, not scanned. Check the name matches their ID.
            </AppText>
          </View>
        )}
      </>
    );
  }

  return (
    <View
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${look.title}. ${result.status !== 'unknown' ? result.holderName : ''}`}
      style={[styles.card, { backgroundColor: colors.elevated, borderColor: look.tint }]}
    >
      <look.icon size={40} color={look.tint} weight="fill" />
      <View style={styles.text}>
        <AppText variant="title3" color={look.tint}>
          {look.title}
        </AppText>
        {body}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.card, borderWidth: 2 },
  text: { flex: 1, gap: space.xxs },
  fill: { flex: 1 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: radius.control, marginTop: space.xs },
});
