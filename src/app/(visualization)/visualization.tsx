import React from 'react';

import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
// Gesture-handler's ScrollView, so dragging a product cancels page scrolling.
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import ModelViewerModal from '@/components/model3d/ModelViewerModal';
import ProductPipelineStatus from '@/components/model3d/ProductPipelineStatus';
import TurnControl from '@/components/model3d/TurnControl';
import TurntableRenderer from '@/components/model3d/TurntableRenderer';
import RoomComposer from '@/components/RoomComposer';
import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { saveImageToGallery } from '@/services/gallery';
import { saveGeneratedImageLayout } from '@/services/generatedImages';
import { getRoomById } from '@/services/rooms';
import {
  buildLayout,
  clearSession,
  getSession,
  type ProductTransform,
  regenerateSession,
  removeProduct,
  selectProduct,
  setModelFrames,
  setModelRenderFailed,
  startSession,
  updateProductTransform,
  useVisualizationSession,
} from '@/services/visualizationSession';

/** Tallest the room canvas may get; wider-than-tall rooms fill the width. */
const MAX_CANVAS_HEIGHT = 480;

// Local layout edits — none of these call the generation API.
const handleTransformEnd = (productId: string, geometry: Pick<ProductTransform, 'x' | 'y' | 'width' | 'rotation'>) =>
  updateProductTransform(productId, { ...geometry, placed: true });
const handleProductAspect = (productId: string, aspect: number) => updateProductTransform(productId, { aspect });

