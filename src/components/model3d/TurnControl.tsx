/**
 * Turns the selected 3D product in the room: drag the strip (or tap the
 * arrows) to change which way the model faces. It only swaps pre-rendered
 * turntable frames — no network, no generation.
 */

import React from 'react';

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import { Colors } from '@/constants/colors';
import { frameIndexForYaw } from '@/services/modelFrames';

type Props = {
  yawDeg: number;
  frameCount: number;
  onChange: (yawDeg: number) => void;
  onOpenViewer: () => void;
};

/** Degrees of turn per point dragged. */
const DEG_PER_POINT = 0.9;

export default function TurnControl({ yawDeg, frameCount, onChange, onOpenViewer }: Props) {
  const step = 360 / frameCount;
  // Kept outside React state so the gesture isn't rebuilt (and interrupted)
  // while it changes the angle.
  const currentYaw = useSharedValue(yawDeg);
  const startYaw = useSharedValue(yawDeg);
  const lastFrame = useSharedValue(frameIndexForYaw(yawDeg, frameCount));
  React.useEffect(() => {
    currentYaw.set(yawDeg);
  }, [yawDeg, currentYaw]);

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-8, 8])
        .failOffsetY([-14, 14])
        .onStart(() => {
          startYaw.set(currentYaw.get());
          lastFrame.set(frameIndexForYaw(currentYaw.get(), frameCount));
        })
        .onUpdate((event) => {
          const next = startYaw.get() + event.translationX * DEG_PER_POINT;
          const frame = frameIndexForYaw(next, frameCount);
          // Only update when a different view would be shown.
          if (frame !== lastFrame.get()) {
            lastFrame.set(frame);
            onChange(next);
          }
        }),
    [frameCount, onChange, currentYaw, startYaw, lastFrame]
  );

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.arrow} onPress={() => onChange(yawDeg - step)} accessibilityLabel="Turn left">
        <Text style={styles.arrowText}>⟲</Text>
      </TouchableOpacity>
      <GestureDetector gesture={pan}>
        <View style={styles.strip} accessibilityLabel="Drag to turn the product">
          <Text style={styles.stripText}>DRAG TO TURN</Text>
        </View>
      </GestureDetector>
      <TouchableOpacity style={styles.arrow} onPress={() => onChange(yawDeg + step)} accessibilityLabel="Turn right">
        <Text style={styles.arrowText}>⟳</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.viewButton} onPress={onOpenViewer} accessibilityLabel="View in 3D">
        <Text style={styles.viewButtonText}>3D</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    color: Colors.textPrimary,
    fontSize: 18,
  },
  strip: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripText: {
    color: Colors.accentText,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  viewButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewButtonText: {
    color: Colors.cardHighlight,
    fontSize: 12,
    fontWeight: '800',
  },
});
