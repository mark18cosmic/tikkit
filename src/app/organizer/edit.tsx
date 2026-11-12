import { router, useLocalSearchParams } from 'expo-router';
import { UsersThree } from '@/components/icons';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { pickProfileImage, ProfileImagesEditor, type ImageKind, type PickedImage } from '@/components/ProfileImagesEditor';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { SignInRequired } from '@/components/SignInRequired';
import type { Organizer } from '@/data/community';
import { fetchMyOrganizers, removeProfileImage, setOrganizerImages, updateOrganizer, uploadPhoto } from '@/lib/api';
import { PROFILE_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { toast } from '@/lib/dialog';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { useRemote } from '@/lib/useRemote';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function EditOrganizerScreen() {
  return (
    <SignInRequired title="Sign in to edit your page" body="Only the account that runs an organiser page can change it.">
      <EditOrganizer />
    </SignInRequired>
  );
}

function EditOrganizer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const colors = useColors();
  const load = useCallback(async () => (userId ? (await fetchMyOrganizers(userId)).find((o) => o.id === id) ?? null : null), [userId, id]);
  const { data } = useRemote(load);
  if (data === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  if (!data) return <EmptyState icon={UsersThree} title="Not your page" body="Only the account that runs an organiser page can change it." />;
  return <Form org={data} />;
}

// Pictures are picked here and only uploaded on Save, so backing out changes nothing.
type Slot = { kind: 'keep' } | { kind: 'new'; image: PickedImage } | { kind: 'remove' };

function Form({ org }: { org: Organizer }) {
  const colors = useColors();
  const { userId } = useAuth();
  const [avatar, setAvatar] = useState<Slot>({ kind: 'keep' });
  const [banner, setBanner] = useState<Slot>({ kind: 'keep' });
  const shown = (slot: Slot, current?: string) => (slot.kind === 'new' ? slot.image.uri : slot.kind === 'remove' ? undefined : current);
  const pick = async (kind: ImageKind) => {
    setFailure(null);
    try {
      const image = await pickProfileImage(kind);
      if (image) (kind === 'avatar' ? setAvatar : setBanner)({ kind: 'new', image });
    } catch {
      setFailure('That picture couldn’t be opened. Choose another one.');
    }
  };
  const resolve = async (slot: Slot, current?: string) =>
    slot.kind === 'new' && userId ? uploadPhoto(userId, slot.image.uri, slot.image.mimeType, PROFILE_BUCKET) : slot.kind === 'remove' ? undefined : current;
  const [name, setName] = useState(org.name);
  const [bio, setBio] = useState(org.bio);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const nameError = name.trim().length < 2 ? 'Enter a name of at least 2 characters.' : undefined;

  const save = async () => {
    setFailure(null);
    if (nameError) return errorFeedback();
    setSaving(true);
    try {
      await updateOrganizer(org.id, name.trim(), bio.trim());
      if (avatar.kind !== 'keep' || banner.kind !== 'keep') {
        const [avatarPath, bannerPath] = await Promise.all([resolve(avatar, org.avatarPath), resolve(banner, org.bannerPath)]);
        await setOrganizerImages(org.id, avatarPath, bannerPath);
        if (avatar.kind !== 'keep') removeProfileImage(org.avatarPath);
        if (banner.kind !== 'keep') removeProfileImage(org.bannerPath);
      }
      successFeedback();
      toast('Page updated');
      router.back();
    } catch (e) {
      errorFeedback();
      setFailure(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setSaving(false);
    }
  };

  return (
    <KeyboardScreen
      footer={
        <Container>
          <Button label="Save" loading={saving} onPress={save} />
        </Container>
      }
    >
      <Container style={styles.gap}>
        <ProfileImagesEditor
          name={name || org.name}
          seed={org.slug}
          avatar={shown(avatar, org.avatar)}
          banner={shown(banner, org.banner)}
          onChange={pick}
          onRemove={(kind) => (kind === 'avatar' ? setAvatar : setBanner)({ kind: 'remove' })}
        />
        <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={80} error={nameError} />
        <Field
          label="About"
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={1000}
          textAlignVertical="top"
          placeholder="What kind of events you run, and where."
          helper="Shown on your organiser page. Renaming also updates your events."
          style={styles.multiline}
        />
        {failure && (
          <AppText variant="subhead" color={colors.danger} accessibilityLiveRegion="polite">
            {failure}
          </AppText>
        )}
      </Container>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gap: { gap: space.lg },
  multiline: { minHeight: 140, paddingTop: space.sm + 4 },
});
