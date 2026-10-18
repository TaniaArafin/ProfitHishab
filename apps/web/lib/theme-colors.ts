/** The schist scale — every brand colour in the app comes from here. */
export const schist = {
  50: '#f8fbf9',
  100: '#f3f6f4',
  200: '#e5e9e2',
  300: '#d2d9ce',
  400: '#a8b5a0',
  500: '#6e8064',
  600: '#4d5d48',
  700: '#3c4937',
  800: '#272c21',
  900: '#181f14',
  950: '#0a0e07',
} as const;

/**
 * Semantic palette, shared by tailwind.config.ts (class names) and charts that need raw values.
 * Light surfaces: page 100, cards 50, sidebar 200→300, text 950. Buttons 600/700.
 * Dashboard hero card: 500 with 100/200 text, no status colours.
 * gain/loss/warn/info are status colours, not brand.
 */
export const colors = {
  schist,
  ink: { DEFAULT: schist[950], muted: schist[600], faint: schist[500] },
  paper: schist[100],
  card: schist[50],
  line: schist[200],
  night: { DEFAULT: schist[800], 2: schist[700], 3: schist[600] },
  brand: { DEFAULT: schist[600], soft: schist[200], dark: schist[700] },
  accent: { DEFAULT: schist[400], soft: schist[100], ink: schist[700] },
  info: { DEFAULT: '#3B6E9E', soft: '#EAF1F8', ink: '#2A5378' },
  // ink = text on the soft tint; bright = text on the dark hero cards.
  gain: { DEFAULT: '#2F7D4F', soft: '#E6F3EB', ink: '#225C3A', bright: '#9BE0B4' },
  loss: { DEFAULT: '#C2362B', soft: '#FCEBE9', ink: '#8E241C', bright: '#FFA79E' },
  warn: { DEFAULT: '#B26B00', soft: '#FDF3E0', ink: '#7A4A00' },
  glow: schist[400],
} as const;
