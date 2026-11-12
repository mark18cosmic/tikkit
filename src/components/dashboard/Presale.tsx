import { router } from 'expo-router';
import { Crown, Repeat } from '@/components/icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { inPresale, isListed, type EventItem } from '@/data/events';
import { formatDay, formatWhen } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { setPublicSale } from '@/lib/market';
import { useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// General sale opens N days from now, but at least a day before the event.
function presaleEnd(days: number, startsAt: string) {
  const end = Math.min(Date.now() + days * 86_400_000, new Date(startsAt).getTime() - 86_400_000);
  if (end <= Date.now() + 3_600_000) throw new Error('It’s too close to the event for a presale.');
  return new Date(end).toISOString();
}

// Members-only presale for this date, and the other dates in its series.
export function Presale({ event }: { event: EventItem }) {
  const colors = useColors();
  const { loadEvent, events } = useAppStore();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const on = inPresale(event);
  const series = event.seriesId ? events.filter((e) => e.seriesId === event.seriesId).sort((a, b) => a.startsAt.localeCompare(b.startsAt)) : [];

  const set = async (days: number | null) => {
    setFailure(null);
    setBusy(true);
    try {
      await setPublicSale(event.id, days ? presaleEnd(days, event.startsAt) : null);
      await loadEvent(event.id);
      successFeedback();
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
        Presale
      </AppText>
      {on ? (
        <View style={[styles.item, { backgroundColor: colors.surface }]}>
          <Crown size={22} color={colors.accent} weight="fill" />
          <View style={styles.fill}>
            <AppText variant="headline">Members only until {formatWhen(event.publicSaleAt!)}</AppText>
            <AppText variant="subhead" muted>
              Then anyone can buy.
            </AppText>
          </View>
        </View>
      ) : (
        <AppText variant="subhead" muted>
          Give your members a head start. Only they can buy until general sale opens.
        </AppText>
      )}
      <View style={styles.chips}>
        {on ? (
          <Button label="Open general sale now" variant="secondary" loading={busy} onPress={() => set(null)} />
        ) : (
          [1, 3, 7].map((d) => <Chip key={d} label={`${d} ${d === 1 ? 'day' : 'days'} for members`} selected={false} onPress={() => set(d)} />)
        )}
      </View>
      {event.organizerId && (
        <Button label="Set up your membership" icon={Crown} variant="plain" onPress={() => router.push({ pathname: '/organizer/membership', params: { id: event.organizerId! } })} style={styles.left} />
      )}
      {failure && (
        <AppText variant="footnote" color={colors.danger}>
          {failure}
        </AppText>
      )}

      {series.length > 1 && (
        <View style={styles.seriesWrap}>
          <View style={styles.row}>
            <Repeat size={18} color={colors.text} />
            <AppText variant="headline">Part of a series of {series.length} dates</AppText>
          </View>
          <View style={styles.chips}>
            {series.map((d) => (
              <Chip
                key={d.id}
                label={`${formatDay(d.startsAt)}${d.status === 'cancelled' ? ' (cancelled)' : !isListed(d) && d.listing !== 'approved' ? ' (in review)' : ''}`}
                selected={d.id === event.id}
                onPress={() => d.id !== event.id && router.replace({ pathname: '/organiser/[id]', params: { id: d.id } })}
              />
            ))}
          </View>
          <AppText variant="footnote" muted>
            Each date has its own tickets, guest list and edits.
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm + 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.control },
  fill: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  left: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  seriesWrap: { gap: space.sm, marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
