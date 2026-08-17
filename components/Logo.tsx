import { Image, type ImageStyle, type StyleProp } from 'react-native';

export type LogoProps = {
  size?: number;
  style?: StyleProp<ImageStyle>;
};

/**
 * The Splex mark. The source PNG is transparent, so it sits on whatever
 * surface it is placed over without a plate behind it.
 *
 * `assets/logo.png` is the single source of truth for branding — every app,
 * favicon and PWA icon size is generated from it by `scripts/make-icons.mjs`.
 */
export function Logo({ size = 64, style }: LogoProps) {
  return (
    <Image
      source={require('../assets/logo.png')}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityLabel="Splex"
      accessible
    />
  );
}
