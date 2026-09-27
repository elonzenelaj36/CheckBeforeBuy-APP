/**
 * A swipeable 180°/360° room — the main visual of a spatial room (My Home
 * card, room page). Drag left/right to look around; a tap calls `onTap`.
 * Overlays (captions, badges) go in `children` and don't take touches.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import SpatialBackdrop, { type SpatialFrame } from './SpatialBackdrop';
import { useSpatialAngle } from './useSpatialAngle';

type Props = {
  frames: SpatialFrame[];
  loops: boolean;
  /** Horizontal field of view the frames show (CAPTURE_LENSES[lens].fovDeg). */
  fovDeg: number;
  initialAngle?: number;
  width: number;
  height: number;
  onTap?: () => void;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export default function SpatialRoomView({ frames, loops, fovDeg, initialAngle, width, height, onTap, style, children }: Props) {
  const { angle, drag } = useSpatialAngle(frames, loops, { initialAngle });

  // Swiping swaps images constantly — load every preview up front so it never flashes.
  React.useEffect(() => {
    if (frames.length > 0) Image.prefetch(frames.map((f) => f.previewUri), 'memory-disk').catch(() => false);
  }, [frames]);

  const gesture = React.useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-8, 8])
      .failOffsetY([-14, 14])
      .onBegin(() => drag.begin())
      .onUpdate((e) => drag.update(e.translationX, width, fovDeg))
      .onEnd((e) => drag.end(e.velocityX, width, fovDeg));
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((_e, success) => {
        if (success) onTap?.();
      });
    return Gesture.Exclusive(pan, tap);
  }, [drag, width, fovDeg, onTap]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[{ width, height, overflow: 'hidden' }, style]} collapsable={false}>
        <SpatialBackdrop frames={frames} loops={loops} angle={angle} style={StyleSheet.absoluteFill} />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {children}
        </View>
      </View>
    </GestureDetector>
  );
}