export default function Visualization() {
  const router = useRouter();
  const session = useVisualizationSession();

  // Legacy entry (Visualization detail → "Generate again") arrives with
  // route params instead of a session — rebuild a session from them.
  const params = useLocalSearchParams<{
    roomId?: string;
    productImageUri?: string;
    productName?: string;
    productCheckId?: string;
  }>();

  const [status, setStatus] = React.useState<'idle' | 'generating' | 'failed'>('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [savingToGallery, setSavingToGallery] = React.useState(false);
  const [hydrateFailed, setHydrateFailed] = React.useState(false);
  // 'arrange' = original room + movable product layers; 'ai' = latest generated image.
  const [view, setView] = React.useState<'arrange' | 'ai'>(() => (getSession()?.generation ? 'ai' : 'arrange'));
  const [roomAspect, setRoomAspect] = React.useState(4 / 3);
  const [availableWidth, setAvailableWidth] = React.useState(0);
  const hydrating = !session && !hydrateFailed && !!params.roomId && !!params.productImageUri;

  const [viewerOpen, setViewerOpen] = React.useState(false);
  const selectedId = session?.selectedProductId ?? null;
  // Stable per selected product, so the turn gesture isn't rebuilt mid-drag.
  const turnSelected = React.useCallback(
    (yawDeg: number) => {
      if (selectedId) updateProductTransform(selectedId, { yawDeg });
    },
    [selectedId]
  );

  React.useEffect(() => {
    if (session || !params.roomId || !params.productImageUri) return;
    let cancelled = false;
    getRoomById(params.roomId)
      .then((room) => {
        if (cancelled) return;
        if (!room) {
          setHydrateFailed(true);
          return;
        }
        startSession(
          { id: room.id, name: room.name, roomType: room.roomType, imageUri: room.primaryImageUri ?? null },
          {
            imageUri: params.productImageUri!,
            name: params.productName || 'Product',
            productCheckId: params.productCheckId ?? null,
          }
        );
      })
      .catch(() => !cancelled && setHydrateFailed(true));
    return () => {
      cancelled = true;
    };
  }, [session, params.roomId, params.productImageUri, params.productName, params.productCheckId]);

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenHeader eyebrow="MY HOME" title="Visualization" />
          <View style={styles.errorCard}>
            <Text style={styles.pendingEyebrow}>{hydrating ? 'LOADING' : 'SESSION MISSING'}</Text>
            <Text style={styles.resultTitle}>
              {hydrating ? 'Opening your room…' : 'This visualization is no longer available'}
            </Text>
            {!hydrating && (
              <Text style={styles.resultDescription}>
                The session was closed or expired. Start again from a product to place it in your room.
              </Text>
            )}
          </View>
          {!hydrating && (
            <TouchableOpacity
              style={styles.generateButton}
              onPress={() => router.replace('/check-product')}
              activeOpacity={0.85}
            >
              <Text style={styles.generateButtonText}>CHECK A PRODUCT</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const { room, products, generation, selectedProductId } = session;
  const roomLabel = room.name || room.roomType;
  const showingAi = view === 'ai' && !!generation;
  const canGenerate = products.length > 0 && status !== 'generating';

  // The canvas keeps the room photo's aspect ratio so normalized product
  // positions map onto the photo exactly, at any screen size.
  const aspect = Math.min(2, Math.max(0.5, roomAspect));
  const canvasWidth = Math.min(availableWidth, MAX_CANVAS_HEIGHT * aspect);
  const canvasHeight = canvasWidth / aspect;

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;
  const selected3D = selectedProduct?.model3D.status === 'ready' ? selectedProduct.model3D : null;
  // One product at a time gets its 3D views rendered on the device.
  const renderJob = products.find((p) => p.model3D.status === 'rendering') ?? null;

  const selectFromList = (productId: string) => {
    selectProduct(productId);
    setView('arrange');
  };

  const goToAddProduct = () => {
    // Does NOT generate anything — opens the existing camera/gallery screen
    // in "add to session" mode, which returns here when done.
    router.push({ pathname: '/check-product', params: { addToSession: '1' } });
  };

  // The only place a real generation is triggered (GENERATE / REGENERATE).
  const handleGenerate = async () => {
    setStatus('generating');
    setErrorMessage(null);
    const result = await regenerateSession();
    if (result.ok) {
      setStatus('idle');
      setView('ai');
    } else {
      setStatus('failed');
      setErrorMessage(result.message);
    }
  };

  const handleSave = async () => {
    if (savingToGallery) return;
    if (!generation) {
      Alert.alert('Nothing to save yet', 'Generate the visualization first.');
      return;
    }
    setSavingToGallery(true);
    // The generated image is already stored in the room's visualizations; SAVE
    // attaches the current product layout to it and puts the photo in the gallery.
    const [galleryResult, layoutResult] = await Promise.allSettled([
      saveImageToGallery(generation.imageUri),
      saveGeneratedImageLayout(generation.id, buildLayout(session)),
    ]);
    setSavingToGallery(false);

    const gallery = galleryResult.status === 'fulfilled' ? galleryResult.value : null;
    const galleryFailed = !gallery || gallery.status === 'permission-denied' || gallery.status === 'failed';
    const layoutNote =
      layoutResult.status === 'rejected'
        ? `\n\nThe product layout couldn't be saved: ${layoutResult.reason?.message ?? 'please try again.'}`
        : '';
    Alert.alert(
      galleryFailed ? "Couldn't save photo" : 'Saved',
      (gallery?.message ?? "Couldn't save the photo.") + layoutNote
    );
  };

  const handleStartOver = () => {
    Alert.alert(
      'Start over?',
      'This clears the products in this visualization. Your saved rooms, products, history and saved visualizations are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start over',
          style: 'destructive',
          onPress: () => {
            clearSession();
            router.replace('/check-product');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <ScreenHeader eyebrow="MY HOME" title={room.roomType} />

        <View style={styles.intro}>
          <Text style={styles.title}>Your room</Text>
          <Text style={styles.subtitle}>
            {products.length === 0
              ? `No products yet in your ${roomLabel.toLowerCase()}.`
              : `${products.length} product${products.length === 1 ? '' : 's'} in your ${roomLabel.toLowerCase()}. Add more, then ${generation ? 'regenerate' : 'generate'} to see them all together.`}
          </Text>
        </View>

        {/* Visualization */}
        {generation && (
          <View style={styles.viewToggle}>
            {(['arrange', 'ai'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.viewToggleOption, view === mode && styles.viewToggleOptionActive]}
                onPress={() => setView(mode)}
                activeOpacity={0.8}
              >
                <Text style={[styles.viewToggleText, view === mode && styles.viewToggleTextActive]}>
                  {mode === 'arrange' ? 'ARRANGE' : 'AI RENDER'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View onLayout={(e) => setAvailableWidth(e.nativeEvent.layout.width)}>
          {canvasWidth > 0 &&
            (showingAi ? (
              <View style={[styles.canvasFrame, { width: canvasWidth, height: canvasHeight }]}>
                <Image source={{ uri: generation!.imageUri }} style={styles.roomImage} />
                {status !== 'generating' && (
                  <View style={styles.generatedBadge}>
                    <Text style={styles.generatedBadgeText}>AI VISUALIZATION</Text>
                  </View>
                )}
              </View>
            ) : (
              <RoomComposer
                width={canvasWidth}
                height={canvasHeight}
                roomImageUri={room.imageUri}
                products={products}
                selectedProductId={selectedProductId}
                onSelect={selectProduct}
                onTransformEnd={handleTransformEnd}
                onProductAspect={handleProductAspect}
                onRoomAspect={setRoomAspect}
              />
            ))}

          {status === 'generating' && (
            <View
              style={[
                styles.overlay,
                { left: (availableWidth - canvasWidth) / 2, width: canvasWidth, height: canvasHeight },
              ]}
            >
              <ActivityIndicator size="large" color={Colors.accent} />
              <Text style={styles.overlayTitle}>Generating...</Text>
            </View>
          )}
        </View>

        {products.length > 0 && (
          <Text style={styles.canvasHint}>
            {showingAi
              ? 'AI render of your room. Switch to Arrange to move products, then regenerate.'
              : selected3D
                ? 'Drag to move · pinch to resize · twist to tilt · turn it in 3D below'
                : 'Drag a product to move it · pinch to resize · twist to rotate'}
          </Text>
        )}

        {!showingAi && selectedProduct && selected3D && (
          <TurnControl
            yawDeg={selectedProduct.transform.yawDeg}
            frameCount={selected3D.frames.length}
            onChange={turnSelected}
            onOpenViewer={() => setViewerOpen(true)}
          />
        )}

        <ProductPipelineStatus
          products={products}
          onRetake={(productId) => {
            removeProduct(productId);
            goToAddProduct();
          }}
        />

        {/* Products */}
        <Text style={styles.sectionLabel}>PRODUCTS IN THIS ROOM</Text>
        {products.length === 0 && (
          <Text style={styles.productDescription}>Add a product to place it in this room.</Text>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productStrip}>
          {products.map((product, index) => {
            const selected = product.id === selectedProductId;
            return (
              <View key={product.id} style={styles.productChip}>
                <TouchableOpacity
                  onPress={() => selectFromList(product.id)}
                  activeOpacity={0.8}
                  accessibilityLabel={`Select ${product.name}`}
                >
                  <Image
                    source={{ uri: product.cutout.status === 'ready' ? product.cutout.imageUri : product.imageUri }}
                    resizeMode={product.cutout.status === 'ready' ? 'contain' : 'cover'}
                    style={[styles.productThumbnail, selected && styles.productThumbnailSelected]}
                  />
                  <Text style={[styles.productChipName, selected && styles.productChipNameSelected]} numberOfLines={1}>
                    {product.name || `Product ${index + 1}`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeBadge}
                  onPress={() => removeProduct(product.id)}
                  hitSlop={8}
                  activeOpacity={0.7}
                  accessibilityLabel={`Remove ${product.name} from this visualization`}
                >
                  <Text style={styles.removeBadgeText}>×</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <TouchableOpacity
            style={styles.addChip}
            onPress={goToAddProduct}
            activeOpacity={0.8}
            accessibilityLabel="Add another product"
          >
            <Text style={styles.addChipPlus}>+</Text>
            <Text style={styles.addChipText}>ADD</Text>
          </TouchableOpacity>
        </ScrollView>

        {status === 'failed' && (
          <View style={styles.errorCard}>
            <Text style={styles.pendingEyebrow}>GENERATION FAILED</Text>
            <Text style={styles.resultDescription}>
              {errorMessage || "Couldn't generate the visualization. Please try again."}
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.addButton} onPress={goToAddProduct} activeOpacity={0.85}>
          <Text style={styles.addButtonText}>+ GENERATE ANOTHER PRODUCT</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.generateButton, !canGenerate && styles.buttonDisabled]}
          onPress={handleGenerate}
          activeOpacity={0.85}
          disabled={!canGenerate}
        >
          <Text style={styles.generateButtonText}>
            {generation ? 'REGENERATE' : 'GENERATE INTO MY ROOM'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, savingToGallery && styles.buttonDisabled]}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={savingToGallery}
        >
          <Text style={styles.saveButtonText}>SAVE</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backToHomeLink} onPress={handleStartOver} activeOpacity={0.7}>
          <Text style={styles.backToHomeLinkText}>START OVER</Text>
        </TouchableOpacity>
      </ScrollView>

      {renderJob && renderJob.model3D.status === 'rendering' && (
        <TurntableRenderer
          key={`${renderJob.id}:${renderJob.model3D.modelUrl}`}
          productId={renderJob.id}
          modelUrl={renderJob.model3D.modelUrl}
          onDone={setModelFrames}
          onError={setModelRenderFailed}
        />
      )}

      {viewerOpen && selectedProduct && selected3D && (
        <ModelViewerModal
          visible
          productName={selectedProduct.name}
          modelUrl={selected3D.modelUrl}
          yawDeg={selectedProduct.transform.yawDeg}
          onUseAngle={(yawDeg) => {
            updateProductTransform(selectedProduct.id, { yawDeg });
            setViewerOpen(false);
          }}
          onClose={() => setViewerOpen(false)}
        />
      )}
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
    paddingBottom: 40,
  },
  intro: {
    marginTop: 30,
    marginBottom: 24,
  },
  title: {
    color: Colors.lightTextPrimary,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
  },
  subtitle: {
    color: Colors.lightTextSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  viewToggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  viewToggleOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9,
  },
  viewToggleOptionActive: {
    backgroundColor: Colors.accent,
  },
  viewToggleText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  viewToggleTextActive: {
    color: Colors.cardHighlight,
  },
  canvasFrame: {
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  roomImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  canvasHint: {
    color: Colors.lightTextSecondary,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 10,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 18, 32, 0.65)',
  },
  overlayTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    marginTop: 14,
  },
  generatedBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: Colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  generatedBadgeText: {
    color: Colors.cardHighlight,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  productStrip: {
    paddingTop: 12,
    paddingRight: 8,
    gap: 12,
  },
  productChip: {
    width: 72,
  },
  productThumbnail: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
  },
  productThumbnailSelected: {
    borderColor: Colors.accent,
  },
  productChipName: {
    color: Colors.lightTextSecondary,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  productChipNameSelected: {
    color: Colors.accentText,
  },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.dangerDim,
    borderWidth: 1,
    borderColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadgeText: {
    color: Colors.dangerText,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  addChip: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChipPlus: {
    color: Colors.accentText,
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 24,
  },
  addChipText: {
    color: Colors.accentText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  productDescription: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  generateButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  generateButtonText: {
    color: Colors.cardHighlight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  errorCard: {
    marginTop: 18,
    backgroundColor: Colors.dangerDim,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.danger,
    padding: 20,
  },
  pendingEyebrow: {
    color: Colors.warningText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  resultTitle: {
    color: Colors.textPrimary,
    fontSize: 21,
    fontWeight: '700',
    marginTop: 9,
  },
  resultDescription: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },
  saveButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.cardHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    color: Colors.cardHighlightText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sectionLabel: {
    color: Colors.lightTextSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 22,
    marginBottom: 2,
  },
  addButton: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  addButtonText: {
    color: Colors.accentText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  backToHomeLink: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingVertical: 6,
  },
  backToHomeLinkText: {
    color: Colors.lightTextSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
