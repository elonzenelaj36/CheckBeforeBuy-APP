/**
 * Main visual of a spatial room (My Home card, room page): loads the room's
 * captured views and shows them as a swipeable room. Until they arrive (or if
 * they can't be loaded) the capture's still cover image is shown instead.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { captureFovDeg, getRoomCapture, type RoomCapture, type RoomCaptureSummary } from '@/services/roomCaptures';
import type { ItemObservation } from '@/services/userItems';

import SpatialRoomView, { type SpatialHighlight } from './SpatialRoomView';

type Props = {
  roomId: string;
  capture: RoomCaptureSummary;
  width: number;
  height: number;
  onTap?: () => void;
  /** A detected item to outline (its best sighting on one of this capture's views). */
  selectedItem?: { id: string; name: string; observation: ItemObservation } | null;
  /** Overlays drawn above the room (don't take touches). */
  children?: React.ReactNode;
};

export default function RoomSpatialHero({ roomId, capture, width, height, onTap, selectedItem, children }: Props) {
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

  const obs = selectedItem?.observation;
  const obsFrame = obs?.frameId ? full.frames.find((f) => f.id === obs.frameId) : undefined;
  const highlight: SpatialHighlight | null =
    obs && obsFrame && obs.directionDeg != null && obs.halfWidthDeg != null
      ? {
          key: `${selectedItem!.id}:${obs.id}`,
          frameAngleDeg: obsFrame.angleDeg,
          directionDeg: obs.directionDeg,
          halfWidthDeg: obs.halfWidthDeg,
          y1: obs.box.y1,
          y2: obs.box.y2,
          label: selectedItem!.name,
        }
      : null;

  // Open on the view the room uses, else the middle of the capture.
  const initial =
    full.frames.find((f) => f.id === full.selectedView?.frameId)?.angleDeg ??
    full.frames[Math.floor(full.frames.length / 2)].angleDeg;

  return (
    <SpatialRoomView
      frames={full.frames}
      loops={full.loops}
      fovDeg={captureFovDeg(full)}
      initialAngle={initial}
      width={width}
      height={height}
      onTap={onTap}
      highlight={highlight}
    >
      {children}
    </SpatialRoomView>
  );
}
