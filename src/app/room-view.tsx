/**
 * Room viewer — swipe left/right through a room's captured 180°/360° views.
 *
 * Only REAL captured frames are shown: the drag moves a continuous viewing
 * direction and the two frames on either side are cross-faded (see
 * services/roomViewMath.ts). A verified 360° capture wraps around; a 180°
 * capture (or a 360° whose full turn couldn't be verified) stops at its ends.
 *
 * "USE THIS VIEW" stores the view on the room's capture (the room's photos
 * are not changed) and, when opened from Arrange (`pick=1`), switches the
 * current visualization to it.
 */

import React from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { CAPTURE_LENSES, getRoomCapture, selectRoomView, type RoomCapture } from '@/services/roomCaptures';
import { blendAt, dragToDegrees, normalizeAngle, stepFrame, wrap360 } from '@/services/roomViewMath';
import { getRoomById, type Room } from '@/services/rooms';
import { getSession, setSessionRoomView } from '@/services/visualizationSession';

const MAX_STAGE_HEIGHT = 520;
/** Fling: velocity multiplier per 16 ms frame, and the speed (deg/s) at which it stops. */
const FLING_DECAY = 0.93;
const FLING_STOP_DEG_S = 4;

export default function RoomView() {
  const router = useRouter();
  const params = useLocalSearchParams<{ roomId?: string; pick?: string }>();
  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
  const pickForSession = params.pick === '1';
  const { width: windowWidth } = useWindowDimensions();

  const [room, setRoom] = React.useState<Room | null>(null);
  const [capture, setCapture] = React.useState<RoomCapture | null>(null);
  const [state, setState] = React.useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [prefetched, setPrefetched] = React.useState(false);
  const [angle, setAngle] = React.useState(0);
  const [frameAspect, setFrameAspect] = React.useState(9 / 16);
  const [saving, setSaving] = React.useState(false);

  // Kept outside React state (like TurnControl) so gestures and animations
  // read the live angle without being rebuilt on every change.
  const angleNow = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const animation = useSharedValue<number | null>(null);

  const frames = React.useMemo(() => capture?.frames ?? [], [capture]);
  const loops = !!capture?.loops;
  // A full-width drag turns the view by the lens's field of view (1:1 with the finger).
  const fovDeg = CAPTURE_LENSES[capture?.lens ?? 'wide']?.fovDeg ?? CAPTURE_LENSES.wide.fovDeg;

  const moveTo = React.useCallback(
    (a: number) => {
      const next = normalizeAngle(frames, loops, a);
      angleNow.set(next);
      setAngle(next);
    },
    [frames, loops, angleNow]
  );

  const stopAnimation = React.useCallback(() => {
    const id = animation.get();
    if (id != null) cancelAnimationFrame(id);
    animation.set(null);
  }, [animation]);

  React.useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    Promise.all([getRoomById(roomId), getRoomCapture(roomId)])
      .then(([r, c]) => {
        if (cancelled) return;
        setRoom(r);
        setCapture(c);
        if (!r || !c || c.frames.length === 0) {
          setState('missing');
          return;
        }
        // Start on the view in use: the session's (from Arrange), else the room's selected view, else the first.
        const sessionView = pickForSession ? getSession()?.room.view : null;
        const startId =
          (sessionView && sessionView.captureId === c.id ? sessionView.frameId : null) ?? c.selectedView?.frameId;
        const start = c.frames.find((f) => f.id === startId) ?? c.frames[0];
        angleNow.set(start.angleDeg);
        setAngle(start.angleDeg);
        setState('ready');
        // Swiping swaps images constantly — load every preview first so it never flashes.
        Image.prefetch(
          c.frames.map((f) => f.previewUri),
          'memory-disk'
        )
          .catch(() => false)
          .finally(() => !cancelled && setPrefetched(true));
      })
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
      stopAnimation();
    };
  }, [roomId, pickForSession, angleNow, stopAnimation]);

  const stageWidth = Math.min(windowWidth - 40, MAX_STAGE_HEIGHT * frameAspect);
  const stageHeight = stageWidth / frameAspect;

  /** Glides to a frame's exact angle (shortest way round when looping). */
  const snapTo = React.useCallback(
    (target: number) => {
      stopAnimation();
      const from = angleNow.get();
      let delta = target - from;
      if (loops) delta = ((delta + 540) % 360) - 180;
      const started = Date.now();
      const tick = () => {
        const t = Math.min((Date.now() - started) / 160, 1);
        moveTo(from + delta * (1 - (1 - t) ** 3));
        animation.set(t < 1 ? requestAnimationFrame(tick) : null);
      };
      animation.set(requestAnimationFrame(tick));
    },
    [loops, moveTo, stopAnimation, angleNow, animation]
  );

  const snapToNearest = React.useCallback(() => {
    if (frames.length === 0) return;
    const { nearest } = blendAt(frames, loops, angleNow.get());
    snapTo(frames[nearest].angleDeg);
  }, [frames, loops, snapTo, angleNow]);

  const fling = React.useCallback(
    (velocityDegS: number) => {
      stopAnimation();
      let v = velocityDegS;
      let last = Date.now();
      const tick = () => {
        const now = Date.now();
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const before = angleNow.get();
        moveTo(before + v * dt);
        v *= FLING_DECAY ** (dt / 0.016);
        const hitEnd = !loops && angleNow.get() === before && v !== 0;
        if (Math.abs(v) < FLING_STOP_DEG_S || hitEnd) {
          animation.set(null);
          snapToNearest();
          return;
        }
        animation.set(requestAnimationFrame(tick));
      };
      animation.set(requestAnimationFrame(tick));
    },
    [loops, moveTo, snapToNearest, stopAnimation, angleNow, animation]
  );

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-8, 8])
        .failOffsetY([-14, 14])
        .onBegin(() => {
          stopAnimation();
          dragStart.set(angleNow.get());
        })
        .onUpdate((e) => {
          moveTo(dragStart.get() + dragToDegrees(e.translationX, stageWidth, fovDeg));
        })
        .onEnd((e) => {
          fling(dragToDegrees(e.velocityX, stageWidth, fovDeg));
        }),
    [moveTo, fling, stageWidth, fovDeg, stopAnimation, dragStart, angleNow]
  );

  const shownState = roomId ? state : 'missing';
  if (shownState !== 'ready' || !capture || !room) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="MY HOME" title="Room views" />
          <View style={styles.messageCard}>
            {shownState === 'loading' ? (
              <ActivityIndicator color={Colors.myHomeAccent} />
            ) : (
              <>
                <Text style={styles.messageTitle}>
                  {shownState === 'error' ? "Couldn't load the room views" : 'No room views yet'}
                </Text>
                <Text style={styles.messageText}>
                  {shownState === 'error'
                    ? 'Check your connection and try again.'
                    : 'Record a 180° or 360° room capture from the room page to browse the room here.'}
                </Text>
              </>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const blend = blendAt(frames, loops, angle);
  const current = frames[blend.nearest];
  const lower = frames[blend.lower];
  const upper = frames[blend.upper];
  const selectedId = pickForSession ? getSession()?.room.view?.frameId ?? null : capture.selectedView?.frameId ?? null;
  const isSelected = current.id === selectedId;
  const approximate = capture.angleSource === 'time';

  // Position marker on the direction track (0..1 across the captured range).
  const first = frames[0].angleDeg;
  const last = frames[frames.length - 1].angleDeg;
  const trackPos = loops ? wrap360(angle) / 360 : last > first ? (angle - first) / (last - first) : 0;

  const applyToSession = (imageUri: string | null, view: Parameters<typeof setSessionRoomView>[1]) => {
    const session = getSession();
    if (pickForSession && session && session.room.id === room.id) setSessionRoomView(imageUri, view);
  };

  const useThisView = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await selectRoomView(room.id, capture.id, current.id);
      setCapture(updated);
      applyToSession(current.imageUri, {
        captureId: capture.id,
        frameId: current.id,
        angleDeg: current.angleDeg,
        mode: capture.mode,
      });
      if (pickForSession) {
        router.back();
      } else {
        Alert.alert('View selected', 'Products you place in this room will now be arranged on this view.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (error: any) {
      Alert.alert("Couldn't use this view", error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const useOriginalPhoto = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await selectRoomView(room.id, capture.id, null);
      setCapture(updated);
      applyToSession(room.primaryImageUri, null);
      router.back();
    } catch (error: any) {
      Alert.alert("Couldn't switch back", error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const usingView = pickForSession ? !!getSession()?.room.view : !!capture.selectedView;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader eyebrow="MY HOME" title={room.name} />

        <View style={styles.modeRow}>
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{capture.mode}° CAPTURE</Text>
          </View>
          <Text style={styles.modeMeta}>
            {frames.length} views · {CAPTURE_LENSES[capture.lens ?? 'wide']?.label ?? '1×'} lens{loops ? ' · wraps around' : ''}
            {approximate ? ' · angles estimated' : ''}
          </Text>
        </View>

        <GestureDetector gesture={pan}>
          <View style={[styles.stage, { width: stageWidth, height: stageHeight }]}>
            <Image
              source={{ uri: lower.previewUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={null}
              onLoad={(e) => {
                const { width, height } = e.source;
                if (width > 0 && height > 0) setFrameAspect(Math.min(2, Math.max(0.5, width / height)));
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
            {!prefetched && (
              <View style={styles.loadingPill}>
                <ActivityIndicator size="small" color={Colors.textPrimary} />
                <Text style={styles.loadingPillText}>Loading views…</Text>
              </View>
            )}
            {isSelected && (
              <View style={styles.selectedBadge}>
                <Text style={styles.selectedBadgeText}>IN USE</Text>
              </View>
            )}
          </View>
        </GestureDetector>

        {/* Direction: where in the captured range this view looks. */}
        <View style={[styles.directionRow, { width: stageWidth }]}>
          <TouchableOpacity
            style={styles.stepButton}
            onPress={() => snapTo(frames[stepFrame(frames, loops, blend.nearest, -1)].angleDeg)}
            accessibilityLabel="Previous view"
          >
            <Text style={styles.stepButtonText}>◀</Text>
          </TouchableOpacity>
          <View style={styles.trackBlock}>
            <View style={styles.track}>
              <View style={[styles.trackMarker, { left: `${Math.round(trackPos * 1000) / 10}%` }]} />
            </View>
            <Text style={styles.angleText}>
              {approximate ? '≈ ' : ''}
              {Math.round(current.angleDeg)}° of {loops ? 360 : Math.round(capture.coverageDeg)}°
            </Text>
          </View>
          <TouchableOpacity
            style={styles.stepButton}
            onPress={() => snapTo(frames[stepFrame(frames, loops, blend.nearest, 1)].angleDeg)}
            accessibilityLabel="Next view"
          >
            <Text style={styles.stepButtonText}>▶</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>Swipe left or right to look around the room.</Text>

        {capture.warnings.length > 0 && (
          <View style={styles.warningCard}>
            {capture.warnings.map((w) => (
              <Text key={w} style={styles.warningText}>
                • {w}
              </Text>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, (saving || isSelected) && styles.buttonDisabled]}
          onPress={useThisView}
          disabled={saving || isSelected}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {saving ? 'SAVING…' : isSelected ? 'THIS VIEW IS IN USE' : 'USE THIS VIEW'}
          </Text>
        </TouchableOpacity>

        {usingView && room.primaryImageUri && (
          <TouchableOpacity style={styles.secondaryButton} onPress={useOriginalPhoto} disabled={saving}>
            <Text style={styles.secondaryButtonText}>USE ORIGINAL ROOM PHOTO</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightBackground,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 60,
  },
  messageCard: {
    backgroundColor: Colors.myHomeSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
    padding: 22,
    gap: 8,
    alignItems: 'center',
  },
  messageTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  messageText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  modeBadge: {
    backgroundColor: Colors.lightMyHomeAccentDim,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  modeBadgeText: {
    color: Colors.lightMyHomeAccentText,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  modeMeta: {
    color: Colors.lightTextSecondary,
    fontSize: 12,
  },
  stage: {
    alignSelf: 'center',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Colors.myHomeSurface,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
  },
  loadingPill: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(11,18,32,0.7)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  loadingPillText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
  },
  selectedBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: Colors.myHomeAccent,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  selectedBadgeText: {
    color: Colors.cardHighlightText,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  directionRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
  },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.myHomeSurface,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
  },
  stepButtonText: {
    color: Colors.myHomeAccentText,
    fontSize: 14,
  },
  trackBlock: {
    flex: 1,
    gap: 6,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.lightBorder,
  },
  trackMarker: {
    position: 'absolute',
    top: -4,
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: 7,
    backgroundColor: Colors.lightMyHomeAccent,
    borderWidth: 2,
    borderColor: Colors.lightSurface,
  },
  angleText: {
    color: Colors.lightTextSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  hint: {
    color: Colors.lightTextSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },
  warningCard: {
    backgroundColor: Colors.lightWarningBg,
    borderColor: Colors.warning,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
    marginTop: 14,
  },
  warningText: {
    color: Colors.lightWarningText,
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: Colors.myHomeAccent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: Colors.cardHighlightText,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  secondaryButton: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.lightBorder,
    backgroundColor: Colors.lightSurface,
  },
  secondaryButtonText: {
    color: Colors.lightTextPrimary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
});
