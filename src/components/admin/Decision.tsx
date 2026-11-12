import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

type Action = { label: string; run: (note: string) => Promise<unknown>; needsNote?: boolean; destructive?: boolean };

// A note field and up to three decisions. Decisions that need a reason stay
// disabled until there is one, so every rejection tells the person why.
export function Decision({ actions, placeholder, onDone }: { actions: Action[]; placeholder: string; onDone: () => void }) {
  const colors = useColors();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const go = async (a: Action) => {
    setFailure(null);
    setBusy(a.label);
    try {
      await a.run(note.trim());
      successFeedback();
      setNote('');
      onDone();
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={styles.wrap}>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={placeholder}
        multiline
        style={[styles.input, type.subhead, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
      />
      <View style={styles.row}>
        {actions.map((a, i) => (
          <Button
            key={a.label}
            label={a.label}
            variant={i === 0 ? 'primary' : 'secondary'}
            loading={busy === a.label}
            disabled={!!busy || (a.needsNote && note.trim().length < 2)}
            onPress={() => go(a)}
            style={styles.btn}
          />
        ))}
      </View>
      {failure && (
        <AppText variant="footnote" color={colors.danger}>
          {failure}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginTop: space.sm },
  input: { minHeight: 44, borderRadius: radius.control, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.sm + 4, paddingVertical: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  btn: { flexGrow: 1, minHeight: 44, paddingVertical: space.sm },
});
