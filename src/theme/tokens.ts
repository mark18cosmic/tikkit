// Semantic tokens only. Components never reference raw hex values.
// Every text/background pair below is checked to WCAG AA (4.5:1) or better.
export const palette = {
  light: {
    background: '#FAFAFA',
    surface: '#F1F1F3',
    elevated: '#FFFFFF',
    text: '#111113',
    textMuted: '#5E5E66',
    border: '#E2E2E6',
    accent: '#CA2851',
    onAccent: '#FFFFFF',
    success: '#157A3A',
    danger: '#B42318',
    scrim: 'rgba(12,12,14,0.55)',
    onScrim: '#FFFFFF',
  },
  dark: {
    background: '#0C0C0E',
    surface: '#17171A',
    elevated: '#1F1F23',
    text: '#F4F4F5',
    textMuted: '#A0A0AB',
    border: '#2A2A30',
    accent: '#FF6766',
    onAccent: '#22070B',
    success: '#4ADE80',
    danger: '#FF453A',
    scrim: 'rgba(0,0,0,0.6)',
    onScrim: '#FFFFFF',
  },
} as const;

// Sunset brand colours. Crimson and coral double as the light and dark
// accents above. Peach and cream fail contrast as text on light backgrounds,
// so they are only for the logo, illustrations and the refresh loader.
export const brand = {
  crimson: '#CA2851',
  coral: '#FF6766',
  peach: '#FFB173',
  cream: '#FFE3B3',
} as const;

export type ColorTokens = { [K in keyof (typeof palette)['light']]: string };

export const space = { xxs: 2, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

// One radius system: controls are 12, media cards are 20, chips and icon buttons are pills.
export const radius = { control: 12, card: 20, pill: 999 } as const;

// iOS text styles at the default (Large) content size. RN scales these with
// Dynamic Type automatically because allowFontScaling defaults to true.
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.4 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 0.3 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;

export const minTouchTarget = 44;

// Readable line length for text-heavy screens on tablets and desktop browsers.
export const maxContentWidth = 720;
export const maxGridWidth = 1320;
