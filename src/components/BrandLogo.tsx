/**
 * BrandLogo — small header brand mark shown at the top of top-level screens.
 *
 * Sized relative to screen width (clamped) so it reads consistently across
 * small phones, large phones, and tablets without ever dominating the page.
 */

import {
  Image,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

const logoSource = require('@/assets/images/App-logo/Check Before Buy -icon.png');

const MIN_SIZE = 44;
const MAX_SIZE = 72;
const WIDTH_RATIO = 0.16;

type BrandLogoProps = {
  minSize?: number;
  maxSize?: number;
  widthRatio?: number;
  style?: StyleProp<ViewStyle>;
};

export default function BrandLogo({
  minSize = MIN_SIZE,
  maxSize = MAX_SIZE,
  widthRatio = WIDTH_RATIO,
  style,
}: BrandLogoProps) {
  const { width } = useWindowDimensions();
  const size = Math.min(maxSize, Math.max(minSize, width * widthRatio));

  return (
    <View style={[styles.container, style]}>
      <Image
        source={logoSource}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
});
