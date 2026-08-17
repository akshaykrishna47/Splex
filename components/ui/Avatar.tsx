import { Image, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { radius, tintBackground, tintFor } from '@/lib/theme';

export type AvatarProps = {
  name: string;
  url?: string | null;
  size?: number;
  /** Dims the avatar for members who have been removed from the trip. */
  muted?: boolean;
};

export function Avatar({ name, url, size = 36, muted = false }: AvatarProps) {
  const dimension = { width: size, height: size, borderRadius: radius.pill };

  if (url) {
    return <Image source={{ uri: url }} style={[dimension, muted && styles.muted]} />;
  }

  const tint = tintFor(name || '?');

  // Tinted fill with a matching coloured glyph, rather than a solid block of
  // colour — the same treatment as the reference's transaction icon chips, and
  // far calmer when a dozen of them share a screen.
  return (
    <View
      style={[
        styles.fallback,
        dimension,
        { backgroundColor: tintBackground(tint, 0.16), borderColor: tintBackground(tint, 0.32) },
        muted && styles.muted,
      ]}
    >
      <Text
        weight="600"
        numeric={false}
        style={{ color: tint, fontSize: Math.round(size * 0.38) }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

/** "Aditi Rao" -> "AR"; "cher" -> "CH"; "" -> "?" */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] as string).slice(0, 2).toUpperCase();
  return ((parts[0] as string)[0]! + (parts[parts.length - 1] as string)[0]!).toUpperCase();
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  muted: { opacity: 0.4 },
});
