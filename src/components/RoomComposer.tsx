/**
 * RoomComposer — the editable room canvas on the Visualization screen.
 *
 * The ORIGINAL room photo is the background and every product is its own
 * layer (its original photo), positioned by the product's normalized
 * `transform` from the visualization session. Nothing here ever calls the
 * generation API.
 *
 * Gestures run on the UI thread (gesture-handler + Reanimated) and write to
 * one shared map of live layer geometry, so dragging does not re-render React.
 * The session store is only updated when a gesture ENDS (and on selection).
 *
 * - one finger on a product: select it (bring to front) and drag it
 * - pinch anywhere on the canvas: resize the selected product
 * - two-finger twist anywhere on the canvas: rotate the selected product
 * - tap empty space: deselect
 */

import React from 'react';

import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { Colors } from '@/constants/colors';
import {
  MAX_LAYER_WIDTH,
  MIN_LAYER_WIDTH,
  type ProductTransform,
  type SessionProduct,
} from '@/services/visualizationSession';

type Geometry = Pick<ProductTransform, 'x' | 'y' | 'width' | 'rotation'>;
type LayerMap = Record<string, ProductTransform>;

type Props = {
  width: number;
  height: number;
  roomImageUri: string | null;
  products: SessionProduct[];
  selectedProductId: string | null;
  onSelect: (productId: string | null) => void;
  /** Called once when a gesture ends — not per frame. */
  onTransformEnd: (productId: string, geometry: Geometry) => void;
  onProductAspect: (productId: string, aspect: number) => void;
  onRoomAspect?: (aspect: number) => void;
};

/** Extra touch slop around each layer, in px, so small products are easy to grab. */
const HIT_SLOP = 10;

function toLayerMap(products: SessionProduct[]): LayerMap {
  const map: LayerMap = {};
  products.forEach((p) => {
    map[p.id] = p.transform;
  });
  return map;
}

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/** Topmost layer under (px, py), taking rotation into account. */
function hitTest(layers: LayerMap, canvasW: number, canvasH: number, px: number, py: number): string | null {
  'worklet';
  let best: string | null = null;
  let bestZ = -Infinity;
  for (const id in layers) {
    const t = layers[id];
    const w = t.width * canvasW;
    const h = w / t.aspect;
    const dx = px - t.x * canvasW;
    const dy = py - t.y * canvasH;
    const cos = Math.cos(-t.rotation);
    const sin = Math.sin(-t.rotation);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    if (Math.abs(localX) <= w / 2 + HIT_SLOP && Math.abs(localY) <= h / 2 + HIT_SLOP && t.zIndex > bestZ) {
      best = id;
      bestZ = t.zIndex;
    }
  }
  return best;
}

