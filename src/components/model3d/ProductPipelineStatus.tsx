/**
 * "Preparing your furniture…" — the product pipeline's progress, shown as one
 * operation. Every step's state comes from the session (real backend/device
 * state): a step is only marked done when it actually finished, and a
 * percentage is only shown if the 3D provider itself reports one.
 */

import React from 'react';

import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '@/constants/colors';
import type { ProductModelStage } from '@/services/productModels';
import {
  confirmModel3D,
  declineModel3D,
  retryCutout,
  retryModel3D,
  type SessionProduct,
} from '@/services/visualizationSession';

type StepState = 'done' | 'active' | 'pending' | 'skipped';
type Step = { label: string; state: StepState; detail?: string };

const STAGE_LABELS: Record<ProductModelStage, string> = {
  starting: 'Waiting to start',
  queued: 'Waiting for a free GPU',
  running: 'Generating the shape',
  finishing: 'Building the 3D file',
  downloading: 'Downloading the model',
};

function isPreparing(p: SessionProduct): boolean {
  if (p.cutout.status === 'pending') return true;
  if (p.cutout.status !== 'ready') return false;
  return p.model3D.status === 'waiting' || p.model3D.status === 'generating' || p.model3D.status === 'rendering';
}

function stepsFor(p: SessionProduct): Step[] {
  const { cutout, model3D } = p;
  const steps: Step[] = [
    { label: 'Removing background', state: cutout.status === 'ready' ? 'done' : cutout.status === 'pending' ? 'active' : 'skipped' },
  ];
  // Only when the product really was analyzed (Groq) before joining the room.
  if (p.productCheckId) steps.push({ label: 'Understanding furniture', state: 'done' });

  let model: Step = { label: 'Creating 3D model', state: 'pending' };
  if (model3D.status === 'generating') {
    const detail =
      model3D.progress !== null && model3D.stage === 'running'
        ? `${model3D.progress}%`
        : STAGE_LABELS[model3D.stage];
    model = { ...model, state: 'active', detail };
  } else if (model3D.status === 'rendering' || model3D.status === 'ready') {
    model = { ...model, state: 'done' };
  }
  steps.push(model);
  steps.push({
    label: 'Preparing your room',
    state: model3D.status === 'ready' ? 'done' : model3D.status === 'rendering' ? 'active' : 'pending',
  });
  return steps;
}

type Props = {
  products: SessionProduct[];
  /** Replace a product's photo: remove it from the room and open the camera. */
  onRetake: (productId: string) => void;
};

