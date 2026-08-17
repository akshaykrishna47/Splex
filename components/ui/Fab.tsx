import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import { Sparkles } from './Sparkles';
import { Text } from './Text';
import { colors, radius, spacing } from '@/lib/theme';

export type FabProps = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
};

const IS_WEB = Platform.OS === 'web';

/**
 * Floating action button, bottom-right.
 *
 * Replaces the fixed footer bar: the footer permanently ate a strip of every
 * screen, which on a phone is a meaningful slice of the expense list. A FAB
 * floats over the content instead.
 *
 * On narrow screens it collapses to a circle — a wide pill would sit over the
 * amounts on the right-hand side of each row.
 */
export function Fab({ label, onPress, icon = 'add', loading = false }: FabProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [hovered, setHovered] = useState(false);

  const compact = width < 520;

  // The host stretches to fill the parent and pins the button to its corner,
  // rather than being a shrink-wrapped box offset from the edges. That way the
  // button can never end up outside the frame, whatever the parent's size.
  // `box-none` lets scrolls and taps pass through everywhere except the button.
  return (
    <View style={styles.host} pointerEvents="box-none">
      <Pressable
        onPress={loading ? undefined : onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ busy: loading }}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        {...(IS_WEB ? ({ dataSet: { splexSparkle: 'lift' } } as object) : {})}
        style={({ pressed }) => [
          styles.fab,
          compact ? styles.circle : styles.pill,
          // Safe-area insets are 0 on the web and non-zero on a notched phone.
          { marginBottom: insets.bottom, marginRight: insets.right },
          hovered && styles.hovered,
          pressed && styles.pressed,
        ]}
      >
        {/* Decorative, and outside the button's box — hence no clipping here. */}
        <Sparkles />

        {loading ? (
          <ActivityIndicator size="small" color={colors.textInverse} />
        ) : (
          <>
            <Icon name={icon} size={24} color={colors.textInverse} />
            {!compact ? (
              <Text variant="label" tone="inverse" numeric={false}>
                {label}
              </Text>
            ) : null}
          </>
        )}
      </Pressable>
    </View>
  );
}

/** Bottom padding a scroll view needs so content can clear the FAB. */
export const FAB_CLEARANCE = 88;

const styles = StyleSheet.create({
  host: {
    /**
     * `fixed` on web, `absolute` on native.
     *
     * `absolute` fills the parent — but only fills the VIEWPORT if that parent
     * has a bounded height. Under the navigator the screen container is
     * content-sized, so `inset: 0` spanned the whole scrollable content and
     * `flex-end` parked the button at the bottom of it, well below the fold.
     * `fixed` anchors to the viewport instead, which is what a floating button
     * actually wants. Native screens are viewport-bounded already, so
     * `absolute` is correct there and `fixed` is not supported.
     */
    position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    // Keeps the button clear of every edge at any viewport size. The right
    // inset is doubled so the button sits comfortably in from the edge rather
    // than hugging it.
    padding: spacing.lg,
    paddingRight: spacing.xxl,
    zIndex: 10,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    // The one place a shadow earns its keep: the button floats above content,
    // so it needs to read as detached rather than painted on.
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pill: { height: 56, paddingHorizontal: spacing.xl, borderRadius: radius.pill },
  circle: { width: 56, height: 56, borderRadius: radius.pill },
  hovered: { backgroundColor: colors.primaryPressed },
  pressed: { backgroundColor: colors.primaryPressed, opacity: 0.9 },
});
