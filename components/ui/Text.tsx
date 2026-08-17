import { Text as RNText, StyleSheet, type TextProps } from 'react-native';
import { colors, familyForWeight, fontFamily, fontSize } from '@/lib/theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';
type Tone = 'default' | 'muted' | 'faint' | 'inverse' | 'positive' | 'negative' | 'primary';
type Weight = '400' | '500' | '600' | '700';

export type AppTextProps = TextProps & {
  variant?: Variant;
  tone?: Tone;
  weight?: Weight;
  align?: 'left' | 'center' | 'right';
  /**
   * Marks this as a figure rather than prose.
   *
   * Two effects, both required for a ledger: fixed-width digits so a column of
   * amounts lines up and doesn't jitter as values change, and Inter instead of
   * the heading face — Space Grotesk has no tabular figures, so a column of
   * balances drawn in it would misalign.
   */
  numeric?: boolean;
};

/** Which variants are headings. The equivalent of `h1…h6` in the CSS version. */
const HEADING_VARIANTS: Variant[] = ['display', 'title', 'heading'];

export function Text({
  variant = 'body',
  tone = 'default',
  weight,
  align,
  numeric = false,
  style,
  ...rest
}: AppTextProps) {
  const isHeading = HEADING_VARIANTS.includes(variant) && !numeric;

  // Headings take Space Grotesk — 700 at the larger sizes, 500 for the small
  // ones. Everything else, including every figure, takes Inter.
  const family = isHeading
    ? variant === 'heading'
      ? fontFamily.headingMedium
      : fontFamily.heading
    : familyForWeight(weight ?? variantWeights[variant]);

  return (
    <RNText
      {...rest}
      style={[
        variantStyles[variant],
        { color: toneColors[tone], fontFamily: family },
        numeric && styles.tabular,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}

const toneColors: Record<Tone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  faint: colors.textFaint,
  inverse: colors.textInverse,
  positive: colors.positive,
  negative: colors.negative,
  primary: colors.primaryText,
};

/** Only consulted for non-heading text; headings get weight from the font file. */
const variantWeights: Record<Variant, Weight> = {
  display: '700',
  title: '700',
  heading: '600',
  body: '400',
  label: '600',
  caption: '400',
};

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
});

/**
 * Space Grotesk is a geometric sans with generous counters, so the larger
 * sizes take firmer negative tracking than the serif did to stop them looking
 * loose.
 */
const variantStyles = StyleSheet.create({
  display: { fontSize: fontSize.display, lineHeight: 40, letterSpacing: -1.2 },
  title: { fontSize: fontSize.xxl, lineHeight: 32, letterSpacing: -0.7 },
  heading: { fontSize: fontSize.lg, lineHeight: 23, letterSpacing: -0.3 },
  body: { fontSize: fontSize.md, lineHeight: 22 },
  label: { fontSize: fontSize.sm, lineHeight: 18 },
  caption: { fontSize: fontSize.xs, lineHeight: 16, letterSpacing: 0.1 },
});
