import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { colors, fontFamily, fontSize, radius, spacing } from '@/lib/theme';

export type InputProps = TextInputProps & {
  label?: string;
  /** Shown below the field in red; also turns the border red. */
  error?: string | null;
  /** Shown below the field in grey when there is no error. */
  hint?: string;
  /** Rendered inside the field, right-aligned — e.g. a currency picker. */
  trailing?: React.ReactNode;
  /** Rendered inside the field, left-aligned — e.g. a currency symbol. */
  leading?: React.ReactNode;
  containerStyle?: ViewStyle;
};

export function Input({
  label,
  error,
  hint,
  trailing,
  leading,
  containerStyle,
  style,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="caption" tone="muted" weight="600" style={styles.label}>
          {label.toUpperCase()}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          error ? styles.fieldError : null,
          rest.editable === false && styles.fieldDisabled,
        ]}
      >
        {leading ? <View style={styles.affix}>{leading}</View> : null}
        <TextInput
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor={colors.textFaint}
          style={[styles.input, style]}
        />
        {trailing ? <View style={styles.affix}>{trailing}</View> : null}
      </View>

      {error ? (
        <Text variant="caption" tone="negative" style={styles.helper}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="faint" style={styles.helper}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  // Small, uppercase, letter-spaced field labels — the "eyebrow" treatment the
  // reference uses for .ctx-label / .stat-label.
  label: { marginBottom: 2, letterSpacing: 0.8 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  fieldFocused: { borderColor: colors.primary, backgroundColor: colors.surfaceRaised },
  fieldError: { borderColor: colors.negative },
  fieldDisabled: { opacity: 0.5 },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    // TextInput does not inherit from Text, so the family is set explicitly.
    fontFamily: fontFamily.regular,
    fontVariant: ['tabular-nums'],
    // react-native-web draws a focus ring on the inner input; the wrapper owns it.
    outlineStyle: 'none',
  } as never,
  affix: { paddingHorizontal: spacing.xs },
  helper: { marginTop: 2 },
});
