/**
 * Main visual of a spatial room (My Home card, room page): loads the room's
 * captured views and shows them as a swipeable room. Until they arrive (or if
 * they can't be loaded) the capture's still cover image is shown instead.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { CAPTURE_LENSES, getRoomCapture, type RoomCapture, type RoomCaptureSummary } from '@/services/roomCaptures';

import SpatialRoomView from './SpatialRoomView';

type Props = {
  roomId: string;
  capture: RoomCaptureSummary;
  width: number;
  height: number;
  onTap?: () => void;
  /** Overlays drawn above the room (don't take touches). */
  children?: React.ReactNode;
};

export default function RoomSpatialHero({ roomId, capture, width, height, onTap, children }: Props) {
  const [full, setFull] = React.useState<RoomCapture | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getRoomCapture(roomId)
      .then((c) => !cancelled && setFull(c))
      .catch(() => {}); // keep the still cover
    return () => {
      cancelled = true;
    };
  }, [roomId, capture.id]);

  const tap = React.useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onEnd((_e, success) => {
          if (success) onTap?.();
        }),
    [onTap]
  );

  if (!full || full.frames.length === 0 || width <= 0) {
    return (
      <GestureDetector gesture={tap}>
        <View style={{ width, height }} collapsable={false}>
          {capture.coverImageUri && (
            <Image source={{ uri: capture.coverImageUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          )}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {children}
          </View>
        </View>
      </GestureDetector>
    );
  }

  // Open on the view the room uses, else the middle of the capture.
  const initial =
    full.frames.find((f) => f.id === full.selectedView?.frameId)?.angleDeg ??
    full.frames[Math.floor(full.frames.length / 2)].angleDeg;

  return (
    <SpatialRoomView
      frames={full.frames}
      loops={full.loops}
      fovDeg={CAPTURE_LENSES[full.lens ?? 'wide']?.fovDeg ?? CAPTURE_LENSES.wide.fovDeg}
      initialAngle={initial}
      width={width}
      height={height}
      onTap={onTap}
    >
      {children}
    </SpatialRoomView>
  );
}
