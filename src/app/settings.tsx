import Constants from 'expo-constants';
import { Bell, FileText, Lifebuoy, LockKey, SignOut, Trash } from '@/components/icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Container } from '@/components/Container';
import { Field } from '@/components/Field';
import { pickProfileImage, ProfileImagesEditor, type ImageKind } from '@/components/ProfileImagesEditor';
import { AppearancePicker, Group, Heading, listStyles, Row } from '@/components/SettingsList';
import { deleteAccount, removeProfileImage, uploadPhoto } from '@/lib/api';
import { signOut, updateDisplayName, updateProfileImages, useAuth } from '@/lib/auth';
import { PROFILE_BUCKET } from '@/lib/supabase';
import { confirm } from '@/lib/confirm';
import { toast } from '@/lib/dialog';
import { errorFeedback, successFeedback, tapFeedback } from '@/lib/haptics';
import { clearAccountCache, useAppStore } from '@/store/AppStore';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// Everything you set once and rarely touch. Day-to-day things live on Account.
export default function Settings() {
  const colors = useColors();
  const store = useAppStore();
  const { session, userId, email, displayName, avatarPath, bannerPath, avatarUrl, bannerUrl, reloadProfile } = useAuth();
  const [imageBusy, setImageBusy] = useState<ImageKind | null>(null);
  const [imageNote, setImageNote] = useState<string | null>(null);

  const changeImage = async (kind: ImageKind) => {
    if (!userId) return;
    setImageNote(null);
    try {
      const picked = await pickProfileImage(kind).catch(() => {
        throw new Error('That picture couldn’t be opened. Choose another one.');
      });
      if (!picked) return;
      setImageBusy(kind);
      const path = await uploadPhoto(userId, picked.uri, picked.mimeType, PROFILE_BUCKET);
      await updateProfileImages(userId, kind === 'avatar' ? { avatarPath: path } : { bannerPath: path });
      removeProfileImage(kind === 'avatar' ? avatarPath : bannerPath);
      reloadProfile();
      successFeedback();
      toast(kind === 'avatar' ? 'Profile photo updated' : 'Banner updated');
    } catch (e) {
      errorFeedback();
      setImageNote(e instanceof Error ? e.message : 'That picture didn’t save. Try again.');
    } finally {
      setImageBusy(null);
    }
  };

  const removeImage = async (kind: ImageKind) => {
    if (!userId) return;
    setImageNote(null);
    setImageBusy(kind);
    try {
      await updateProfileImages(userId, kind === 'avatar' ? { avatarPath: null } : { bannerPath: null });
      removeProfileImage(kind === 'avatar' ? avatarPath : bannerPath);
      reloadProfile();
    } catch (e) {
      errorFeedback();
      setImageNote(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setImageBusy(null);
    }
  };
  const [reminderNote, setReminderNote] = useState<string | null>(null);
  const [accountNote, setAccountNote] = useState<string | null>(null);
  // Null until edited, so it follows the profile name as that loads.
  const [nameInput, setName] = useState<string | null>(null);
  const name = nameInput ?? displayName;
  const [savingName, setSavingName] = useState(false);
  const [nameNote, setNameNote] = useState<string | null>(null);

  const saveName = async () => {
    if (!userId) return;
    if (name.trim().length < 2) {
      errorFeedback();
      setNameNote('Enter at least 2 characters.');
      return;
    }
    setSavingName(true);
    setNameNote(null);
    try {
      await updateDisplayName(userId, name);
      reloadProfile();
      successFeedback();
      setName(null);
      toast('Name saved');
    } catch (e) {
      errorFeedback();
      setNameNote(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setSavingName(false);
    }
  };

  const leave = async () => {
    await clearAccountCache(userId);
    await signOut();
  };

  const confirmReset = () =>
    confirm(
      'Clear this device?',
      session
        ? 'Waitlists and reminders on this phone will be removed. Saved events and follows stay in your account.'
        : 'Saved events, follows and waitlists on this phone will be removed.',
      'Clear',
      () => store.resetPrefs(),
    );

  const confirmDelete = () =>
    confirm(
      'Delete your account?',
      'Your account, tickets and personal details are removed for good. This can’t be undone.',
      'Delete account',
      async () => {
        setAccountNote(null);
        try {
          await deleteAccount();
          await leave();
        } catch (e) {
          setAccountNote(e instanceof Error ? e.message : 'Something went wrong. Try again.');
        }
      },
    );

  const toggleReminders = async (next: boolean) => {
    tapFeedback();
    const ok = await store.setReminders(next);
    setReminderNote(ok ? null : 'Notifications are off for Tikkit. Turn them on in your phone’s Settings to get reminders.');
  };

  const nameChanged = nameInput !== null && nameInput.trim() !== displayName;

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Container>
        {session && (
          <>
            <Heading>Profile</Heading>
            <ProfileImagesEditor
              name={displayName || email || ''}
              seed={userId ?? 'me'}
              avatar={avatarUrl}
              banner={bannerUrl}
              busy={imageBusy}
              onChange={changeImage}
              onRemove={removeImage}
            />
            {imageNote && (
              <AppText variant="footnote" color={colors.danger} style={listStyles.foot} accessibilityLiveRegion="polite">
                {imageNote}
              </AppText>
            )}
            <Heading>Your name</Heading>
            <View style={styles.nameRow}>
              <View style={styles.fill}>
                <Field
                  label="Shown on tickets and to organisers"
                  value={name}
                  onChangeText={(t) => {
                    setName(t);
                    setNameNote(null);
                  }}
                  autoCapitalize="words"
                  autoComplete="name"
                  maxLength={80}
                />
              </View>
            </View>
            {nameChanged && <Button label="Save name" loading={savingName} onPress={saveName} style={styles.saveName} />}
            {nameNote && (
              <AppText variant="footnote" muted style={listStyles.foot} accessibilityLiveRegion="polite">
                {nameNote}
              </AppText>
            )}
          </>
        )}

        <Heading>Notifications</Heading>
        <Group>
          <View style={styles.row}>
            <Bell size={22} color={colors.text} />
            <View style={styles.fill}>
              <AppText>Event reminders</AppText>
              <AppText variant="footnote" muted>
                The day before and an hour before
              </AppText>
            </View>
            <Switch
              value={store.remindersEnabled}
              onValueChange={toggleReminders}
              disabled={Platform.OS === 'web'}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel="Event reminders"
            />
          </View>
        </Group>
        {(reminderNote || Platform.OS === 'web') && (
          <AppText variant="footnote" muted style={listStyles.foot}>
            {Platform.OS === 'web' ? 'Reminders are available in the iPhone and Android apps.' : reminderNote}
          </AppText>
        )}

        <Heading>Appearance</Heading>
        <AppearancePicker />

        <Heading>Help and policies</Heading>
        <Group>
          <Row icon={Lifebuoy} label="Help and safety" onPress={() => router.push('/help')} />
          <Row icon={FileText} label="Refund policy" divider onPress={() => router.push({ pathname: '/help/[slug]', params: { slug: 'refunds' } })} />
          <Row icon={FileText} label="Terms of use" divider onPress={() => router.push({ pathname: '/help/[slug]', params: { slug: 'terms' } })} />
          <Row icon={LockKey} label="Privacy" divider onPress={() => router.push({ pathname: '/help/[slug]', params: { slug: 'privacy' } })} />
        </Group>

        <Heading>{session ? 'Account and device' : 'This device'}</Heading>
        <Group>
          {session && <Row icon={SignOut} label="Sign out" onPress={leave} />}
          <Row icon={Trash} label="Clear this device" divider={!!session} onPress={confirmReset} />
          {session && <Row icon={Trash} label="Delete account" danger divider onPress={confirmDelete} />}
        </Group>
        {accountNote && (
          <AppText variant="footnote" color={colors.danger} style={listStyles.foot}>
            {accountNote}
          </AppText>
        )}

        <AppText variant="footnote" muted style={styles.version}>
          Tikkit {Constants.expoConfig?.version ?? ''}
        </AppText>
      </Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingBottom: space.xxl },
  nameRow: { flexDirection: 'row', gap: space.sm },
  saveName: { marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  version: { textAlign: 'center', marginTop: space.xl },
});
