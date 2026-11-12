import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Buildings, ImageSquare } from '@/components/icons';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { SignInRequired } from '@/components/SignInRequired';
import { Stepper } from '@/components/Stepper';
import { amenityOptions, type Venue } from '@/data/venues';
import { archiveVenue, fetchVenue, saveVenue, uploadPhoto } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { errorFeedback, successFeedback, tapFeedback } from '@/lib/haptics';
import { useRemote } from '@/lib/useRemote';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

export default function EditVenueScreen() {
  return (
    <SignInRequired title="Sign in to list a space" body="Spaces are tied to your account, so only you can change them or answer requests.">
      <EditVenue />
    </SignInRequired>
  );
}

function EditVenue() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useColors();
  const { userId } = useAuth();
  const load = useCallback(async () => (id ? fetchVenue(id) : null), [id]);
  const { data, loading, error, reload } = useRemote(load);

  if (!id) return <VenueForm />;
  if (data === undefined) {
    return (
      <View style={styles.center}>
        {loading ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : (
          <EmptyState icon={Buildings} title="Couldn’t load this space" body={error ?? ''} action={{ label: 'Try again', onPress: reload }} />
        )}
      </View>
    );
  }
  if (!data || data.ownerId !== userId || data.archived) {
    return <EmptyState icon={Buildings} title="Not your space" body="Only the owner can change a space." />;
  }
  return <VenueForm initial={data} />;
}

const toMvr = (laari?: number) => (laari === undefined ? '' : String(laari / 100));

