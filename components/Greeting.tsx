import { StyleSheet, View } from 'react-native';
import { Text } from './ui/Text';
import { resolveGreeting } from '@/lib/greeting';
import { colors, fontFamily, fontSize, spacing } from '@/lib/theme';

export type GreetingProps = {
  displayName?: string | null;
  email?: string | null;
};

/**
 * "Hi," in muted body sans, then the name as the hero.
 *
 * Three things carry the contrast together: Lobster, ~1.9× the size, and the
 * warm accent. The script face is confined to this one word — it is a display
 * font, not something to read a sentence in.
 *
 * It is dropped for names outside the Latin script, since Lobster has no
 * glyphs for them and the browser would fall back mid-word. Size and colour
 * stay, so the name is still clearly the hero.
 */
export function Greeting({ displayName, email }: GreetingProps) {
  const { name, useSerif } = resolveGreeting(displayName, email);

  return (
    <View style={styles.row}>
      <Text variant="body" tone="muted" style={styles.hi}>
        Hi,
      </Text>

      {/*
        Deliberately no `numberOfLines`: react-native-web implements it with
        `overflow: hidden`, which sheared the descenders off Lobster's g/j/p/q/y
        — a "y" rendered as a "v". The length is already capped in
        `resolveGreeting`, so clamping here only ever clipped glyphs.
      */}
      <Text
        style={[styles.name, useSerif ? styles.script : styles.system]}
        accessibilityLabel={`Hi, ${name}`}
      >
        {name}
      </Text>
    </View>
  );
}

const GREETING_SIZE = fontSize.xl;
const NAME_SIZE = Math.round(GREETING_SIZE * 1.9);

const styles = StyleSheet.create({
  // `flex-end` rather than `baseline`: a script face sits on a different
  // baseline to the sans, and aligning the two boxes at the bottom keeps "Hi,"
  // visually seated against the name.
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' },
  hi: { fontSize: GREETING_SIZE, lineHeight: Math.round(GREETING_SIZE * 1.4) },
  name: {
    fontSize: NAME_SIZE,
    // Generous enough for Lobster's long descenders. Left to the font default
    // the line box is tight and the tails are cut off.
    lineHeight: Math.round(NAME_SIZE * 1.35),
    color: colors.accent,
    flexShrink: 1,
  },
  script: { fontFamily: fontFamily.name },
  // System stack: covers CJK, Tamil, Arabic and everything Lobster can't draw.
  system: {
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontWeight: '600',
  },
});
