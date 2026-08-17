/**
 * Design tokens.
 *
 * Structure follows the "Elara FinTech" minimalist reference: a dark, near-black
 * surface stack, hairline borders instead of shadows, and colour-coded category
 * chips. The accent comes from the Splex logo — see `primary` below.
 *
 * The neutral ramp is tuned so body text lands near 18:1 contrast on the base
 * background and muted text stays above 4.5:1. `positive` keeps the mint
 * `#00E5A0` that the reference used, but it now means money rather than brand.
 *
 * The app ships no UI component library, so this file plus `components/ui/` is
 * the entire visual vocabulary. Nothing outside those two places hardcodes a
 * colour, which is what makes a change this sweeping cost one file.
 */

/** True in a browser. Also false under the test runner, which is plain Node. */
const IS_WEB = typeof document !== 'undefined';

/**
 * Both palettes, as raw hex. This is the single source of truth for colour.
 *
 * Every foreground token is contrast-checked against its own background in
 * `tests/contrast.test.ts`, for BOTH themes — a light theme is not a matter of
 * inverting the dark one, and several tokens need genuinely different values to
 * stay legible.
 */
export const PALETTE = {
  dark: {
    // Surface stack, darkest to lightest. Depth comes from these steps and from
    // hairline borders — not from shadows, which read as muddy on dark UI.
    bg: '#0A0B0F',
    surface: '#131620',
    surfaceMuted: '#1B1F2B',
    surfaceRaised: '#232838',

    border: '#242938',
    borderStrong: '#343B4F',

    text: '#F2F4F8',
    textMuted: '#98A1B2',
    textFaint: '#646E82',
    /** Text sitting ON `primary`. */
    textInverse: '#FFFFFF',

    // Accent, drawn from the logo. Its core blue (#2241FC) is too dark to use
    // directly — only 3.03:1 against the background — so the scale is lifted
    // out of that hue instead.
    //
    // Two values, because the accent does two jobs with opposite contrast
    // needs: `primary` as a FILL (white on it reaches 4.55:1) and `primaryText`
    // as FOREGROUND (5.97:1). One value would fail one job or the other.
    primary: '#6C5CFF',
    primaryPressed: '#5B4AE8',
    primaryText: '#8B7BFF',
    primaryMuted: 'rgba(108, 92, 255, 0.16)',
    primaryBorder: 'rgba(108, 92, 255, 0.45)',

    // Deliberately NOT the accent. When the accent was mint, "you are owed" and
    // "brand" were the same colour and the distinction was invisible.
    positive: '#00E5A0',
    positiveMuted: 'rgba(0, 229, 160, 0.12)',
    positiveBorder: 'rgba(0, 229, 160, 0.45)',
    negative: '#FF5C6C',
    negativeMuted: 'rgba(255, 92, 108, 0.12)',
    negativeBorder: 'rgba(255, 92, 108, 0.45)',
    warning: '#FFB13D',
    warningMuted: 'rgba(255, 177, 61, 0.12)',
    warningBorder: 'rgba(255, 177, 61, 0.35)',

    overlay: 'rgba(3, 5, 9, 0.72)',

    /** Warm accent for the greeting name. See ACCENT for the contrast note. */
    accent: '#FBBF24',

    // The nav bar has its own small palette because it is dark in BOTH themes:
    // near-black here, the deepest brand step in the light theme. That makes
    // every page text token wrong on it — `text` in the light theme is nearly
    // black, and would be invisible. These are all on-dark in both themes.
    //
    // Dark theme: the surfaces the bar used before these tokens existed.
    navBg: '#131620',
    navBorder: '#242938',
    navText: '#F2F4F8',
    navTextMuted: '#98A1B2',
    /** Hover pill. */
    navFill: '#1B1F2B',
    /** Active pill — stronger, so hover and current page never look alike. */
    navFillStrong: 'rgba(108, 92, 255, 0.16)',
    /** Sun and moon in the theme toggle. */
    navWarm: '#FFB13D',
    navCool: '#8B7BFF',
  },

  // Built on a five-step steel-blue ramp:
  //
  //   #40677D  #5D8FAC  #90B2C6  #C2D5E0  #F5F8FA
  //
  // Every one of the five has a job below: the lightest is the page, the next
  // the hairlines, the mid tones the strong borders and translucent fills, and
  // the darkest does double duty as the button fill and the nav bar.
  //
  // The darkest step reaches 5.70:1 on the lightest, so it serves as foreground
  // text directly — `primary` and `primaryText` are one value here. Only body
  // and muted text are darkened out of the hue, for headroom.
  light: {
    bg: '#F5F8FA',
    surface: '#FFFFFF',
    surfaceMuted: '#E8EFF4',
    surfaceRaised: '#D8E5ED',

    border: '#C2D5E0',
    borderStrong: '#90B2C6',

    text: '#0F1A21', //      16.55:1 on bg
    textMuted: '#3E505C', //  7.85:1
    textFaint: '#647A88', //  4.21:1 — hint text, held to the 3:1 large-text band
    textInverse: '#FFFFFF',

    // One value does both jobs: white on it reaches 6.08:1 as a FILL, and it
    // reaches 5.70:1 on the page as a FOREGROUND.
    primary: '#40677D',
    primaryPressed: '#35566A',
    primaryText: '#40677D',
    primaryMuted: 'rgba(93, 143, 172, 0.20)',
    primaryBorder: 'rgba(64, 103, 125, 0.40)',

    // All three semantic colours sit well clear of a blue brand in hue, so
    // none of them needed moving for this palette — `warning` returns to the
    // #B45309 amber that the warmer terracotta page had pushed off AA.
    positive: '#047857', // 5.14:1
    positiveMuted: 'rgba(4, 120, 87, 0.10)',
    positiveBorder: 'rgba(4, 120, 87, 0.35)',
    negative: '#C81E2B', // 5.36:1
    negativeMuted: 'rgba(200, 30, 43, 0.10)',
    negativeBorder: 'rgba(200, 30, 43, 0.35)',
    warning: '#B45309', // 4.71:1
    warningMuted: 'rgba(180, 83, 9, 0.10)',
    warningBorder: 'rgba(180, 83, 9, 0.35)',

    overlay: 'rgba(15, 26, 33, 0.45)',

    // Amber: the classic complement to blue, and warm against a cool page. It
    // lands close to `warning`, which is deliberate rather than an oversight —
    // the dark theme has always had the same near-collision (#FBBF24 accent
    // against #FFB13D warning) and the two never appear side by side.
    accent: '#B45309', // 4.71:1

    // The bar takes the ramp's darkest step. That step is a mid-tone rather
    // than a near-black, so its foregrounds have to be markedly lighter than
    // the dark theme's: white reaches 6.08:1, and the amber and violet below
    // are lifted until they clear it too.
    navBg: '#40677D',
    navBorder: '#33546A',
    navText: '#FFFFFF',
    navTextMuted: '#DCE8EF', // 4.87:1
    navFill: 'rgba(255, 255, 255, 0.12)',
    navFillStrong: 'rgba(255, 255, 255, 0.22)',
    navWarm: '#FFE0A8', // 4.77:1
    navCool: '#E6E0FF', // 4.77:1
  },
} as const;

