import { Platform, StyleSheet, View } from 'react-native';
import { installSparkleFx } from '@/lib/sparkle-fx';

const IS_WEB = Platform.OS === 'web';

installSparkleFx();

/**
 * Where the four stars sit, straight from the source demo: two large above,
 * two small below, none of them symmetric — an even ring would read as a
 * loading spinner rather than a scatter.
 *
 * Offsets are percentages so the scatter stays in proportion whether the host
 * is a 56px circle or a full-width button.
 */
const SPARKS = [
  { index: 0, style: { top: -10, left: '12%' as const, width: 16, height: 16 } },
  { index: 1, style: { top: -14, right: '20%' as const, width: 16, height: 16 } },
  { index: 2, style: { bottom: -10, right: '8%' as const, width: 10, height: 10 } },
  { index: 3, style: { bottom: -12, left: '26%' as const, width: 10, height: 10 } },
];

/**
 * Decorative particles for a pressable. Render inside the Pressable; the host
 * carries `dataSet={{ splexSparkle: 'lift' | 'flat' }}`, which is what the
 * hover rules in `lib/sparkle-fx.ts` key off.
 *
 * `lift` for a control with its own drop shadow, `flat` for one without.
 */
export function Sparkles() {
  // Everything here is driven by :hover and clip-path, neither of which exists
  // on native. Rendering four invisible views there would be pure overhead.
  if (!IS_WEB) return null;

  return (
    <>
      {SPARKS.map((spark) => (
        <View
          key={spark.index}
          style={[styles.spark, spark.style]}
          {...({ dataSet: { splexSpark: String(spark.index) } } as object)}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  spark: {
    position: 'absolute',
    // The twinkle keyframes override this from the first frame. It only
    // matters where there is no CSS at all — native, where these stay
    // invisible rather than showing four untextured squares.
    transform: [{ scale: 0 }],
    pointerEvents: 'none',
    zIndex: 1,
  },
});
