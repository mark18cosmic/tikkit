import { router, useLocalSearchParams } from 'expo-router';
import { ArrowsLeftRight, CaretLeft, CaretRight, InstagramLogo, NavigationArrow, Receipt, SmileySad } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { AnnouncementList } from '@/components/AnnouncementList';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/IconButton';
import { LiveQR } from '@/components/LiveQR';
import { ResalePanel } from '@/components/ResalePanel';
import { RateOrganizer } from '@/components/Trust';
import { SignInRequired } from '@/components/SignInRequired';
import { isPast, startsAfter } from '@/data/events';
import { confirm } from '@/lib/confirm';
import { formatLongDay, formatTime } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { openDirections } from '@/lib/maps';
import { ticketStatus, useAppStore } from '@/store/AppStore';
import { toast } from '@/lib/dialog';
import { OrganizerCard } from '@/components/OrganizerCard';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function TicketScreenGate() {
  return (
    <SignInRequired title="Sign in to see this ticket" body="Tickets are kept in your account.">
      <TicketScreen />
    </SignInRequired>
  );
}

function TicketScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { tickets, ticketsState, getEvent, requestRefund, announcements, markUpdatesSeen, secrets } = useAppStore();
  const colors = useColors();
  const [failure, setFailure] = useState<string | null>(null);
  const ticket = tickets.find((t) => t.code === code);
  const event = ticket && getEvent(ticket.eventId);
  const updates = event ? announcements.filter((a) => a.eventId === event.id) : [];
  // Opening the ticket counts as reading its updates.
  const latestUpdate = updates[0]?.createdAt;
  useEffect(() => {
    if (event && latestUpdate) markUpdatesSeen(event.id);
  }, [event, latestUpdate, markUpdatesSeen]);

  if (!ticket || !event) {
    if (ticketsState === 'loading' || ticketsState === 'idle') return null;
    return <EmptyState icon={SmileySad} title="Ticket not found" body="It isn’t in the account you’re signed in to." />;
  }
  const tier = event.tiers.find((t) => t.id === ticket.tierId);
  const state = ticketStatus(ticket);
  const usable = state === 'active' && !isPast(event) && event.status !== 'cancelled' && !ticket.listedForResale;
  const refundable = state === 'active' && !isPast(event) && !ticket.listedForResale;
  const resellable = state === 'active' && event.status !== 'cancelled' && startsAfter(event, 3_600_000);
  // Other tickets bought in the same order, so a group can flip through them.
  const siblings = tickets
    .filter((t) => t.orderId === ticket.orderId)
    .sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt) || a.code.localeCompare(b.code));
  const index = siblings.findIndex((t) => t.code === ticket.code);
  const go = (i: number) => router.setParams({ code: siblings[i].code });

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Container style={styles.gap}>
        {siblings.length > 1 && (
          <View style={styles.pager}>
            <IconButton icon={CaretLeft} accessibilityLabel="Previous ticket" disabled={index <= 0} style={index <= 0 && styles.off} onPress={() => go(index - 1)} />
            <AppText variant="headline" style={styles.pagerText} accessibilityLiveRegion="polite">
              Ticket {index + 1} of {siblings.length}
            </AppText>
            <IconButton
              icon={CaretRight}
              accessibilityLabel="Next ticket"
              disabled={index >= siblings.length - 1}
              style={index >= siblings.length - 1 && styles.off}
              onPress={() => go(index + 1)}
            />
          </View>
        )}
        <View style={[styles.pass, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
          <AppText variant="footnote" color={colors.accent} style={styles.bold}>
            {formatLongDay(event.startsAt)}, {formatTime(event.startsAt)}
          </AppText>
          <AppText variant="title2" accessibilityRole="header">
            {event.title}
          </AppText>
          <AppText variant="subhead" muted>
            {event.venue.name}, {event.venue.address}
          </AppText>

          {state === 'transferred' || state === 'refundRequested' ? (
            <View style={[styles.voidBox, { backgroundColor: colors.surface }]}>
              <AppText variant="headline">
                {state === 'transferred' ? `Sent to ${ticket.transferredTo?.name}` : 'Refund requested'}
              </AppText>
              <AppText variant="subhead" muted style={styles.center}>
                {state === 'transferred'
                  ? `This ticket now belongs to ${ticket.transferredTo?.email}. The QR code here no longer works.`
                  : 'The organiser will review your request. This ticket can no longer be used.'}
              </AppText>
            </View>
          ) : (
            <>
              <LiveQR code={ticket.code} secret={secrets[ticket.code]} />
              <AppText variant="title3" selectable style={styles.code}>
                {ticket.code}
              </AppText>
              {ticket.checkedInAt ? (
                <AppText variant="subhead" color={colors.success} style={[styles.center, styles.bold]}>
                  Checked in at {formatTime(ticket.checkedInAt)}
                </AppText>
              ) : (
                <AppText variant="subhead" muted style={styles.center}>
                  Turn your brightness up at the door.
                </AppText>
              )}
            </>
          )}

          <View style={[styles.rule, { borderColor: colors.border }]} />
          <Detail label="Name" value={ticket.holderName} />
          <Detail label="Ticket" value={tier?.name ?? 'General'} />
          {ticket.seatLabel && <Detail label="Seat" value={ticket.seatLabel} />}
          <Detail label="Organiser" value={event.organizer} />
          <Detail label="Order" value={`#${ticket.orderId.slice(0, 8).toUpperCase()}`} />
        </View>

        {event.organizerId && event.organizerSlug ? (
          <OrganizerCard
            org={{ id: event.organizerId, slug: event.organizerSlug, name: event.organizer, avatar: event.organizerAvatar, verified: event.organizerVerified }}
            label="Hosted by"
            detail="Questions about the event? See their page"
          />
        ) : null}

        {updates.length > 0 && (
          <View style={styles.updates}>
            <AppText variant="title3" accessibilityRole="header">
              Updates
            </AppText>
            <AnnouncementList items={updates} />
          </View>
        )}

        {ticket.checkedInAt && isPast(event) && event.organizerId && <RateOrganizer eventId={event.id} organizer={event.organizer} />}

        <View style={styles.actions}>
          {usable && (
            <Button
              label="Share that you’re going"
              icon={InstagramLogo}
              variant="secondary"
              onPress={() => router.push({ pathname: '/story/[id]', params: { id: event.id } })}
            />
          )}
          <Button label="Directions" icon={NavigationArrow} variant="secondary" onPress={() => openDirections(event.venue)} />
          {usable && (
            <Button
              label="Transfer to a friend"
              icon={ArrowsLeftRight}
              variant="secondary"
              onPress={() => router.push({ pathname: '/transfer/[code]', params: { code: ticket.code } })}
            />
          )}
          {resellable && <ResalePanel ticket={ticket} facePrice={tier?.price ?? 0} currency={event.currency} />}
          {refundable && (
            <Button
              label="Request a refund"
              icon={Receipt}
              variant="plain"
              onPress={() =>
                confirm('Request a refund?', 'Your ticket stops working as soon as you request a refund.', 'Request refund', () => {
                  setFailure(null);
                  requestRefund(ticket.code).then(() => {
                    successFeedback();
                    toast('Refund requested. We’ll let you know when it’s sent.');
                  }, (e: Error) => {
                    errorFeedback();
                    setFailure(e.message);
                  });
                })
              }
            />
          )}
          {failure && (
            <AppText variant="subhead" color={colors.danger} accessibilityLiveRegion="polite">
              {failure}
            </AppText>
          )}
        </View>
      </Container>
    </ScrollView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <AppText variant="subhead" muted>
        {label}
      </AppText>
      <AppText variant="subhead" style={[styles.bold, styles.value]} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  updates: { gap: space.sm },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pagerText: { fontVariant: ['tabular-nums'] },
  off: { opacity: 0.35 },
  scroll: { paddingVertical: space.lg },
  gap: { gap: space.lg },
  pass: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.xs },
  code: { textAlign: 'center', marginTop: space.md, letterSpacing: 2, fontVariant: ['tabular-nums'] },
  voidBox: { marginTop: space.lg, padding: space.lg, borderRadius: radius.control, alignItems: 'center', gap: space.xs },
  center: { textAlign: 'center' },
  bold: { fontWeight: '600' },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: space.md },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: space.xs },
  value: { flexShrink: 1, textAlign: 'right' },
  actions: { gap: space.sm },
});
