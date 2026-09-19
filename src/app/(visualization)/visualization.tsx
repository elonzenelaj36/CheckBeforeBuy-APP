import React from 'react';

import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { saveImageToGallery } from '@/services/gallery';
import {
  GeneratedImageStatus,
  requestRoomVisualization,
} from '@/services/generatedImages';

export default function Visualization() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    roomType?: string;
    roomId?: string;
    imageUri?: string;
    productImageUri?: string;
    productName?: string;
    productCheckId?: string;
  }>();

  const roomType = params.roomType || 'Room';
  const roomImageUri = params.imageUri;
  const productImageUri = params.productImageUri || params.imageUri;
  const productName = params.productName || 'Captured Product';

  const [status, setStatus] = React.useState<'idle' | 'generating' | GeneratedImageStatus>('idle');
  const [generatedImageUri, setGeneratedImageUri] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [savingToGallery, setSavingToGallery] = React.useState(false);

  const generateVisualization = async () => {
    // A visualization must always attach to a real, user-created room — it
    // must never fall back to auto-creating one from a roomType category.
    if (!params.roomId) {
      setStatus('failed');
      setStatusMessage('No room was selected. Please go back and choose one of your saved rooms.');
      return;
    }

    setStatus('generating');
    setStatusMessage(null);

    try {
      const roomId = params.roomId;
      const isLocalProductImage = productImageUri?.startsWith('file://');

      const result = await requestRoomVisualization({
        roomId,
        productName,
        productCheckId: params.productCheckId,
        productImageUri:
          !params.productCheckId && isLocalProductImage ? productImageUri : undefined,
      });

      setStatus(result.status);
      setGeneratedImageUri(result.generatedImageUri);
      setStatusMessage(result.message ?? null);
    } catch (error: any) {
      setStatus('failed');
      setStatusMessage(
        error?.message ?? "We couldn&apos;t generate this visualization. Please try again."
      );
    }
  };

  const goToHome = () => {
    router.replace('/my-home');
  };

  const handleSaveToGallery = async () => {
    if (savingToGallery) return;
    setSavingToGallery(true);
    const result = await saveImageToGallery(generatedImageUri);
    setSavingToGallery(false);

    const isError = result.status === 'permission-denied' || result.status === 'failed';
    Alert.alert(isError ? "Couldn't save photo" : 'Gallery', result.message);
  };

  const isDone = status === 'pending' || status === 'completed' || status === 'failed';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow="MY HOME" title={roomType} />

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.title}>
            {isDone ? 'Here is what we found.' : 'Your room is ready.'}
          </Text>

          <Text style={styles.subtitle}>
            {isDone
              ? 'This request has been saved to your room history.'
              : `We'll place "${productName}" inside your ${roomType.toLowerCase()}.`}
          </Text>
        </View>

        {/* Visualization */}
        <View style={styles.visualizationContainer}>
          {status === 'completed' && generatedImageUri ? (
            <Image source={{ uri: generatedImageUri }} style={styles.roomImage} />
          ) : roomImageUri ? (
            <Image source={{ uri: roomImageUri }} style={styles.roomImage} />
          ) : (
            <View style={styles.fakeRoom}>
              <View style={styles.floor} />
              <View style={styles.fakeFurniture}>
                <View style={styles.furnitureTop} />
                <View style={styles.furnitureBody} />
              </View>
              <View style={styles.fakeLamp}>
                <View style={styles.lampShade} />
                <View style={styles.lampStand} />
              </View>
            </View>
          )}

          {status === 'idle' && (
            <View style={styles.overlay}>
              <View style={styles.overlayCircle}>
                <Text style={styles.overlaySymbol}>+</Text>
              </View>

              <Text style={styles.overlayTitle}>Ready to generate</Text>

              <Text style={styles.overlayDescription}>
                Your product will be placed into this room.
              </Text>
            </View>
          )}

          {status === 'generating' && (
            <View style={styles.overlay}>
              <ActivityIndicator size="large" color={Colors.accent} />
              <Text style={styles.overlayTitle}>Generating...</Text>
            </View>
          )}

          {status === 'completed' && (
            <View style={styles.generatedBadge}>
              <Text style={styles.generatedBadgeText}>AI VISUALIZATION</Text>
            </View>
          )}
        </View>

        {/* Product thumbnail card */}
        {productImageUri && (
          <View style={styles.productCard}>
            <Image
              source={{ uri: productImageUri }}
              style={styles.productThumbnail}
            />

            <View style={styles.productText}>
              <Text style={styles.productLabel}>PRODUCT</Text>
              <Text style={styles.productTitle}>{productName}</Text>
              <Text style={styles.productDescription}>
                Previewing product in {roomType}
              </Text>
            </View>
          </View>
        )}

        {/* Generate Action */}
        {status === 'idle' && (
          <TouchableOpacity
            style={styles.generateButton}
            onPress={generateVisualization}
            activeOpacity={0.85}
          >
            <Text style={styles.generateButtonText}>GENERATE INTO MY ROOM</Text>
          </TouchableOpacity>
        )}

        {/* Pending — no image AI provider configured on the backend yet */}
        {status === 'pending' && (
          <>
            <View style={styles.pendingCard}>
              <Text style={styles.pendingEyebrow}>VISUALIZATION PENDING</Text>
              <Text style={styles.resultTitle}>Room visualization AI isn&apos;t configured yet</Text>
              <Text style={styles.resultDescription}>
                {statusMessage ||
                  'The request was saved, but no image-generation provider is set up on the server yet.'}
              </Text>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={goToHome} activeOpacity={0.85}>
              <Text style={styles.saveButtonText}>BACK TO MY HOME</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Completed */}
        {status === 'completed' && (
          <>
            <View style={styles.resultCard}>
              <Text style={styles.resultEyebrow}>RESULT SAVED</Text>
              <Text style={styles.resultTitle}>Photo saved to Visualizations</Text>
              <Text style={styles.resultDescription}>
                This visualization is now saved under Saved → Visualizations, and under My Home → {roomType}.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.generateButton, savingToGallery && styles.buttonDisabled]}
              onPress={handleSaveToGallery}
              activeOpacity={0.85}
              disabled={savingToGallery}
            >
              {savingToGallery ? (
                <ActivityIndicator color={Colors.cardHighlight} />
              ) : (
                <Text style={styles.generateButtonText}>SAVE TO GALLERY</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveButton} onPress={generateVisualization} activeOpacity={0.85}>
              <Text style={styles.saveButtonText}>GENERATE AGAIN</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backToHomeLink} onPress={goToHome} activeOpacity={0.7}>
              <Text style={styles.backToHomeLinkText}>BACK TO MY HOME</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Failed */}
        {status === 'failed' && (
          <>
            <View style={styles.errorCard}>
              <Text style={styles.pendingEyebrow}>GENERATION FAILED</Text>
              <Text style={styles.resultTitle}>We couldn&apos;t generate this visualization</Text>
              <Text style={styles.resultDescription}>
                {statusMessage || 'Please try again.'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.generateButton}
              onPress={generateVisualization}
              activeOpacity={0.85}
            >
              <Text style={styles.generateButtonText}>TRY AGAIN</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Disclaimer */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How room visualization works</Text>
          <Text style={styles.infoText}>
            The product photo and your room photo are sent to the backend, which requests an
            AI-generated image showing the product placed in your room. Until an
            image-generation provider is configured on the server, requests are saved but stay
            &quot;pending&quot; instead of showing a fake result.
          </Text>
        </View>
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
  visualizationContainer: {
    width: '100%',
    height: 320,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
  },
  roomImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  fakeRoom: {
    flex: 1,
    backgroundColor: Colors.surface2,
    position: 'relative',
  },
  floor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
    backgroundColor: Colors.surface,
  },
  fakeFurniture: {
    position: 'absolute',
    left: 45,
    bottom: 65,
    width: 180,
    height: 100,
  },
  furnitureTop: {
    height: 25,
    backgroundColor: Colors.border,
    borderRadius: 8,
  },
  furnitureBody: {
    height: 65,
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  fakeLamp: {
    position: 'absolute',
    right: 45,
    bottom: 65,
    alignItems: 'center',
  },
  lampShade: {
    width: 55,
    height: 35,
    backgroundColor: Colors.accentDim,
    borderRadius: 8,
  },
  lampStand: {
    width: 5,
    height: 75,
    backgroundColor: Colors.border,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 18, 32, 0.65)',
  },
  overlayCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlaySymbol: {
    color: Colors.cardHighlight,
    fontSize: 30,
    fontWeight: '300',
  },
  overlayTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    marginTop: 14,
  },
  overlayDescription: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 6,
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
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginTop: 14,
  },
  productThumbnail: {
    width: 62,
    height: 62,
    borderRadius: 10,
  },
  productText: {
    flex: 1,
    marginLeft: 12,
  },
  productLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  productTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
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
  resultCard: {
    marginTop: 18,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
  },
  pendingCard: {
    marginTop: 18,
    backgroundColor: Colors.warningDim,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: 20,
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
  resultEyebrow: {
    color: Colors.accentText,
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
  infoCard: {
    marginTop: 28,
    padding: 18,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  infoText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },
});
