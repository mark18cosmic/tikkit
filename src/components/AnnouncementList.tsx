import { CalendarX, ClockClockwise, MegaphoneSimple } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import type { Announcement } from '@/data/community';
import { formatWhen } from '@/lib/format';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

const icons = { message: MegaphoneSimple, rescheduled: ClockClockwise, cancelled: CalendarX };
const titles = { message: 'From the organiser', rescheduled: 'Time changed', cancelled: 'Event cancelled' };

export function AnnouncementList({ items }: { items: Announcement[] }) {
  const colors = useColors();
  return (
    <View style={styles.list}>
      {items.map((a) => {
        const IconCmp = icons[a.kind];
        const tint = a.kind === 'cancelled' ? colors.danger : colors.accent;
        return (
          <View key={a.id} style={[styles.item, { backgroundColor: colors.surface }]}>
            <IconCmp size={20} color={tint} weight="bold" />
            <View style={styles.fill}>
              <AppText variant="subhead" color={tint} style={styles.bold}>
                {titles[a.kind]}
              </AppText>
              <AppText>{a.body}</AppText>
              <AppText variant="footnote" muted>
                {formatWhen(a.createdAt)}
              </AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, gap: space.xxs },
  bold: { fontWeight: '600' },
  list: { gap: space.sm },
  item: { flexDirection: 'row', gap: space.sm + 4, padding: space.md, borderRadius: radius.control },
});
