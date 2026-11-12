import { useId } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, type DerivedValue } from 'react-native-reanimated';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { brand } from '@/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// The Tikkit mark: a tilted ticket with a star on it, the stub torn along a
// perforated line. Drawn on a 512 grid and tilted 10°; MARK_BOX crops to it.
const TICKET =
  'M92,126 H314 A22,22 0 0 0 358,126 H420 A36,36 0 0 1 456,162 V350 A36,36 0 0 1 420,386 H358 A22,22 0 0 0 314,386 H92 A36,36 0 0 1 56,350 V162 A36,36 0 0 1 92,126 Z';
const BODY = 'M92,126 H314 A22,22 0 0 0 336,148 V364 A22,22 0 0 0 314,386 H92 A36,36 0 0 1 56,350 V162 A36,36 0 0 1 92,126 Z';
const STAR =
  'M191.13,195.86 Q196,186 200.87,195.86 L213.92,222.3 Q216.57,227.68 222.51,228.55 L251.69,232.79 Q262.57,234.37 254.7,242.05 L233.58,262.63 Q229.29,266.82 230.3,272.73 L235.29,301.79 Q237.14,312.63 227.41,307.51 L201.31,293.79 Q196,291 190.69,293.79 L164.59,307.51 Q154.86,312.63 156.71,301.79 L161.7,272.73 Q162.71,266.82 158.42,262.63 L137.3,242.05 Q129.43,234.37 140.31,232.79 L169.49,228.55 Q175.43,227.68 178.08,222.3 Z';
const PERFORATION =
  'M336,162 A4,4 0 0 1 336,178 A4,4 0 0 1 336,162 Z M336,190.67 A4,4 0 0 1 336,206.67 A4,4 0 0 1 336,190.67 Z M336,219.33 A4,4 0 0 1 336,235.33 A4,4 0 0 1 336,219.33 Z M336,248 A4,4 0 0 1 336,264 A4,4 0 0 1 336,248 Z M336,276.67 A4,4 0 0 1 336,292.67 A4,4 0 0 1 336,276.67 Z M336,305.33 A4,4 0 0 1 336,321.33 A4,4 0 0 1 336,305.33 Z M336,334 A4,4 0 0 1 336,350 A4,4 0 0 1 336,334 Z';
const WORD =
  'M37.3 -14.5V0H28.6Q19.3 0 14.1 -4.55Q8.9 -9.1 8.9 -19.4V-41.6H2.1V-55.8H8.9V-69.4H26V-55.8H37.2V-41.6H26V-19.2Q26 -16.7 27.2 -15.6Q28.4 -14.5 31.2 -14.5Z M44 -70.8Q44 -74.8 46.85 -77.45Q49.7 -80.1 54.2 -80.1Q58.6 -80.1 61.45 -77.45Q64.3 -74.8 64.3 -70.8Q64.3 -66.9 61.45 -64.25Q58.6 -61.6 54.2 -61.6Q49.7 -61.6 46.85 -64.25Q44 -66.9 44 -70.8ZM62.7 -55.8V0H45.6V-55.8Z M108 0 91 -23.4V0H73.9V-74H91V-33.1L107.9 -55.8H129L105.8 -27.8L129.2 0Z M168.6 0 151.6 -23.4V0H134.5V-74H151.6V-33.1L168.5 -55.8H189.6L166.4 -27.8L189.8 0Z M193.5 -70.8Q193.5 -74.8 196.35 -77.45Q199.2 -80.1 203.7 -80.1Q208.1 -80.1 210.95 -77.45Q213.8 -74.8 213.8 -70.8Q213.8 -66.9 210.95 -64.25Q208.1 -61.6 203.7 -61.6Q199.2 -61.6 196.35 -64.25Q193.5 -66.9 193.5 -70.8ZM212.2 -55.8V0H195.1V-55.8Z M254.5 -14.5V0H245.8Q236.5 0 231.3 -4.55Q226.1 -9.1 226.1 -19.4V-41.6H219.3V-55.8H226.1V-69.4H243.2V-55.8H254.4V-41.6H243.2V-19.2Q243.2 -16.7 244.4 -15.6Q245.6 -14.5 248.4 -14.5Z';

const MARK_BOX = { x: 34, y: 91, w: 444, h: 330 };

function Ticket({ id, sun }: { id: string; sun?: DerivedValue<number> }) {
  // `sun` (kept from the old mark's API) lights the star: 0 hidden, 0.5 and up fully on.
  const starProps = useAnimatedProps(() => ({ fillOpacity: Math.min(1, Math.max(0, (sun ? sun.get() : 0.5) * 2)) }));
  return (
    <>
      <Defs>
        <LinearGradient id={`t${id}`} gradientUnits="userSpaceOnUse" x1="56" y1="126" x2="336" y2="386">
          <Stop offset="0" stopColor={brand.coral} />
          <Stop offset="1" stopColor={brand.crimson} />
        </LinearGradient>
      </Defs>
      <G transform="rotate(-10 256 256)">
        <Path d={TICKET} fill={brand.peach} />
        <Path d={BODY} fill={`url(#t${id})`} />
        <AnimatedPath d={STAR} fill={brand.cream} animatedProps={starProps} />
        <Path d={PERFORATION} fill={brand.cream} />
      </G>
    </>
  );
}

// Just the ticket, for small spaces: tab bars, loaders, icons.
export function LogoMark({ width }: { width: number }) {
  const id = useId().replace(/:/g, '');
  return (
    // Decorative: hidden from screen readers (the wrapper carries the flags,
    // since svg on web passes unknown props straight to the DOM).
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={(width * MARK_BOX.h) / MARK_BOX.w} viewBox={`${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.w} ${MARK_BOX.h}`}>
        <Ticket id={id} />
      </Svg>
    </View>
  );
}

// The ticket and the "tikkit" wordmark together. `color` is the word's colour:
// crimson on light backgrounds, coral on dark (the theme accent).
export function Wordmark({ height, color = brand.crimson }: { height: number; color?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Tikkit">
      <Svg width={(height * 473.19) / 148.19} height={height} viewBox="0 0 473.19 148.19">
        <G transform="translate(16.02 16.02) scale(0.37) translate(-42 -99)">
          <Ticket id={id} />
        </G>
        <Path transform="translate(202.67 114.14)" d={WORD} fill={color} />
      </Svg>
    </View>
  );
}

// The mark with a star that can light up, for the launch intro and the pull-to-refresh loader.
export function AnimatedLogoMark({ width, sun }: { width: number; sun: DerivedValue<number> }) {
  const id = useId().replace(/:/g, '');
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={(width * MARK_BOX.h) / MARK_BOX.w} viewBox={`${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.w} ${MARK_BOX.h}`}>
        <Ticket id={id} sun={sun} />
      </Svg>
    </View>
  );
}