export default function RoomComposer({
  width,
  height,
  roomImageUri,
  products,
  selectedProductId,
  onSelect,
  onTransformEnd,
  onProductAspect,
  onRoomAspect,
}: Props) {
  // Live geometry, owned by the UI thread while this screen is mounted.
  const layers = useSharedValue<LayerMap>(toLayerMap(products));
  const selectedId = useSharedValue<string | null>(selectedProductId);
  const draggingId = useSharedValue<string | null>(null);
  const start = useSharedValue<Geometry>({ x: 0, y: 0, width: 0, rotation: 0 });
  const pinchStartWidth = useSharedValue(0);
  const rotationStart = useSharedValue(0);

  // Bring in products added/removed and aspect/zIndex changes from the store,
  // but keep the live position of layers that already exist — the store only
  // ever receives that geometry from us, so the UI thread is the source of truth.
  React.useEffect(() => {
    const incoming = toLayerMap(products);
    scheduleOnUI((next: LayerMap) => {
      'worklet';
      const live = layers.get();
      const merged: LayerMap = {};
      for (const id in next) {
        const cur = live[id];
        merged[id] = cur
          ? { ...next[id], x: cur.x, y: cur.y, width: cur.width, rotation: cur.rotation }
          : next[id];
      }
      layers.set(merged);
    }, incoming);
  }, [products, layers]);

  React.useEffect(() => {
    selectedId.set(selectedProductId);
  }, [selectedProductId, selectedId]);

  const gesture = React.useMemo(() => {
    const commit = (id: string) => {
      'worklet';
      const t = layers.get()[id];
      if (t) scheduleOnRN(onTransformEnd, id, { x: t.x, y: t.y, width: t.width, rotation: t.rotation });
    };

    const patch = (id: string, change: Partial<Geometry>) => {
      'worklet';
      const t = layers.get()[id];
      if (!t) return;
      layers.set({ ...layers.get(), [id]: { ...t, ...change } });
    };

    // Activates only when the first finger lands on a product, so a touch on
    // the empty room still scrolls the screen.
    const pan = Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((event, manager) => {
        if (draggingId.get() !== null) return; // a second finger — already dragging
        const touch = event.allTouches[0];
        const hit = hitTest(layers.get(), width, height, touch.x, touch.y);
        if (!hit) {
          manager.fail();
          return;
        }
        draggingId.set(hit);
        selectedId.set(hit);
        const t = layers.get()[hit];
        start.set({ x: t.x, y: t.y, width: t.width, rotation: t.rotation });
        manager.activate();
        scheduleOnRN(onSelect, hit);
      })
      .onUpdate((event) => {
        const id = draggingId.get();
        if (!id || width === 0 || height === 0) return;
        patch(id, {
          x: clamp(start.get().x + event.translationX / width, 0, 1),
          y: clamp(start.get().y + event.translationY / height, 0, 1),
        });
      })
      .onEnd(() => {
        const id = draggingId.get();
        if (id) commit(id);
      })
      .onFinalize(() => {
        draggingId.set(null);
      });

    // Pinch/rotate act on the selected product wherever the fingers are, so
    // small products can be resized without both fingers on them.
    const pinch = Gesture.Pinch()
      .onStart(() => {
        const id = selectedId.get();
        pinchStartWidth.set(id && layers.get()[id] ? layers.get()[id].width : 0);
      })
      .onUpdate((event) => {
        const id = selectedId.get();
        if (!id || pinchStartWidth.get() === 0) return;
        patch(id, { width: clamp(pinchStartWidth.get() * event.scale, MIN_LAYER_WIDTH, MAX_LAYER_WIDTH) });
      })
      .onEnd(() => {
        const id = selectedId.get();
        if (id) commit(id);
      });

    const rotation = Gesture.Rotation()
      .onStart(() => {
        const id = selectedId.get();
        rotationStart.set(id && layers.get()[id] ? layers.get()[id].rotation : 0);
      })
      .onUpdate((event) => {
        const id = selectedId.get();
        if (!id) return;
        patch(id, { rotation: rotationStart.get() + event.rotation });
      })
      .onEnd(() => {
        const id = selectedId.get();
        if (id) commit(id);
      });

    const tapEmpty = Gesture.Tap().onEnd((event) => {
      if (!hitTest(layers.get(), width, height, event.x, event.y)) scheduleOnRN(onSelect, null);
    });

    return Gesture.Simultaneous(pan, pinch, rotation, tapEmpty);
  }, [width, height, layers, selectedId, draggingId, start, pinchStartWidth, rotationStart, onSelect, onTransformEnd]);

  const ordered = React.useMemo(
    () => [...products].sort((a, b) => a.transform.zIndex - b.transform.zIndex),
    [products]
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.canvas, { width, height }]} collapsable={false}>
        {roomImageUri ? (
          <Image
            source={{ uri: roomImageUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="stretch"
            onLoad={(e) => {
              const { width: w, height: h } = e.nativeEvent.source;
              if (w && h) onRoomAspect?.(w / h);
            }}
          />
        ) : (
          <View style={styles.emptyRoom}>
            <View style={styles.floor} />
          </View>
        )}

        {ordered.map((product) => (
          <ProductLayer
            key={product.id}
            product={product}
            layers={layers}
            canvasWidth={width}
            canvasHeight={height}
            selected={product.id === selectedProductId}
            onAspect={onProductAspect}
          />
        ))}
      </View>
    </GestureDetector>
  );
}