function VenueForm({ initial }: { initial?: Venue }) {
  const colors = useColors();
  const { userId } = useAuth();
  const [photo, setPhoto] = useState<{ uri: string; mimeType?: string } | null>(null);
  const [name, setName] = useState(initial?.name ?? '');
  const [area, setArea] = useState(initial?.area ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [access, setAccess] = useState(initial?.access ?? '');
  const [capacity, setCapacity] = useState(initial ? String(initial.capacity) : '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amenities, setAmenities] = useState<string[]>(initial?.amenities ?? []);
  const [forRent, setForRent] = useState(initial?.forRent ?? true);
  const [rate, setRate] = useState(toMvr(initial?.hourlyRate));
  const [minHours, setMinHours] = useState(initial?.minHours ?? 2);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const errors = {
    name: name.trim().length < 2 ? 'Give the space a name.' : undefined,
    area: area.trim().length < 2 ? 'Enter the island, like Hulhumalé.' : undefined,
    address: address.trim().length < 5 ? 'Enter the street address.' : undefined,
    capacity: !/^[1-9]\d{0,4}$/.test(capacity.trim()) ? 'Enter how many people fit, up to 99,999.' : undefined,
    rate: forRent && !/^\d+(\.\d{1,2})?$/.test(rate.trim()) ? 'Enter a price per hour, or 0 if it’s free.' : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);
  const e = (k: keyof typeof errors) => (showErrors ? errors[k] : undefined);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 2], quality: 0.7 });
    const asset = res.canceled ? null : res.assets[0];
    if (asset) setPhoto({ uri: asset.uri, mimeType: asset.mimeType ?? undefined });
  };

  const toggleAmenity = (a: string) =>
    setAmenities((list) => (list.includes(a) ? list.filter((x) => x !== a) : [...list, a]));

  const save = async () => {
    setShowErrors(true);
    setFailure(null);
    if (!valid || !userId) {
      errorFeedback();
      return;
    }
    setSaving(true);
    try {
      const imagePath = photo ? await uploadPhoto(userId, photo.uri, photo.mimeType) : undefined;
      const id = await saveVenue({
        id: initial?.id,
        name: name.trim(),
        area: area.trim(),
        address: address.trim(),
        access: access.trim() || undefined,
        capacity: Number(capacity),
        description: description.trim(),
        amenities,
        forRent,
        hourlyRate: forRent ? Math.round(Number(rate) * 100) : initial?.hourlyRate,
        minHours,
        imagePath,
      });
      successFeedback();
      if (initial) router.back();
      else router.replace({ pathname: '/venues/[id]', params: { id } });
    } catch (err) {
      errorFeedback();
      setFailure(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setSaving(false);
    }
  };

  const remove = () =>
    confirm(
      'Remove this space?',
      'It disappears from Tikkit and requests still waiting are declined. Bookings you already approved stay in place.',
      'Remove',
      async () => {
        try {
          await archiveVenue(initial!.id);
          router.dismissTo('/organiser');
        } catch (err) {
          setFailure(err instanceof Error ? err.message : 'Something went wrong. Try again.');
        }
      },
    );

  const image = photo?.uri ?? initial?.image;

  return (
    <KeyboardScreen
      footer={
        <Container>
          <Button label={initial ? 'Save changes' : 'Add space'} loading={saving} onPress={save} />
        </Container>
      }
    >
      <Stack.Screen options={{ title: initial ? 'Edit space' : 'New space' }} />
      <Container style={styles.gap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={image ? 'Change photo' : 'Add photo'}
          onPress={pickImage}
          style={({ pressed }) => [styles.photo, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.8 }]}
        >
          {image ? (
            <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={styles.photoEmpty}>
              <ImageSquare size={32} color={colors.textMuted} />
              <AppText variant="subhead" muted>
                Add a photo of the space.
              </AppText>
            </View>
          )}
        </Pressable>

        <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={120} error={e('name')} />
        <Field label="Island or atoll" value={area} onChangeText={setArea} autoCapitalize="words" maxLength={80} error={e('area')} />
        <Field label="Address" value={address} onChangeText={setAddress} autoComplete="street-address" maxLength={200} error={e('address')} />
        <Field
          label="Getting there (optional)"
          value={access}
          onChangeText={setAccess}
          maxLength={300}
          placeholder="Ferry from Malé, 10 minutes"
        />
        <Field
          label="Capacity"
          value={capacity}
          onChangeText={setCapacity}
          keyboardType="number-pad"
          helper="Most people the space holds."
          error={e('capacity')}
        />
        <Field
          label="About the space (optional)"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={2000}
          textAlignVertical="top"
          style={styles.multiline}
        />

        <View style={styles.block}>
          <AppText variant="subhead" style={styles.bold}>
            What it has
          </AppText>
          <View style={styles.chips}>
            {amenityOptions.map((a) => (
              <Chip key={a} label={a} selected={amenities.includes(a)} onPress={() => toggleAmenity(a)} />
            ))}
          </View>
        </View>

        <View style={[styles.rentCard, { borderColor: colors.border }]}>
          <View style={styles.inline}>
            <View style={styles.fill}>
              <AppText variant="headline">Rent it out</AppText>
              <AppText variant="subhead" muted>
                Organisers can find it and request times. You approve every booking.
              </AppText>
            </View>
            <Switch
              value={forRent}
              onValueChange={(v) => {
                tapFeedback();
                setForRent(v);
              }}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel="Rent it out"
            />
          </View>
          {forRent && (
            <>
              <Field
                label="Price per hour (MVR)"
                value={rate}
                onChangeText={setRate}
                keyboardType="decimal-pad"
                error={e('rate')}
              />
              <View style={styles.inline}>
                <View style={styles.fill}>
                  <AppText variant="subhead" style={styles.bold}>
                    Shortest booking
                  </AppText>
                  <AppText variant="subhead" muted>
                    {minHours} {minHours === 1 ? 'hour' : 'hours'}
                  </AppText>
                </View>
                <Stepper label="hour" value={minHours} min={1} max={24} onChange={setMinHours} />
              </View>
              <AppText variant="footnote" muted>
                Renters pay in the app when you approve them. You’re paid the day after each booking, less a 10% commission. Only verified spaces are listed.
              </AppText>
            </>
          )}
        </View>

        {failure && (
          <AppText variant="subhead" color={colors.danger} accessibilityLiveRegion="polite">
            {failure}
          </AppText>
        )}

        {initial && <Button label="Remove space" variant="plain" onPress={remove} />}
      </Container>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bold: { fontWeight: '600' },
  gap: { gap: space.lg },
  block: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  photo: {
    aspectRatio: 3 / 2,
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmpty: { alignItems: 'center', gap: space.sm, padding: space.lg },
  multiline: { minHeight: 120, paddingTop: space.sm + 4 },
  rentCard: { padding: space.md, borderRadius: radius.control, borderWidth: StyleSheet.hairlineWidth, gap: space.md },
});