export default function ProductPipelineStatus({ products, onRetake }: Props) {
  const preparing = products.find(isPreparing) ?? null;
  const inReview = products.find((p) => p.model3D.status === 'review') ?? null;
  const bgFailed = products.filter((p) => p.cutout.status === 'failed');
  const failed3D = products.filter((p) => p.model3D.status === 'failed');
  const unavailable = products.some((p) => p.model3D.status === 'unavailable');
  // Any product that failed because the free daily 3D limit is used up.
  const limitReached = failed3D.some((p) => p.model3D.status === 'failed' && p.model3D.reason === 'quota');

  // Short "Product ready" once the pipeline finishes.
  const [showReady, setShowReady] = React.useState(false);
  const wasPreparing = React.useRef(!!preparing);
  React.useEffect(() => {
    const finished = wasPreparing.current && !preparing;
    wasPreparing.current = !!preparing;
    if (!finished) return;
    setShowReady(true);
    const timer = setTimeout(() => setShowReady(false), 2500);
    return () => clearTimeout(timer);
  }, [preparing]);

  return (
    <>
      {preparing && (
        <View style={styles.card}>
          <Text style={styles.title}>Preparing your furniture…</Text>
          {products.length > 1 && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {preparing.name}
            </Text>
          )}
          <View style={styles.steps}>
            {stepsFor(preparing)
              .filter((step) => step.state !== 'skipped')
              .map((step) => (
                <View key={step.label} style={styles.step}>
                  <View style={styles.stepIcon}>
                    {step.state === 'active' ? (
                      <ActivityIndicator size="small" color={Colors.accent} />
                    ) : (
                      <Text style={step.state === 'done' ? styles.done : styles.pending}>
                        {step.state === 'done' ? '✓' : '○'}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.stepLabel, step.state === 'pending' && styles.stepLabelPending]}>{step.label}</Text>
                  {step.detail && <Text style={styles.stepDetail}>{step.detail}</Text>}
                </View>
              ))}
          </View>
        </View>
      )}

      {!preparing && showReady && (
        <View style={[styles.card, styles.row]}>
          <Text style={styles.done}>✓</Text>
          <Text style={styles.title}>Product ready</Text>
        </View>
      )}

      {inReview && inReview.model3D.status === 'review' && (
        <View style={styles.warningCard}>
          <Text style={styles.warningEyebrow}>CHECK YOUR PHOTO</Text>
          <Text style={styles.warningText}>
            This photo{products.length > 1 ? ` of "${inReview.name}"` : ''} may produce an inaccurate 3D model:
          </Text>
          {inReview.model3D.warnings.map((warning) => (
            <Text key={warning.code} style={styles.warningDetail}>
              • {warning.message}
            </Text>
          ))}
          <Text style={styles.warningText}>
            For the best result: the whole product in view, good light, a plain background. It stays in your room in
            2D either way.
          </Text>
          <View style={styles.reviewActions}>
            <TouchableOpacity style={styles.retry} onPress={() => onRetake(inReview.id)} activeOpacity={0.85}>
              <Text style={styles.retryText}>RETAKE PHOTO</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.outline} onPress={() => confirmModel3D(inReview.id)} activeOpacity={0.85}>
              <Text style={styles.outlineText}>CREATE 3D ANYWAY</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.outline} onPress={() => declineModel3D(inReview.id)} activeOpacity={0.85}>
              <Text style={styles.outlineText}>KEEP 2D</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {bgFailed.length > 0 && (
        <View style={styles.warningCard}>
          <Text style={styles.warningEyebrow}>BACKGROUND NOT REMOVED</Text>
          <Text style={styles.warningText}>
            {bgFailed[0].cutout.status === 'failed' ? bgFailed[0].cutout.message : ''}
          </Text>
          <Text style={styles.warningText}>
            {bgFailed.length === 1 ? `"${bgFailed[0].name}" is` : `${bgFailed.length} products are`} shown with the
            original photo until it works.
          </Text>
          <TouchableOpacity style={styles.retry} onPress={() => bgFailed.forEach((p) => retryCutout(p.id))} activeOpacity={0.85}>
            <Text style={styles.retryText}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      )}

      {failed3D.length > 0 && limitReached && (
        <View style={styles.warningCard}>
          <Text style={styles.warningEyebrow}>DAILY 3D LIMIT REACHED</Text>
          <Text style={styles.warningText}>
            Daily free 3D limit reached — try again tomorrow.{' '}
            {failed3D.length > 1 ? `${failed3D.length} products stay` : `"${failed3D[0].name}" stays`} in your room in 2D
            until then.
          </Text>
          <TouchableOpacity style={styles.retry} onPress={() => failed3D.forEach((p) => retryModel3D(p.id))} activeOpacity={0.85}>
            <Text style={styles.retryText}>TRY 3D AGAIN</Text>
          </TouchableOpacity>
        </View>
      )}

      {failed3D.length > 0 && !limitReached && (
        <View style={styles.warningCard}>
          <Text style={styles.warningEyebrow}>3D PREVIEW NOT CREATED</Text>
          <Text style={styles.warningText}>
            3D preview couldn&apos;t be created{failed3D.length > 1 ? ` for ${failed3D.length} products` : ` for "${failed3D[0].name}"`}. You
            can continue with the 2D version.
          </Text>
          {failed3D[0].model3D.status === 'failed' && (
            <Text style={styles.warningDetail}>{failed3D[0].model3D.message}</Text>
          )}
          <TouchableOpacity style={styles.retry} onPress={() => failed3D.forEach((p) => retryModel3D(p.id))} activeOpacity={0.85}>
            <Text style={styles.retryText}>TRY 3D AGAIN</Text>
          </TouchableOpacity>
        </View>
      )}

      {unavailable && !preparing && (
        <Text style={styles.note}>3D isn&apos;t available right now — products are shown in 2D.</Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  steps: {
    marginTop: 10,
    gap: 8,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepIcon: {
    width: 24,
    alignItems: 'center',
  },
  stepLabel: {
    color: Colors.textPrimary,
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  },
  stepLabelPending: {
    color: Colors.textMuted,
  },
  stepDetail: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  done: {
    color: Colors.successText,
    fontSize: 14,
    fontWeight: '700',
  },
  pending: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  warningCard: {
    marginTop: 14,
    backgroundColor: Colors.warningDim,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: 16,
  },
  warningEyebrow: {
    color: Colors.warningText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  warningText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },
  warningDetail: {
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.warning,
  },
  reviewActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  outline: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  outlineText: {
    color: Colors.warningText,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  retryText: {
    color: Colors.textInverse,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  note: {
    color: Colors.lightTextSecondary,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
  },
});
