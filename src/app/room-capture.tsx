/**
 * Room capture — records an optional 180°/360° room sweep for a room.
 *
 * The video is recorded in the app (expo-camera) while the phone's rotation
 * is tracked (expo-sensors DeviceMotion → services/roomCaptureMotion.ts), so
 * every video moment can be matched to the direction the phone faced. The
 * backend extracts the views (services/roomCaptures.ts). If the rotation
 * sensor is unavailable, the capture still works but view angles are
 * estimated from time (the viewer says so).
 *
 * Lens: on iPhones with a physical ultra-wide camera the capture records
 * with it (0.5×, about twice the field of view), found through expo-camera's
 * `getAvailableLensesAsync` / `selectedLens` (iOS only). Everywhere else — and
 * if the lens can't be identified — it records with the normal 1× lens, as
 * before. Note: expo-camera's `zoom` prop can only zoom IN (0 = 1×), so it is
 * not used for this.
 *
 * The room's photos are never changed by a capture.
 */

import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { DeviceMotion } from 'expo-sensors';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { createYawTracker, type MotionEvent, type MotionTrack, type YawTracker } from '@/services/roomCaptureMotion';
import {
  CAPTURE_LENSES,
  minCoverageDeg,
  uploadRoomCapture,
  type CaptureLens,
  type CaptureMode,
} from '@/services/roomCaptures';
import { analyzeRoom } from '@/services/rooms';

const MAX_SECONDS = 90;
/** Stop a little past the target so the last direction has frames too. */
const AUTO_STOP_OVERSHOOT_DEG = 5;
const SENSOR_INTERVAL_MS = 20;
/** Smoothing of the displayed turning speed (0..1, higher = more responsive). */
const SPEED_SMOOTHING = 0.35;
/** "You can go a bit faster" only after this long, so the start of a turn isn't nagged. */
const TOO_SLOW_GRACE_S = 3;
/** 360°: from here on, tell the user they're nearly back where they started. */
const BACK_TO_START_DEG = 330;
/** The camera needs a moment to switch lenses before recording can start. */
const LENS_SWITCH_SETTLE_MS = 800;
/**
 * iOS lists lenses by their device name (e.g. "Back Ultra Wide Camera"). Names
 * are localized, so this may not match in every language — then 1× is used.
 */
const ULTRA_WIDE_NAME = /ultra[\s-]*wide/i;
/** Recording is 16:9 (9:16 in portrait); the preview box uses the same shape so it shows exactly what's recorded. */
const VIDEO_ASPECT = 9 / 16;

type Phase = 'choose' | 'camera' | 'recording' | 'processing' | 'error';

type Recording = { uri: string; mode: CaptureMode; motion: MotionTrack; lens: CaptureLens };

const MODES: { mode: CaptureMode; title: string; description: string }[] = [
  {
    mode: '180',
    title: '180° — one side of the room',
    description: 'Stand near a wall or in a doorway and turn from one side of the room to the other.',
  },
  {
    mode: '360',
    title: '360° — the whole room',
    description: 'Stand roughly in the middle of the room and turn all the way around, back to where you started.',
  },
];

