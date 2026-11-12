import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImageSquare } from 'phosphor-react-native';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Cover } from './Cover';
import { Avatar } from './SettingsList';
import { tapFeedback } from '@/lib/haptics';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export type ImageKind = 'avatar' | 'banner';
export type PickedImage = { uri: string; mimeType: string };

const BANNER_RATIO = 3;

// Opens the library, then crops and shrinks the picture so uploads stay small
// (a phone photo is often 4 MB or more). iOS can only crop square in the
// picker, so banners get a centred 3:1 crop here instead.
export async function pickProfileImage(kind: ImageKind): Promise<PickedImage | null> {
  const avatar = kind === 'avatar';
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: avatar || Platform.OS === 'android',
    aspect: avatar ? [1, 1] : [BANNER_RATIO, 1],
    quality: 1,
  });
  const asset = res.canceled ? null : res.assets[0];
  if (!asset) return null;
  const original = { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' };
  const { width: w, height: h } = asset;
  // Without a known size (some browsers) there's nothing safe to crop to.
  if (!w || !h) return original;
  try {
    let cw = w;
    let ch = h;
    let origin = { originX: 0, originY: 0 };
    if (avatar && w !== h) {
      cw = ch = Math.min(w, h);
    } else if (!avatar && Math.abs(w / h - BANNER_RATIO) > 0.05) {
      cw = Math.min(w, h * BANNER_RATIO);
      ch = cw / BANNER_RATIO;
    }
    origin = { originX: Math.round((w - cw) / 2), originY: Math.round((h - ch) / 2) };
    const ctx = ImageManipulator.manipulate(asset.uri);
    if (cw !== w || ch !== h) ctx.crop({ ...origin, width: Math.round(cw), height: Math.round(ch) });
    const target = Math.min(Math.round(cw), avatar ? 600 : 1500);
    ctx.resize({ width: target, height: Math.round((ch * target) / cw) });
    const image = await (await ctx.renderAsync()).saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
    return { uri: image.uri, mimeType: 'image/jpeg' };
  } catch {
    // Upload as picked; the 5 MB limit still applies.
    return original;
  }
}

type Props = {
  name: string;
  seed: string;
  avatar?: string;
  banner?: string;
  busy?: ImageKind | null;
  onChange(kind: ImageKind): void;
  onRemove(kind: ImageKind): void;
};

// Banner with the profile photo overlapping it, as it appears on the page.
export function ProfileImagesEditor({ name, seed, avatar, banner, busy, onChange, onRemove }: Props) {
  const colors = useColors();
  const press = (kind: ImageKind) => {
    tapFeedback();
    onChange(kind);
  };
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={banner ? 'Change banner' : 'Add a banner'}
        disabled={!!busy}
        onPress={() => press('banner')}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Cover uri={banner} seed={seed} style={styles.banner} />
        <View style={[styles.bannerChip, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
          {busy === 'banner' ? <ActivityIndicator size="small" color="#FFFFFF" /> : <ImageSquare size={16} color="#FFFFFF" weight="bold" />}
          <AppText variant="footnote" color="#FFFFFF" style={styles.bold}>
            {banner ? 'Change banner' : 'Add banner'}
          </AppText>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={avatar ? 'Change profile photo' : 'Add a profile photo'}
        disabled={!!busy}
        onPress={() => press('avatar')}
        style={({ pressed }) => [styles.avatarRing, { backgroundColor: colors.background }, pressed && styles.pressed]}
      >
        <Avatar name={name} uri={avatar} size={84} />
        <View style={[styles.cameraBadge, { backgroundColor: colors.accent, borderColor: colors.background }]}>
          {busy === 'avatar' ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Camera size={16} color={colors.onAccent} weight="bold" />}
        </View>
      </Pressable>

      <View style={styles.removeRow}>
        {!!avatar && (
          <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => onRemove('avatar')} hitSlop={8}>
            <AppText variant="footnote" muted>
              Remove photo
            </AppText>
          </Pressable>
        )}
        {!!banner && (
          <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => onRemove('banner')} hitSlop={8}>
            <AppText variant="footnote" muted>
              Remove banner
            </AppText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: space.xs },
  banner: { aspectRatio: BANNER_RATIO, width: '100%', borderRadius: radius.card },
  bannerChip: {
    position: 'absolute',
    right: space.sm,
    top: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
  },
  avatarRing: { alignSelf: 'flex-start', marginTop: -46, marginLeft: space.md, padding: 4, borderRadius: radius.pill },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.md, marginTop: -space.lg, minHeight: 20 },
  bold: { fontWeight: '600' },
  pressed: { opacity: 0.85 },
});
