import { Image, type ImageProps } from 'expo-image';
import { categoryIcons as motifs } from './categoryIcons';
import type { Category } from '@/data/events';
import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

// Event and venue pictures. Real photos when there are any; otherwise a
// sunset in the brand colours, varied by `seed` so no two look the same.
// Better than stock photos that have nothing to do with the event.
type Props = {
  uri?: string;
  seed: string;
  style: StyleProp<ViewStyle>;
  // Drawn covers show the event's category as a soft watermark, so a row of
  // sunsets still reads as music, food or a day on the water at a glance.
  category?: string;
  motifSize?: number;
} & Pick<ImageProps, 'transition' | 'recyclingKey'>;


export function Cover({ uri, seed, style, transition, recyclingKey, category, motifSize = 44 }: Props) {
  if (uri) {
    return (
      <Image
        source={uri}
        style={style as ImageProps['style']}
        contentFit="cover"
        transition={transition}
        recyclingKey={recyclingKey}
        accessibilityIgnoresInvertColors
      />
    );
  }
  const Motif = category ? motifs[category as Category] : undefined;
  // Light skies (dusk, dawn) get a dark motif; night skies a light one.
  const lightSky = palettes[hash(seed) % palettes.length][0].startsWith('#FF');
  return (
    <View style={[style, styles.clip]} accessibilityIgnoresInvertColors>
      <Sunset seed={seed} />
      {Motif && (
        <View style={[styles.motif, { top: motifSize * 0.3, right: motifSize * 0.3, opacity: lightSky ? 0.22 : 0.4 }]} pointerEvents="none">
          <Motif size={motifSize} color={lightSky ? '#7A1631' : '#FFE3B3'} weight="fill" />
        </View>
      )}
    </View>
  );
}

// [sky top, sky middle, horizon, sun, water top, water bottom]
const palettes = [
  ['#FFE3B3', '#FFB173', '#FF6766', '#CA2851', '#CA2851', '#7A1631'], // dusk
  ['#3B0D22', '#CA2851', '#FF6766', '#FFE3B3', '#5A1430', '#22060F'], // night
  ['#FFF3DE', '#FFE3B3', '#FFB173', '#CA2851', '#FF6766', '#CA2851'], // dawn
  ['#5E1230', '#CA2851', '#FF6766', '#FFB173', '#3B0D22', '#1A050C'], // ember
] as const;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function Sunset({ seed }: { seed: string }) {
  const id = useId().replace(/:/g, '');
  const h = hash(seed);
  const [skyTop, skyMid, horizonC, sunC, waterTop, waterBottom] = palettes[h % palettes.length];
  const sunX = 90 + ((h >>> 3) % 120); // 90..210 of 300
  const r = 22 + ((h >>> 9) % 16); // 22..37
  const horizon = 118 + ((h >>> 14) % 22); // 118..139 of 200
  const sunY = horizon - r * (0.15 + ((h >>> 19) % 50) / 100); // partly set
  return (
    <Svg width="100%" height="100%" viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={skyTop} />
          <Stop offset="0.6" stopColor={skyMid} />
          <Stop offset="1" stopColor={horizonC} />
        </LinearGradient>
        <LinearGradient id={`w${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={waterTop} />
          <Stop offset="1" stopColor={waterBottom} />
        </LinearGradient>
      </Defs>
      <Rect width="300" height={horizon} fill={`url(#s${id})`} />
      <Circle cx={sunX} cy={sunY} r={r} fill={sunC} />
      <Rect y={horizon} width="300" height={200 - horizon} fill={`url(#w${id})`} />
      {/* The sun's reflection, broken up by the water. */}
      {[0, 1, 2, 3].map((i) => {
        const w = r * 2 * (0.9 - i * 0.2);
        return (
          <Rect
            key={i}
            x={sunX - w / 2}
            y={horizon + 6 + i * 11}
            width={w}
            height={3.2 - i * 0.5}
            rx={1.5}
            fill={sunC}
            opacity={0.75 - i * 0.15}
          />
        );
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  motif: { position: 'absolute' },
});
