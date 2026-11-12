import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { CheckCircle, FileArrowUp } from 'phosphor-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { tapFeedback } from '@/lib/haptics';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export type PickedDoc = { uri: string; mimeType?: string };

// A photo of a document, picked from the library. Documents never leave the
// private bucket; only the person and Tikkit's reviewers can open them.
export function DocPicker({ label, hint, value, onChange, error }: { label: string; hint: string; value: PickedDoc | null; onChange: (d: PickedDoc | null) => void; error?: string }) {
  const colors = useColors();
  const pick = async () => {
    tapFeedback();
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    const asset = res.canceled ? null : res.assets[0];
    if (asset) onChange({ uri: asset.uri, mimeType: asset.mimeType ?? undefined });
  };
  return (
    <View style={styles.wrap}>
      <AppText variant="subhead" style={styles.label}>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}, added. Change` : `Add ${label}`}
        onPress={pick}
        style={({ pressed }) => [
          styles.tile,
          { backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border },
          pressed && { opacity: 0.8 },
        ]}
      >
        {value ? (
          <>
            <Image source={{ uri: value.uri }} style={styles.thumb} contentFit="cover" />
            <View style={styles.fill}>
              <View style={styles.row}>
                <CheckCircle size={18} color={colors.success} weight="fill" />
                <AppText variant="headline">Added</AppText>
              </View>
              <AppText variant="footnote" muted>
                Tap to choose a different photo
              </AppText>
            </View>
          </>
        ) : (
          <>
            <View style={[styles.icon, { backgroundColor: colors.background }]}>
              <FileArrowUp size={22} color={colors.accent} />
            </View>
            <View style={styles.fill}>
              <AppText variant="headline">Add a photo</AppText>
              <AppText variant="footnote" muted>
                {hint}
              </AppText>
            </View>
          </>
        )}
      </Pressable>
      {error && (
        <AppText variant="footnote" color={colors.danger}>
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs + 2 },
  label: { fontWeight: '600' },
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm + 4, borderRadius: radius.control, borderWidth: 1.5, borderStyle: 'dashed' },
  thumb: { width: 56, height: 56, borderRadius: radius.control - 4 },
  icon: { width: 56, height: 56, borderRadius: radius.control - 4, alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1, gap: space.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
