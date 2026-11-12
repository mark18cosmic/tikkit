import { MegaphoneSimple } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { Field } from '../Field';
import { AnnouncementList } from '../AnnouncementList';
import { fetchAnnouncements, postAnnouncement } from '@/lib/api';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { useRemote } from '@/lib/useRemote';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// Message everyone holding a ticket: gates open, a change of plan, what to bring.
export function Announcements({ eventId, canPost }: { eventId: string; canPost: boolean }) {
  const colors = useColors();
  const load = useCallback(() => fetchAnnouncements([eventId]), [eventId]);
  const { data, reload } = useRemote(load);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const post = async () => {
    setNote(null);
    if (body.trim().length < 2) return;
    setBusy(true);
    try {
      await postAnnouncement(eventId, body.trim());
      successFeedback();
      setBody('');
      await reload();
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
        Announcements
      </AppText>
      {canPost && (
        <>
          <Field
            label="Message ticket holders"
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={1000}
            textAlignVertical="top"
            placeholder="Gates open at 7. Bring a light jacket for the boat."
            helper="Shows on everyone’s ticket."
            style={styles.multiline}
          />
          <Button label="Post" icon={MegaphoneSimple} variant="secondary" loading={busy} disabled={body.trim().length < 2} onPress={post} />
          {note && (
            <AppText variant="subhead" color={colors.danger}>
              {note}
            </AppText>
          )}
        </>
      )}
      {data && data.length > 0 ? (
        <AnnouncementList items={data} />
      ) : (
        <AppText variant="subhead" muted>
          No announcements yet.
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm + 4 },
  multiline: { minHeight: 90, paddingTop: space.sm + 4 },
});
