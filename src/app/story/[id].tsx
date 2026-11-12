import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { CheckCircle, Copy, InstagramLogo, SmileySad } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import { PixelRatio, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';

import { canShareToInstagramStory, shareToInstagramStory } from '../../../modules/instagram-stories';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Container } from '@/components/Container';
import { Cover } from '@/components/Cover';
import { EmptyState } from '@/components/EmptyState';
import { Wordmark } from '@/components/LogoMark';
import { lowestPrice } from '@/data/events';
import { formatLongDay, formatMoney, formatTime } from '@/lib/format';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { eventLink } from '@/lib/links';
import { ticketStatus, useAppStore } from '@/store/AppStore';
import { radius, space } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

// A 9:16 card for Instagram (or WhatsApp) Stories: the event, or "I'm going"
// for ticket holders. Drawn at 360x640 and saved at 1080x1920.
const W = 360;
const H = 640;
// Instagram only accepts direct Story shares from apps with a Facebook App ID.
const FACEBOOK_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID ?? '';

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const { getEvent, tickets } = useAppStore();
  const event = getEvent(id);
  const holds = tickets.some((t) => t.eventId === id && ticketStatus(t) === 'active');
  const [mode, setMode] = useState<'event' | 'going'>(holds ? 'going' : 'event');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const card = useRef<View>(null);
  // Straight into Instagram's Story composer when this build and phone allow
  // it; otherwise the share sheet.
  const [direct, setDirect] = useState(false);
  useEffect(() => {
    if (!FACEBOOK_APP_ID || Platform.OS === 'web') return;
    let live = true;
    canShareToInstagramStory().then((ok) => live && setDirect(ok));
    return () => {
      live = false;
    };
  }, []);

  if (!event) return <EmptyState icon={SmileySad} title="Event not found" body="Open the event again and try once more." />;
  const link = eventLink(event.id);
  // Fit the preview on screen, leaving room for the buttons.
  const scale = Math.min(1, (width - space.md * 2) / W, (height - 330) / H);
  const from = lowestPrice(event);

  const capture = () => {
    const px = PixelRatio.get();
    return captureRef(card, {
      format: 'png',
      quality: 1,
      width: 1080 / px,
      height: 1920 / px,
      result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
    });
  };

  const run = async (how: 'story' | 'sheet') => {
    setNote(null);
    setBusy(true);
    try {
      const uri = await capture();
      if (Platform.OS === 'web') {
        // Browsers can't share a local image, so save it instead.
        const a = document.createElement('a');
        a.href = uri;
        a.download = `${event.id}-story.png`;
        a.click();
        setNote('Saved. Add it to your story from your phone’s photos.');
      } else if (how === 'story' && direct) {
        // Copy the link first, so it's ready to paste into a Link sticker.
        await Clipboard.setStringAsync(link).catch(() => false);
        await shareToInstagramStory(uri, FACEBOOK_APP_ID);
        setNote('Link copied. In Instagram, add a Link sticker and paste it.');
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share to your story' });
      } else {
        setNote('Sharing isn’t available on this device.');
      }
      successFeedback();
    } catch (e) {
      errorFeedback();
      setNote(e instanceof Error && e.message ? e.message : 'Couldn’t make the image. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await Clipboard.setStringAsync(link).catch(() => false);
    successFeedback();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Container style={styles.gap}>
        {holds && (
          <View style={styles.modes} accessibilityRole="radiogroup">
            <Chip label="I’m going" selected={mode === 'going'} onPress={() => setMode('going')} />
            <Chip label="The event" selected={mode === 'event'} onPress={() => setMode('event')} />
          </View>
        )}

        <View style={{ width: W * scale, height: H * scale, alignSelf: 'center' }}>
          <View style={{ width: W, height: H, transform: [{ scale }], transformOrigin: 'top left' }}>
            {/* Everything inside is captured, so it uses fixed colours rather than theme tokens. */}
            <View ref={card} collapsable={false} style={styles.card}>
              <Cover uri={event.image} seed={event.id} style={StyleSheet.absoluteFill} />
              <LinearGradient
                colors={['rgba(12,12,14,0.35)', 'rgba(12,12,14,0)', 'rgba(12,12,14,0.65)', 'rgba(12,12,14,0.95)']}
                locations={[0, 0.25, 0.55, 1]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.brand}>
                <Wordmark height={30} color="#FFFFFF" />
              </View>
              <View style={styles.bottom}>
                {mode === 'going' && (
                  <View style={styles.going}>
                    <AppText variant="subhead" color="#22070B" style={styles.goingText}>
                      I’m going
                    </AppText>
                  </View>
                )}
                <AppText color="#FFFFFF" style={styles.title} numberOfLines={3}>
                  {event.title}
                </AppText>
                <AppText variant="headline" color="#FFB173">
                  {formatLongDay(event.startsAt)}, {formatTime(event.startsAt)}
                </AppText>
                <AppText variant="subhead" color="rgba(255,255,255,0.85)">
                  {event.venue.name}, {event.venue.area}
                </AppText>
                <View style={styles.footer}>
                  <View style={styles.fill}>
                    <AppText variant="headline" color="#FFFFFF">
                      {mode === 'going' ? 'Come with me' : from === 0 ? 'Free entry' : `From ${formatMoney(from, event.currency)}`}
                    </AppText>
                    <AppText variant="footnote" color="rgba(255,255,255,0.75)">
                      Tickets on Tikkit
                    </AppText>
                  </View>
                  <View style={styles.qr}>
                    <QRCode value={link} size={64} backgroundColor="#FFFFFF" color="#0C0C0E" />
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        <Button
          label={Platform.OS === 'web' ? 'Save image' : direct ? 'Add to Instagram Story' : 'Share to your story'}
          icon={InstagramLogo}
          loading={busy}
          onPress={() => run('story')}
        />
        {direct && <Button label="More ways to share" variant="plain" disabled={busy} onPress={() => run('sheet')} />}
        <View style={[styles.tip, { backgroundColor: colors.surface }]}>
          <View style={styles.fill}>
            <AppText variant="subhead" style={styles.bold}>
              Add a link sticker
            </AppText>
            <AppText variant="footnote" muted numberOfLines={1}>
              {link}
            </AppText>
          </View>
          <Button label={copied ? 'Copied' : 'Copy'} icon={copied ? CheckCircle : Copy} variant="plain" onPress={copy} />
        </View>
        {note && (
          <AppText variant="footnote" muted style={styles.center}>
            {note}
          </AppText>
        )}
      </Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: space.md, paddingBottom: space.xxl },
  gap: { gap: space.md },
  modes: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  card: { width: W, height: H, borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#0C0C0E' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, position: 'absolute', top: 28, left: 24 },
  bottom: { position: 'absolute', left: 24, right: 24, bottom: 28, gap: space.xs + 2 },
  going: { alignSelf: 'flex-start', backgroundColor: '#FFB173', borderRadius: radius.pill, paddingHorizontal: space.sm + 4, paddingVertical: space.xs, marginBottom: space.xs },
  goingText: { fontWeight: '800' },
  title: { fontSize: 38, lineHeight: 42, fontWeight: '800', letterSpacing: -0.5 },
  footer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginTop: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.3)' },
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  qr: { padding: 6, backgroundColor: '#FFFFFF', borderRadius: 10 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.md, borderRadius: radius.control },
  center: { textAlign: 'center' },
});
