/**
 * ProductSelector — the user draws a freehand loop around the product they
 * want. Purely local: drawing never calls any API. On CONFIRM it reports the
 * outline as points normalized to the IMAGE (0..1), so the caller can map it
 * onto the original photo at any resolution.
 *
 * Coordinates: touch (view) → displayed image rect (the photo is shown with
 * "contain", so it can be letterboxed) → normalized image coordinates.
 * Normalized points don't depend on screen size or pixel density.
 */

import React from 'react';

import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Colors } from '@/constants/colors';
import type { NormalizedPoint } from '@/services/productSelection';

type Point = { x: number; y: number };

type Props = {
  imageUri: string;
  busy?: boolean;
  onConfirm: (polygon: NormalizedPoint[]) => void;
};

/** Minimum finger travel (points) between recorded vertices. */
const MIN_STEP = 4;
const MAX_POINTS = 800;
const MIN_POINTS = 8;
/** Smallest accepted selection, as a fraction of the image area. */
const MIN_AREA = 0.004;
const STROKE = 3;

function polygonArea(points: NormalizedPoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export default function ProductSelector({ imageUri, busy = false, onConfirm }: Props) {
  const [box, setBox] = React.useState({ width: 0, height: 0 });
  const [natural, setNatural] = React.useState<{ width: number; height: number } | null>(null);
  const [points, setPoints] = React.useState<Point[]>([]);
  const [closed, setClosed] = React.useState(false);
  const [hint, setHint] = React.useState<string | null>(null);

  React.useEffect(() => {
    Image.getSize(
      imageUri,
      (width, height) => setNatural({ width, height }),
      () => setHint("This photo couldn't be loaded.")
    );
  }, [imageUri]);

  // Where the photo actually appears inside the box ("contain").
  const rect = React.useMemo(() => {
    if (!natural || !box.width || !box.height) return null;
    const scale = Math.min(box.width / natural.width, box.height / natural.height);
    const width = natural.width * scale;
    const height = natural.height * scale;
    return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
  }, [natural, box]);

  const clampToImage = React.useCallback(
    (x: number, y: number): Point => {
      if (!rect) return { x, y };
      return {
        x: Math.min(rect.x + rect.width, Math.max(rect.x, x)),
        y: Math.min(rect.y + rect.height, Math.max(rect.y, y)),
      };
    },
    [rect]
  );

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .enabled(!busy && !!rect)
        .onBegin((event) => {
          // A new stroke replaces the previous outline.
          setClosed(false);
          setHint(null);
          setPoints([clampToImage(event.x, event.y)]);
        })
        .onUpdate((event) => {
          const next = clampToImage(event.x, event.y);
          setPoints((current) => {
            const last = current[current.length - 1];
            if (current.length >= MAX_POINTS) return current;
            if (last && Math.hypot(next.x - last.x, next.y - last.y) < MIN_STEP) return current;
            return [...current, next];
          });
        })
        .onFinalize(() => setClosed(true)),
    [busy, rect, clampToImage]
  );

  const segments = React.useMemo(() => {
    const pairs: [Point, Point][] = [];
    for (let i = 1; i < points.length; i++) pairs.push([points[i - 1], points[i]]);
    if (closed && points.length > 2) pairs.push([points[points.length - 1], points[0]]);
    return pairs.map(([a, b]) => {
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      return {
        left: (a.x + b.x) / 2 - length / 2,
        top: (a.y + b.y) / 2 - STROKE / 2,
        width: length + STROKE / 2,
        transform: [{ rotate: `${Math.atan2(b.y - a.y, b.x - a.x)}rad` }],
      };
    });
  }, [points, closed]);

  const clear = () => {
    setPoints([]);
    setClosed(false);
    setHint(null);
  };

  const confirm = () => {
    if (!rect) return;
    const polygon = points.map((p) => ({ x: (p.x - rect.x) / rect.width, y: (p.y - rect.y) / rect.height }));
    if (polygon.length < MIN_POINTS || polygonArea(polygon) < MIN_AREA) {
      setHint('Draw a loop all the way around the product.');
      return;
    }
    onConfirm(polygon);
  };

  const hasOutline = closed && points.length >= MIN_POINTS;

  return (
    <View style={styles.container}>
      <GestureDetector gesture={pan}>
        <View
          style={styles.canvas}
          onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          collapsable={false}
        >
          {rect && (
            <Image
              source={{ uri: imageUri }}
              style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
            />
          )}
          {segments.map((style, i) => (
            <View key={i} pointerEvents="none" style={[styles.segment, style]} />
          ))}
          {points.length === 0 && rect && (
            <View pointerEvents="none" style={styles.placeholder}>
              <Text style={styles.placeholderText}>Draw around your product</Text>
            </View>
          )}
          {busy && (
            <View style={styles.busy}>
              <ActivityIndicator size="large" color={Colors.cardHighlight} />
              <Text style={styles.busyText}>Preparing your product…</Text>
            </View>
          )}
        </View>
      </GestureDetector>

      {hint && <Text style={styles.hint}>{hint}</Text>}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.secondary, (busy || points.length === 0) && styles.disabled]}
          onPress={clear}
          disabled={busy || points.length === 0}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryText}>CLEAR</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primary, (busy || !hasOutline) && styles.disabled]}
          onPress={confirm}
          disabled={busy || !hasOutline}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryText}>CONFIRM</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  canvas: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segment: {
    position: 'absolute',
    height: STROKE,
    borderRadius: STROKE / 2,
    backgroundColor: Colors.accent,
  },
  placeholder: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: 'center',
  },
  placeholderText: {
    color: Colors.cardHighlight,
    backgroundColor: 'rgba(11, 18, 32, 0.7)',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
  busy: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 18, 32, 0.6)',
  },
  busyText: {
    color: Colors.cardHighlight,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },
  hint: {
    color: Colors.warningText,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  secondary: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  primary: {
    flex: 2,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.cardHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: Colors.cardHighlightText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  disabled: {
    opacity: 0.5,
  },
});