export default function RoomCapture() {
  const router = useRouter();
  const params = useLocalSearchParams<{ roomId?: string }>();
  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;

  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = React.useState<Phase>('choose');
  const [mode, setMode] = React.useState<CaptureMode>('180');
  const [cameraReady, setCameraReady] = React.useState(false);
  const [motionAvailable, setMotionAvailable] = React.useState<boolean | null>(null);
  const [turned, setTurned] = React.useState(0);
  const [speed, setSpeed] = React.useState(0);
  const [elapsed, setElapsed] = React.useState(0);
  const [error, setError] = React.useState<{ message: string; canRetryUpload: boolean } | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  /** iOS device name of the ultra-wide lens, when this phone has one (null = only 1× available). */
  const [ultraWideName, setUltraWideName] = React.useState<string | null>(null);
  /** The user's lens choice; the ultra-wide is the default when it exists. */
  const [preferUltraWide, setPreferUltraWide] = React.useState(true);
  const [lensSettling, setLensSettling] = React.useState(false);
  const [stage, setStage] = React.useState<{ width: number; height: number } | null>(null);

  const cameraRef = React.useRef<CameraView>(null);
  const trackerRef = React.useRef<YawTracker | null>(null);
  const subscriptionRef = React.useRef<{ remove: () => void } | null>(null);
  const startRef = React.useRef(0);
  const stopAtRef = React.useRef<number | null>(null);
  const cancelledRef = React.useRef(false);
  const sawSensorsRef = React.useRef({ rate: false, gravity: false });
  const lastUiRef = React.useRef({ t: 0, yaw: 0, speed: 0 });
  /** Furthest turn from the start in each direction (the backend measures coverage the same way). */
  const extentRef = React.useRef({ pos: 0, neg: 0 });
  const settleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The last recorded video, kept so a failed upload can be re-sent without recording again. */
  const [lastRecording, setLastRecording] = React.useState<Recording | null>(null);

  const target = Number(mode);
  const lens: CaptureLens = ultraWideName && preferUltraWide ? 'ultra-wide' : 'wide';
  const lensProfile = CAPTURE_LENSES[lens];

  const stopSensors = () => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
  };

  // Leaving the screen mid-recording stops the camera and the sensor.
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
      stopSensors();
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      cameraRef.current?.stopRecording();
    },
    []
  );

  /** Blocks recording briefly while the camera switches lenses. */
  const settleLens = () => {
    setLensSettling(true);
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => setLensSettling(false), LENS_SWITCH_SETTLE_MS);
  };

  /** iOS only: finds the physical ultra-wide lens among the back cameras. */
  const detectLenses = (lenses: string[]) => {
    const ultra = lenses.find((name) => ULTRA_WIDE_NAME.test(name)) ?? null;
    if (ultra !== ultraWideName) {
      setUltraWideName(ultra);
      if (ultra && preferUltraWide) settleLens();
    }
  };

  const handleCameraReady = () => {
    setCameraReady(true);
    if (Platform.OS !== 'ios') return;
    cameraRef.current
      ?.getAvailableLensesAsync()
      .then(detectLenses)
      .catch(() => {}); // no lens list → stay on 1×
  };

  const chooseLens = (ultra: boolean) => {
    if (ultra === preferUltraWide) return;
    setPreferUltraWide(ultra);
    settleLens();
  };

  const openCamera = async (chosen: CaptureMode) => {
    setMode(chosen);
    setError(null);
    setNotice(null);
    setCameraReady(false);
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError({
          message: 'Camera access is needed to record the room. You can allow it in your phone settings.',
          canRetryUpload: false,
        });
        setPhase('error');
        return;
      }
    }
    try {
      const available = await DeviceMotion.isAvailableAsync();
      const allowed = available ? (await DeviceMotion.requestPermissionsAsync()).granted : false;
      setMotionAvailable(available && allowed);
    } catch {
      setMotionAvailable(false);
    }
    setPhase('camera');
  };

  const stopRecording = () => {
    if (stopAtRef.current == null) stopAtRef.current = Date.now() - startRef.current;
    cameraRef.current?.stopRecording();
  };

  const upload = async (recording: Recording) => {
    if (!roomId) return;
    setPhase('processing');
    setError(null);
    try {
      await uploadRoomCapture(roomId, recording.uri, recording.mode, recording.motion, recording.lens);
      setLastRecording(null);
      // Find the furniture in the new views in the background (Items Detected on the room page).
      // It can take a minute; a failure never affects the capture or the room.
      analyzeRoom(roomId).catch((e) => console.warn('[room-capture] item detection failed:', e?.message ?? e));
      router.replace({ pathname: '/room-view', params: { roomId } });
    } catch (e: any) {
      const status: number | undefined = e?.status;
      // 422/4xx = the recording itself can't be used → record again. Network/5xx → the same video can be re-sent.
      const canRetryUpload = status === undefined || status >= 500;
      setError({
        message:
          e?.message && status !== undefined
            ? e.message
            : 'Uploading the video failed. Check your connection and try again.',
        canRetryUpload,
      });
      setPhase('error');
    }
  };

  const startRecording = async () => {
    const camera = cameraRef.current;
    if (!camera || !cameraReady || lensSettling) return;
    const recordedLens = lens; // the lens can't change while recording
    cancelledRef.current = false;
    stopAtRef.current = null;
    sawSensorsRef.current = { rate: false, gravity: false };
    lastUiRef.current = { t: 0, yaw: 0, speed: 0 };
    extentRef.current = { pos: 0, neg: 0 };
    setTurned(0);
    setSpeed(0);
    setElapsed(0);
    setNotice(null);

    const tracker = createYawTracker(Platform.OS);
    trackerRef.current = tracker;
    startRef.current = Date.now();
    const autoStopAt = target + AUTO_STOP_OVERSHOOT_DEG;

    if (motionAvailable) {
      DeviceMotion.setUpdateInterval(SENSOR_INTERVAL_MS);
      subscriptionRef.current = DeviceMotion.addListener((event) => {
        const t = Date.now() - startRef.current;
        if (event.rotationRate) sawSensorsRef.current.rate = true;
        if (event.accelerationIncludingGravity) sawSensorsRef.current.gravity = true;
        const signed = tracker.push(event as MotionEvent, t);
        const extent = extentRef.current;
        extent.pos = Math.max(extent.pos, signed);
        extent.neg = Math.min(extent.neg, signed);
        // Coverage = furthest turn in the main direction, so a brief wrong-way start doesn't count against it.
        const yaw = Math.max(extent.pos, -extent.neg);
        const last = lastUiRef.current;
        if (t - last.t >= 150) {
          // Smoothed, so one jerky moment doesn't flip the guidance.
          const instant = ((yaw - last.yaw) / (t - last.t)) * 1000;
          const smoothed = last.speed + SPEED_SMOOTHING * (instant - last.speed);
          setTurned(yaw);
          setSpeed(smoothed);
          setElapsed(t / 1000);
          lastUiRef.current = { t, yaw, speed: smoothed };
        }
        if (yaw >= autoStopAt && stopAtRef.current == null) stopRecording();
      });
    }
    const timer = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 250);

    setPhase('recording');
    let uri: string | undefined;
    try {
      const result = await camera.recordAsync({ maxDuration: MAX_SECONDS });
      uri = result?.uri;
    } catch (e: any) {
      if (!cancelledRef.current) {
        setError({ message: e?.message ?? "The camera couldn't record. Please try again.", canRetryUpload: false });
        setPhase('error');
      }
      return;
    } finally {
      clearInterval(timer);
      stopSensors();
    }
    const stopAtMs = stopAtRef.current ?? Date.now() - startRef.current;

    if (cancelledRef.current) {
      setNotice('Recording cancelled — nothing was saved.');
      setPhase('camera');
      return;
    }
    if (!uri) {
      setError({ message: 'No video was recorded. Please try again.', canRetryUpload: false });
      setPhase('error');
      return;
    }

    const sensorsOk = motionAvailable && sawSensorsRef.current.rate && sawSensorsRef.current.gravity;
    const motion: MotionTrack = sensorsOk
      ? { v: 1, available: true, stopAtMs, samples: tracker.samples() }
      : {
          v: 1,
          available: false,
          reason: motionAvailable ? 'The rotation sensor sent no data.' : 'Rotation sensor unavailable on this device.',
          stopAtMs,
          samples: [],
        };
    const recording: Recording = { uri, mode, motion, lens: recordedLens };
    setLastRecording(recording);
    await upload(recording);
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    stopRecording();
  };

  if (!roomId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="MY HOME" title="Room capture" />
          <Text style={styles.bodyText}>This room could not be found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Choose range ───────────────────────────────────────────────────────────
  if (phase === 'choose') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenHeader eyebrow="MY HOME" title="Room capture" />
          <Text style={styles.eyebrow}>OPTIONAL</Text>
          <Text style={styles.title}>Capture your room</Text>
          <Text style={styles.subtitle}>
            Record a slow turn so you can swipe around the room and pick the best view for your products. Your room
            photos stay as they are.
          </Text>
          {MODES.map((m) => (
            <TouchableOpacity key={m.mode} style={styles.modeCard} onPress={() => openCamera(m.mode)} activeOpacity={0.85}>
              <Text style={styles.modeTitle}>{m.title}</Text>
              <Text style={styles.modeDescription}>{m.description}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>HOW TO RECORD</Text>
            <Text style={styles.tipText}>• Hold the phone upright at chest height.</Text>
            <Text style={styles.tipText}>
              • Turn in place at a calm, steady pace — the screen tells you if you&apos;re too fast or can go faster.
            </Text>
            <Text style={styles.tipText}>• Keep the phone above your feet; don&apos;t walk.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Processing / error ───────────────────────────────────────────────────────
  if (phase === 'processing' || phase === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="MY HOME" title="Room capture" />
          {phase === 'processing' ? (
            <View style={styles.statusCard}>
              <ActivityIndicator color={Colors.myHomeAccent} size="large" />
              <Text style={styles.statusTitle}>Building your room views…</Text>
              <Text style={styles.statusText}>
                Uploading the video and picking the sharpest frame for each direction. This can take a minute.
              </Text>
            </View>
          ) : (
            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>That capture didn&apos;t work</Text>
              <Text style={styles.statusText}>{error?.message}</Text>
              {error?.canRetryUpload && lastRecording && (
                <TouchableOpacity style={styles.primaryButton} onPress={() => upload(lastRecording)}>
                  <Text style={styles.primaryButtonText}>TRY UPLOAD AGAIN</Text>
                </TouchableOpacity>
              )}
              {permission?.granted === false && !permission.canAskAgain ? (
                <TouchableOpacity style={styles.primaryButton} onPress={() => Linking.openSettings()}>
                  <Text style={styles.primaryButtonText}>OPEN SETTINGS</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.primaryButton} onPress={() => openCamera(mode)}>
                  <Text style={styles.primaryButtonText}>RECORD AGAIN ({mode}°)</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setPhase('choose')}>
                <Text style={styles.secondaryButtonText}>CHANGE RANGE</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Camera / recording ─────────────────────────────────────────────────────
  const recording = phase === 'recording';
  const progress = Math.min(turned / target, 1);
  const suggestedSeconds = lensProfile.seconds[mode];
  // Enough for the backend to accept — the target is approximate, not exact.
  const enough = recording && !!motionAvailable && turned >= minCoverageDeg(mode, lens);
  // Pace guidance (gyro only): too fast → blur; too slow → the capture just takes longer.
  const tooFast = recording && !!motionAvailable && speed > lensProfile.goodMaxDegS;
  const notTurning = recording && !!motionAvailable && elapsed > 6 && turned < 10;
  const tooSlow =
    recording && !!motionAvailable && elapsed > TOO_SLOW_GRACE_S && turned >= 10 && speed < lensProfile.tooSlowDegS;
  const nearlyBack = recording && mode === '360' && turned >= BACK_TO_START_DEG;
  const instruction = !recording
    ? mode === '360'
      ? `Stand in the middle of the room. Tap record, then turn all the way around — about ${suggestedSeconds} seconds.`
      : `Face one side of the room. Tap record, then turn to the other side — about ${suggestedSeconds} seconds.`
    : !motionAvailable
      ? `Turn at a steady pace, then tap stop after ${mode}°`
      : tooFast
        ? 'Slow down a little'
        : notTurning
          ? 'Start turning slowly in place'
          : enough
            ? mode === '360'
              ? 'Enough captured — finish the circle or tap stop'
              : `Enough captured — keep going to ${mode}° or tap stop`
            : nearlyBack
              ? 'Almost back where you started…'
              : tooSlow
                ? 'You can go a bit faster'
                : 'Good pace — keep turning';

  // The preview box has the recording's shape (9:16), fitted into the free space,
  // so what the user sees is exactly what is recorded (no cropped edges).
  const boxWidth = stage ? Math.min(stage.width, stage.height * VIDEO_ASPECT) : 0;
  const boxHeight = boxWidth / VIDEO_ASPECT;

  return (
    <SafeAreaView style={styles.cameraContainer}>
      <View style={styles.cameraTop}>
        <View style={styles.cameraBadge}>
          <Text style={styles.cameraBadgeText}>
            {mode}° CAPTURE · {lensProfile.label}
          </Text>
        </View>
        {!recording && (
          <TouchableOpacity style={styles.cameraClose} onPress={() => setPhase('choose')}>
            <Text style={styles.cameraCloseText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <View
        style={styles.cameraStage}
        onLayout={(e) => setStage({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        {boxWidth > 0 && (
          <View style={[styles.cameraBox, { width: boxWidth, height: boxHeight }]}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              mode="video"
              mute
              videoQuality="720p"
              // Android: 16:9 preview matching the 16:9 recording (shown whole, not cropped).
              ratio="16:9"
              // iOS: the physical ultra-wide lens when found; undefined = the default 1× lens.
              selectedLens={lens === 'ultra-wide' ? (ultraWideName ?? undefined) : undefined}
              onAvailableLensesChanged={(e) => detectLenses(e.lenses)}
              onCameraReady={handleCameraReady}
              onMountError={(e) => {
                setError({ message: e.message || "The camera couldn't start.", canRetryUpload: false });
                setPhase('error');
              }}
            />
          </View>
        )}
      </View>

      <View style={styles.cameraBottom}>
        {!recording && ultraWideName && (
          <View style={styles.lensRow}>
            {([true, false] as const).map((ultra) => {
              const active = preferUltraWide === ultra;
              return (
                <TouchableOpacity
                  key={String(ultra)}
                  style={[styles.lensChip, active && styles.lensChipActive]}
                  onPress={() => chooseLens(ultra)}
                  accessibilityLabel={ultra ? 'Ultra-wide lens' : 'Normal lens'}
                >
                  <Text style={[styles.lensChipText, active && styles.lensChipTextActive]}>
                    {ultra ? CAPTURE_LENSES['ultra-wide'].label : CAPTURE_LENSES.wide.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={[styles.instruction, tooFast && styles.instructionWarn]}>{instruction}</Text>

        {recording && motionAvailable && (
          <View style={styles.progressBlock}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  enough && styles.progressFillEnough,
                  { width: `${Math.round(progress * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {Math.round(turned)}° of {mode}° · {Math.round(elapsed)}s
            </Text>
          </View>
        )}
        {recording && !motionAvailable && <Text style={styles.progressText}>{Math.round(elapsed)}s</Text>}
        {!recording && motionAvailable === false && (
          <Text style={styles.sensorNote}>
            This phone&apos;s rotation sensor isn&apos;t available — view angles will be estimated from time, so turn at
            a steady speed.
          </Text>
        )}
        {!recording && notice && <Text style={styles.sensorNote}>{notice}</Text>}

        <View style={styles.cameraButtons}>
          {recording ? (
            <>
              <TouchableOpacity style={styles.cancelButton} onPress={cancelRecording}>
                <Text style={styles.cancelButtonText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stopButton} onPress={stopRecording} accessibilityLabel="Stop recording">
                <View style={styles.stopSquare} />
              </TouchableOpacity>
              <View style={styles.cancelButtonSpacer} />
            </>
          ) : (
            <TouchableOpacity
              style={[styles.recordButton, (!cameraReady || lensSettling) && styles.buttonDisabled]}
              onPress={startRecording}
              disabled={!cameraReady || lensSettling}
              accessibilityLabel="Start recording"
            >
              <View style={styles.recordDot} />
            </TouchableOpacity>
          )}
        </View>
      </View>
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
  bodyText: {
    color: Colors.lightTextSecondary,
    fontSize: 14,
  },
  eyebrow: {
    color: Colors.lightMyHomeAccentText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  title: {
    color: Colors.lightTextPrimary,
    fontSize: 28,
    fontWeight: '700',
    marginTop: 6,
  },
  subtitle: {
    color: Colors.lightTextSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 18,
  },
  modeCard: {
    backgroundColor: Colors.myHomeSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
    padding: 18,
    marginBottom: 12,
    gap: 6,
  },
  modeTitle: {
    color: Colors.myHomeAccentText,
    fontSize: 16,
    fontWeight: '700',
  },
  modeDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  tipCard: {
    backgroundColor: Colors.lightSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.lightBorder,
    padding: 16,
    gap: 6,
    marginTop: 6,
  },
  tipTitle: {
    color: Colors.lightTextSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  tipText: {
    color: Colors.lightTextBody,
    fontSize: 13,
    lineHeight: 19,
  },
  statusCard: {
    backgroundColor: Colors.myHomeSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
    padding: 22,
    gap: 12,
    alignItems: 'stretch',
  },
  statusTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: Colors.myHomeAccent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: Colors.cardHighlightText,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  secondaryButton: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
  },
  secondaryButtonText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBox: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  lensRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 8,
    backgroundColor: 'rgba(11,18,32,0.65)',
    borderRadius: 999,
    padding: 4,
  },
  lensChip: {
    minWidth: 52,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: 'center',
  },
  lensChipActive: {
    backgroundColor: Colors.myHomeAccent,
  },
  lensChipText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  lensChipTextActive: {
    color: Colors.cardHighlightText,
  },
  cameraTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cameraBadge: {
    backgroundColor: 'rgba(11,18,32,0.65)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cameraBadgeText: {
    color: Colors.myHomeAccentText,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  cameraClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(11,18,32,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraCloseText: {
    color: Colors.textPrimary,
    fontSize: 16,
  },
  cameraBottom: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  instruction: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 21,
  },
  instructionWarn: {
    color: Colors.warningText,
  },
  progressBlock: {
    gap: 6,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.myHomeAccent,
  },
  progressFillEnough: {
    backgroundColor: Colors.success,
  },
  progressText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  sensorNote: {
    color: Colors.warningText,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  cameraButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    marginTop: 4,
  },
  recordButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: Colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordDot: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.danger,
  },
  stopButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: Colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: Colors.danger,
  },
  cancelButton: {
    width: 80,
    alignItems: 'center',
  },
  cancelButtonSpacer: {
    width: 80,
  },
  cancelButtonText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
