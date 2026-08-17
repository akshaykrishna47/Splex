import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { Sparkles } from './Sparkles';
import { Text } from './Text';
import { colors, radius, spacing } from '@/lib/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  /** Renders left of the label. Emoji or a small element. */
  icon?: React.ReactNode;
  fullWidth?: boolean;
  /**
   * Sparkle particles around the button, the same effect the floating action
   * button uses. Opt-in: it is for the one call to action a screen is actually
   * built around, and loses its meaning if every button has it.
   *
   * `hover` matches the floating action button. `always` keeps them on screen,
   * twinkling — for a hero call to action that has to pull the eye on its own.
   */
  sparkle?: 'hover' | 'always';
  style?: ViewStyle;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
  sparkle,
  style,
  testID,
}: ButtonProps) {
  const isInert = disabled || loading;
  // onHoverIn/Out are no-ops on touch platforms, so this costs nothing there
  // and gives the web build the pointer feedback people expect.
  const [hovered, setHovered] = useState(false);

  // "flat": a button sits on its surface, so it takes the glow without the drop
  // shadow the floating action button needs restated. Withheld while inert —
  // sparkles on a button that cannot be pressed would be a lie.
  const sparkling = Boolean(sparkle) && Platform.OS === 'web' && !isInert;
  const sparkleProps = sparkling
    ? ({
        dataSet: {
          splexSparkle: 'flat',
          ...(sparkle === 'always' ? { splexSparkleIdle: '' } : {}),
        },
      } as object)
    : {};

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInert, busy: loading }}
      onPress={isInert ? undefined : onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      {...sparkleProps}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        variantStyles[variant],
        fullWidth && styles.fullWidth,
        hovered && !isInert && hoverStyles[variant],
        pressed && !isInert && pressedStyles[variant],
        isInert && styles.inert,
        style,
      ]}
    >
      {sparkling ? <Sparkles /> : null}

      {loading ? (
        <ActivityIndicator
          size="small"
          color={labelTone[variant] === 'inverse' ? colors.textInverse : colors.primaryText}
        />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text variant="label" tone={labelTone[variant]} numeric={false} style={textSizes[size]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// The mint accent is bright enough that white text on it fails contrast badly.
// Primary buttons take near-black labels, which is also what the reference does.
const labelTone: Record<Variant, 'inverse' | 'default' | 'primary'> = {
  primary: 'inverse',
  secondary: 'default',
  ghost: 'primary',
  danger: 'inverse',
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { alignItems: 'center', justifyContent: 'center' },
  fullWidth: { alignSelf: 'stretch' },
  inert: { opacity: 0.35 },
});

const sizeStyles = StyleSheet.create({
  sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 36 },
  md: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 46 },
  lg: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, minHeight: 54 },
});

const textSizes = StyleSheet.create({
  sm: { fontSize: 13 },
  md: { fontSize: 15 },
  lg: { fontSize: 16 },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.negative },
});

const hoverStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primaryPressed },
  secondary: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised },
  ghost: { backgroundColor: colors.primaryMuted },
  danger: { opacity: 0.9 },
});

const pressedStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primaryPressed, opacity: 0.85 },
  secondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong },
  ghost: { backgroundColor: colors.primaryMuted, opacity: 0.8 },
  danger: { opacity: 0.75 },
});
