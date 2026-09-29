/**
 * The captured room at a viewing direction: the two real frames either side
 * of `angle`, cross-faded (see blendAt). Never invents a view.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { blendAt } from '@/services/roomViewMath';

export type SpatialFrame = { id: string; angleDeg: number; previewUri: string; alignScore?: number | null };

type Props = {
  frames: SpatialFrame[];
  loops: boolean;
  angle: number;
  style?: StyleProp<ViewStyle>;
  /** Reports the frames' width / height once the first one loads. */
  onAspect?: (aspect: number) => void;
};

export default function SpatialBackdrop({ frames, loops, angle, style, onAspect }: Props) {
  if (frames.length === 0) return <View style={style} />;
  const blend = blendAt(frames, loops, angle);
  const lower = frames[blend.lower];
  const upper = frames[blend.upper];
  return (
    <View style={style} pointerEvents="none">
      <Image
        source={{ uri: lower.previewUri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={null}
        onLoad={(e) => {
          const { width, height } = e.source;
          if (width > 0 && height > 0) onAspect?.(width / height);
        }}
      />
      {blend.upper !== blend.lower && blend.weight > 0.01 && (
        <Image
          source={{ uri: upper.previewUri }}
          style={[StyleSheet.absoluteFill, { opacity: blend.weight }]}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={null}
        />
      )}
    </View>
  );
}
