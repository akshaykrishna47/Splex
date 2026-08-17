import { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme';

export type CardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  /**
   * `default` is the standard surface + hairline. `raised` lifts a step for the
   * hero card on a screen. `outlined` is a border with no fill — for secondary
   * groupings that shouldn't compete.
   */
  variant?: 'default' | 'flat' | 'raised' | 'outlined';
  padding?: keyof typeof paddingMap;
  /** Accepts arrays so callers can compose conditional styles. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const paddingMap = {
  none: 0,
  sm: spacing.md,
  md: spacing.lg,
  lg: spacing.xl,
} as const;

export function Card({
  children,
  onPress,
  variant = 'default',
  padding = 'md',
  style,
  testID,
}: CardProps) {
  const [hovered, setHovered] = useState(false);
  const base = [styles.base, variantStyles[variant], { padding: paddingMap[padding] }, style];

  if (!onPress) {
    return (
      <View testID={testID} style={base}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        ...base,
        hovered && styles.hovered,
        pressed && styles.pressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Depth on dark UI comes from surface steps and hairlines. A drop shadow
  // against a near-black background just reads as a smudge.
  base: { borderRadius: radius.xl, backgroundColor: colors.surface },
  hovered: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong },
  pressed: { backgroundColor: colors.surfaceRaised, opacity: 0.9 },
});

const variantStyles = StyleSheet.create({
  default: { borderWidth: 1, borderColor: colors.border },
  flat: { backgroundColor: colors.surface },
  raised: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderStrong },
  outlined: { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
});