type LayerProps = {
  product: SessionProduct;
  layers: SharedValue<LayerMap>;
  canvasWidth: number;
  canvasHeight: number;
  selected: boolean;
  onAspect: (productId: string, aspect: number) => void;
};

const ProductLayer = React.memo(function ProductLayer({
  product,
  layers,
  canvasWidth,
  canvasHeight,
  selected,
  onAspect,
}: LayerProps) {
  const { id, transform: fallback } = product;

  const animatedStyle = useAnimatedStyle(() => {
    // Right after a product is added the UI-thread map may not have it yet.
    const t = layers.get()[id] ?? fallback;
    const w = t.width * canvasWidth;
    const h = w / t.aspect;
    return {
      width: w,
      height: h,
      left: t.x * canvasWidth - w / 2,
      top: t.y * canvasHeight - h / 2,
      transform: [{ rotate: `${t.rotation}rad` }],
    };
  });

  // A ready cutout is a transparent PNG trimmed to the product, drawn without
  // a frame. Until then (or if removal failed) the original photo is shown
  // as a framed card, so it never looks like a finished cutout.
  const { cutout } = product;
  const isCutout = cutout.status === 'ready';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        isCutout ? styles.cutoutLayer : styles.layer,
        { zIndex: product.transform.zIndex },
        selected && (isCutout ? styles.cutoutLayerSelected : styles.layerSelected),
        animatedStyle,
      ]}
    >
      <Image
        source={{ uri: isCutout ? cutout.imageUri : product.imageUri }}
        style={[styles.layerImage, !isCutout && styles.photoImage, cutout.status === 'pending' && styles.pendingImage]}
        resizeMode={isCutout ? 'contain' : 'cover'}
        onLoad={(e) => {
          const { width: w, height: h } = e.nativeEvent.source;
          if (w && h && Math.abs(w / h - fallback.aspect) > 0.01) onAspect(id, w / h);
        }}
      />
      {cutout.status === 'pending' && (
        <View style={styles.layerStatus}>
          <ActivityIndicator size="small" color={Colors.cardHighlight} />
        </View>
      )}
      {cutout.status === 'failed' && (
        <View style={styles.layerWarning}>
          <Text style={styles.layerWarningText}>!</Text>
        </View>
      )}
      {selected && (
        <>
          <View style={[styles.handle, styles.handleTopLeft]} />
          <View style={[styles.handle, styles.handleTopRight]} />
          <View style={[styles.handle, styles.handleBottomLeft]} />
          <View style={[styles.handle, styles.handleBottomRight]} />
        </>
      )}
    </Animated.View>
  );
});

const HANDLE = 10;

const styles = StyleSheet.create({
  canvas: {
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  emptyRoom: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.surface2,
  },
  floor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '25%',
    backgroundColor: Colors.surface,
  },
  layer: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  layerSelected: {
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  layerImage: {
    width: '100%',
    height: '100%',
  },
  photoImage: {
    borderRadius: 7,
  },
  pendingImage: {
    opacity: 0.55,
  },
  cutoutLayer: {
    position: 'absolute',
  },
  cutoutLayerSelected: {
    borderWidth: 1.5,
    borderColor: Colors.accent,
    borderRadius: 4,
  },
  layerStatus: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerWarning: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerWarningText: {
    color: Colors.textInverse,
    fontSize: 12,
    fontWeight: '800',
  },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    backgroundColor: Colors.cardHighlight,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  handleTopLeft: { top: -HANDLE / 2 - 1, left: -HANDLE / 2 - 1 },
  handleTopRight: { top: -HANDLE / 2 - 1, right: -HANDLE / 2 - 1 },
  handleBottomLeft: { bottom: -HANDLE / 2 - 1, left: -HANDLE / 2 - 1 },
  handleBottomRight: { bottom: -HANDLE / 2 - 1, right: -HANDLE / 2 - 1 },
});
