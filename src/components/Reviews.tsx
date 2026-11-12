import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { Field } from './Field';
import { Stars } from './Stars';
import { averageRating, type Review } from '@/data/community';
import { replyReview, reviewBooking } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// Reviews on a space's page. Owners can answer each one.
export function ReviewList({ reviews, canReply, onChanged }: { reviews: Review[]; canReply: boolean; onChanged: () => void }) {
  const colors = useColors();
  if (reviews.length === 0) {
    return (
      <AppText variant="subhead" muted>
        No reviews yet. Organisers can review a space after their booking.
      </AppText>
    );
  }
  const avg = averageRating(reviews);
  return (
    <View style={styles.list}>
      <View style={styles.summary}>
        <AppText variant="title2">{avg.toFixed(1)}</AppText>
        <View>
          <Stars value={avg} />
          <AppText variant="footnote" muted>
            {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
          </AppText>
        </View>
      </View>
      {reviews.map((r) => (
        <View key={r.id} style={[styles.item, { backgroundColor: colors.surface }]}>
          <View style={styles.head}>
            <AppText variant="headline" style={styles.fill}>
              {r.authorName}
            </AppText>
            <Stars value={r.rating} size={14} />
          </View>
          {!!r.body && <AppText>{r.body}</AppText>}
          <AppText variant="footnote" muted>
            {formatDay(r.createdAt)}
          </AppText>
          {r.reply ? (
            <View style={[styles.reply, { borderColor: colors.border }]}>
              <AppText variant="footnote" muted style={styles.bold}>
                Owner replied
              </AppText>
              <AppText>{r.reply}</AppText>
            </View>
          ) : (
            canReply && <ReplyBox reviewId={r.id} onDone={onChanged} />
          )}
        </View>
      ))}
    </View>
  );
}

function ReplyBox({ reviewId, onDone }: { reviewId: string; onDone: () => void }) {
  const colors = useColors();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const send = async () => {
    setBusy(true);
    setNote(null);
    try {
      await replyReview(reviewId, text.trim());
      successFeedback();
      onDone();
    } catch (e) {
      errorFeedback();
      setNote(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };
  return (
    <View style={styles.replyBox}>
      <Field label="Reply" value={text} onChangeText={setText} multiline maxLength={1000} textAlignVertical="top" style={styles.multiline} />
      <Button label="Post reply" variant="secondary" loading={busy} disabled={text.trim().length < 2} onPress={send} />
      {note && (
        <AppText variant="footnote" color={colors.danger}>
          {note}
        </AppText>
      )}
    </View>
  );
}

// Shown on a finished booking until the organiser has reviewed the space.
export function ReviewForm({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const colors = useColors();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const send = async () => {
    if (rating === 0) {
      errorFeedback();
      setNote('Choose from 1 to 5 stars.');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      await reviewBooking(bookingId, rating, body.trim());
      successFeedback();
      onDone();
    } catch (e) {
      errorFeedback();
      setNote(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };
  return (
    <View style={[styles.form, { borderColor: colors.border }]}>
      <AppText variant="headline">How was the space?</AppText>
      <Stars value={rating} size={30} onChange={setRating} />
      <Field
        label="Review (optional)"
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={1000}
        textAlignVertical="top"
        placeholder="Sound, access, how the owner was to deal with."
        helper="Shown on the space’s page with your name."
        style={styles.multiline}
      />
      <Button label="Post review" loading={busy} onPress={send} />
      {note && (
        <AppText variant="footnote" color={colors.danger}>
          {note}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  list: { gap: space.sm + 4 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  item: { padding: space.md, borderRadius: radius.control, gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  reply: { borderLeftWidth: 3, paddingLeft: space.sm + 4, marginTop: space.sm, gap: space.xxs },
  replyBox: { gap: space.sm, marginTop: space.sm },
  form: { gap: space.md, padding: space.md, borderRadius: radius.control, borderWidth: StyleSheet.hairlineWidth },
  multiline: { minHeight: 90, paddingTop: space.sm + 4 },
});
