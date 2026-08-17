import { useEffect, useId, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, G, Path } from 'react-native-svg';
import { Icon, type IconSize } from './ui/Icon';
import { setThemeTransitionOrigin, useThemeStore } from '@/lib/stores/theme';
import { CRESCENT_CLIP, SUN_CORE, SUN_RAYS, installToggleFx } from '@/lib/theme-toggle-fx';
import { colors, radius } from '@/lib/theme';

export type ThemeToggleProps = {
  /** Diameter. 40 suits the nav bar; the original design is 72. */
  size?: number;
};

const IS_WEB = Platform.OS === 'web';

// At module scope rather than in an effect: the stylesheet supplies the icon's
// fill, so injecting it after first paint would show one black frame. Guarded
// on `document`, so it is a no-op under the test runner and on native.
installToggleFx();

/**
 * Day/night toggle.
 *
 * On the web this is the "Expand" animation from alfiejones/theme-toggles — the
 * sun's core swells, its rays shrink inward, and a crescent clip sweeps across
 * to bite the disc into a moon. See `lib/theme-toggle-fx.ts` for the vendored
 * CSS and the licence.
 *
 * React Native has no CSS and cannot interpolate an SVG `d`, and that morph is
 * the entire effect — without it the sun would swell but never become a moon.
 * So native keeps the earlier cross-fade, where a sun rotates and shrinks away
 * as a moon rotates in. Two icons, one shell.
 */
export function ThemeToggle({ size = 40 }: ThemeToggleProps) {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);

  const isDark = theme === 'dark';
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedMotion();

  const iconSize: IconSize = size >= 56 ? 24 : 20;
  const ref = useRef<unknown>(null);

  // The circular reveal grows from here, so it has to be measured before the
  // theme changes — once the transition starts, the page is a snapshot.
  function handlePress() {
    if (IS_WEB) {
      const node = ref.current as HTMLElement | null;
      const rect = node?.getBoundingClientRect();
      if (rect) setThemeTransitionOrigin(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    toggle();
  }

  return (
    <Pressable
      ref={ref as never}
      onPress={handlePress}
      accessibilityRole="switch"
      accessibilityLabel="Toggle day and night theme"
      // aria-pressed in the original; `checked` is the React Native equivalent.
      accessibilityState={{ checked: isDark }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      {...(IS_WEB
        ? ({
            title: isDark ? 'Switch to light mode' : 'Switch to dark mode',
            // A marker, not a state. The stylesheet reads which way the icon
            // should point from the theme attribute on the document root, so
            // the icon and the palette change in the same DOM write — which is
            // what lets the circular reveal capture both in one snapshot.
            dataSet: { splexToggle: '' },
          } as object)
        : {})}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: radius.pill },
        styles.plate,
        !reducedMotion && hovered && !pressed ? styles.hovered : null,
        !reducedMotion && pressed ? styles.pressed : null,
      ]}
    >
      {IS_WEB ? (
        <ExpandIcon size={iconSize} />
      ) : (
        <CrossFadeIcon size={iconSize} isDark={isDark} reducedMotion={reducedMotion} />
      )}
    </Pressable>
  );
}

/**
 * Web. Every moving part is driven by CSS, so this renders one static tree —
 * `ThemeToggle`'s data attribute is what makes it move.
 *
 * No `fill` prop: the stylesheet sets it from the nav palette, and an SVG
 * presentation attribute cannot hold a `var()` anyway.
 */
function ExpandIcon({ size }: { size: number }) {
  // React's generated ids contain colons, which are not valid inside url(#…).
  const clipId = `splex-toggle-${useId().replace(/:/g, '')}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <ClipPath id={clipId}>
        <Path d={CRESCENT_CLIP} />
      </ClipPath>
      <G clipPath={`url(#${clipId})`}>
        <Circle cx={SUN_CORE.cx} cy={SUN_CORE.cy} r={SUN_CORE.r} />
        <Path d={SUN_RAYS} />
      </G>
    </Svg>
  );
}

/** Matches the original snippet's `--dur`. */
const DURATION = 700;
/** The snippet's cubic-bezier(.34,1.56,.64,1) — an overshooting spring. */
const SPRING = Easing.bezier(0.34, 1.56, 0.64, 1);

/**
 * Native. One driver interpolated into both icons' opacity, scale and rotation,
 * which is what produces the cross-fade rather than a hard swap.
 */
function CrossFadeIcon({
  size,
  isDark,
  reducedMotion,
}: {
  size: IconSize;
  isDark: boolean;
  reducedMotion: boolean;
}) {
  // 0 = day, 1 = night.
  const progress = useRef(new Animated.Value(isDark ? 1 : 0)).current;

  useEffect(() => {
    const target = isDark ? 1 : 0;
    if (reducedMotion) {
      progress.setValue(target);
      return;
    }

    Animated.timing(progress, {
      toValue: target,
      duration: DURATION,
      easing: SPRING,
      // Colour cannot be driven natively, and the fill changes with the theme.
      useNativeDriver: false,
    }).start();
  }, [isDark, reducedMotion, progress]);

  const sunStyle = {
    opacity: progress.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' }),
    transform: [
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) },
      { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) },
    ],
  };

  const moonStyle = {
    opacity: progress.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
      { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) },
    ],
  };

  return (
    // Both icons occupy the same cell and cross-fade, so neither reflows.
    <View style={styles.stack}>
      {/* Nav-palette colours, not `warning`/`primaryText`: those are measured
          against the page, and this button lives on a bar that is dark in
          both themes. */}
      <Animated.View style={[styles.layer, sunStyle]}>
        <Icon name="sun" size={size} weight="fill" color={colors.navWarm} />
      </Animated.View>
      <Animated.View style={[styles.layer, moonStyle]}>
        <Icon name="moon" size={size} weight="fill" color={colors.navCool} />
      </Animated.View>
    </View>
  );
}

/**
 * Honours the OS setting. The vendored stylesheet has its own
 * `prefers-reduced-motion` block for the icon; this covers the hover and press
 * scaling, and the native cross-fade.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  // The original snippet's amber/violet gradients, flattened to one neutral
  // plate: a gradient is imperceptible at nav-bar size and would cost a
  // dependency. The icon itself carries the state change.
  plate: { backgroundColor: colors.navFill, borderColor: colors.navBorder },
  hovered: { transform: [{ scale: 1.08 }] },
  pressed: { transform: [{ scale: 0.95 }] },
  stack: { flex: 1, alignSelf: 'stretch' },
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