export type ThemeName = keyof typeof PALETTE;
export type ColorToken = keyof (typeof PALETTE)['dark'];

const TOKEN_NAMES = Object.keys(PALETTE.dark) as ColorToken[];

/** `surfaceMuted` -> `--splex-surface-muted` */
export function cssVarName(token: ColorToken): string {
  return `--splex-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/**
 * On the web every colour is a CSS custom property, so switching theme is a
 * single attribute change on <html> — no React re-render, and none of the 36
 * StyleSheet.create call sites need to know a theme exists. React Native Web
 * passes `var(...)` through untouched for colour properties (see its
 * `isWebColor`), which is what makes this work.
 *
 * React Native has no custom properties, so native gets the literal dark value
 * and is single-theme until the token layer is made reactive there.
 */
export const colors = Object.fromEntries(
  TOKEN_NAMES.map((token) => [
    token,
    IS_WEB ? `var(${cssVarName(token)}, ${PALETTE.dark[token]})` : PALETTE.dark[token],
  ]),
) as Record<ColorToken, string>;

/**
 * The accent in both themes, with the surface each is measured against.
 *
 * Splex currently ships dark only, so `colors.accent` is the dark value. The
 * light entry is defined and contrast-tested now so that whenever a light theme
 * lands, the token is already correct rather than being picked in a hurry.
 */
export const ACCENT = {
  light: { color: '#B45309', on: '#FFFFFF' },
  dark: { color: '#FBBF24', on: '#0A0B0F' },
} as const;

/**
 * Two families, two jobs:
 *
 *   Space Grotesk  every heading — the equivalent of `h1…h6 { font-family }`
 *   Inter          body copy, labels, captions, and all numerals
 *   Lobster        the greeting name, and nothing else
 *
 * Numerals stay in Inter deliberately. Space Grotesk has no tabular figures,
 * so a column of amounts drawn in it would fail to line up and would jitter as
 * values change. Money is data, not a heading — see the `numeric` prop on
 * `Text`.
 *
 * Lobster is Latin-only, so `isLatinOnly` gates it for names in other scripts
 * rather than letting the browser fall back mid-word.
 *
 * React Native has no synthetic bolding, so each weight is a separate family.
 * On the web each one also carries a CSS fallback chain, so a failed webfont
 * still lands on the right kind of face. Web is detected via `document` rather
 * than react-native's `Platform`, because this module is imported by the test
 * suite, which runs in plain Node.
 */
const stack = (registered: string, fallback: string) =>
  IS_WEB ? `${registered}, ${fallback}` : registered;

const HEADING_FALLBACK = "'Space Grotesk', system-ui, sans-serif";
const BODY_FALLBACK = "'Inter', system-ui, sans-serif";
const NAME_FALLBACK = "'Lobster', cursive";

export const fontFamily = {
  regular: stack('Inter_400Regular', BODY_FALLBACK),
  medium: stack('Inter_500Medium', BODY_FALLBACK),
  semibold: stack('Inter_600SemiBold', BODY_FALLBACK),
  bold: stack('Inter_700Bold', BODY_FALLBACK),

  /** Headings. 700 at the larger sizes, 500 for the smaller ones. */
  heading: stack('SpaceGrotesk_700Bold', HEADING_FALLBACK),
  headingMedium: stack('SpaceGrotesk_500Medium', HEADING_FALLBACK),

  /**
   * The greeting name only. A script face, so it is deliberately confined to
   * that one word — and gated by `isLatinOnly`, since it has no glyphs for
   * CJK, Tamil or Arabic.
   */
  name: stack('Lobster_400Regular', NAME_FALLBACK),
} as const;

/**
 * True when every letter in `value` is one the display faces can actually draw.
 *
 * Checks for the absence of non-Latin letters rather than trying to enumerate
 * the scripts it supports — "陈美玲", "முருகன்" and "محمد" all correctly return
 * false, while accented Latin ("José", "Łukasz") stays true.
 */
export function isLatinOnly(value: string): boolean {
  if (!value) return true;
  // Any letter outside the Latin script disqualifies the whole string: a
  // half-script, half-fallback name is worse than a consistent sans one.
  return !/\p{Letter}/u.test(value) || !/\p{Letter}/u.test(value.replace(/\p{Script=Latin}/gu, ''));
}

export type FontWeightKey = keyof typeof fontFamily;

/** Maps a CSS-style weight onto the matching Inter family. */
export function familyForWeight(weight: '400' | '500' | '600' | '700'): string {
  const map = {
    '400': fontFamily.regular,
    '500': fontFamily.medium,
    '600': fontFamily.semibold,
    '700': fontFamily.bold,
  } as const;
  return map[weight];
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  display: 34,
} as const;

/**
 * Category presentation. Categories are a fixed enum in v1.
 *
 * The stored value is the key; the label is presentation only. `food` and
 * `lodging` read as "Food & Drinks" and "Accommodation" rather than being
 * renamed in the database, which would mean rewriting every existing row.
 *
 * Tints were checked with a CVD/contrast validator rather than picked by eye.
 * Two pairs were genuinely indistinguishable and are fixed here:
 *
 *   transport ↔ lodging  ΔE 11.2 → 15.2 (normal vision; now passes)
 *   shopping  ↔ tickets  ΔE  3.7 →  9.8 (deuteranopia; now passes)
 *
 * Nine categorical hues cannot all separate under colour-blind simulation — no
 * palette of this size can. So colour is never load-bearing here: every place a
 * category appears it is labelled with its name or emoji, and the spending
 * breakdown encodes magnitude with bar length in a single hue, not with these.
 */
export const categoryMeta = {
  food: { label: 'Food & Drinks', tint: '#FFB13D' },
  lodging: { label: 'Accommodation', tint: '#C084FC' },
  transport: { label: 'Transport', tint: '#4DA3FF' },
  activities: { label: 'Activities', tint: '#00E5A0' },
  shopping: { label: 'Shopping', tint: '#FF6B9D' },
  flights: { label: 'Flights', tint: '#22D3EE' },
  tickets: { label: 'Tickets', tint: '#FF8A5B' },
  groceries: { label: 'Groceries', tint: '#A3E635' },
  other: { label: 'Other', tint: '#8A94A6' },
} as const;

export type CategoryKey = keyof typeof categoryMeta;

export const CATEGORY_KEYS = Object.keys(categoryMeta) as CategoryKey[];

/** 12% of a hex colour, for chip backgrounds. */
export function tintBackground(hex: string, alpha = 0.14): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Deterministic avatar tint derived from a member id or name. Tuned for dark
 * backgrounds — these are the lighter, higher-chroma end of each hue.
 */
export function tintFor(seed: string): string {
  // Led by the logo's own hues — its violet, sky blue and pink-violet — so
  // avatars read as part of the brand rather than a separate palette.
  const palette = [
    '#8B7BFF',
    '#52BFFB',
    '#AF71FB',
    '#00E5A0',
    '#FFB13D',
    '#FF6B9D',
    '#22D3EE',
    '#84CC16',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length] as string;
}
