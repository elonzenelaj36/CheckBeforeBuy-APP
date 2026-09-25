import React from 'react';

import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SafeAreaView } from 'react-native-safe-area-context';

import BottomNavigation from '@/components/BottomNavigation';
import BrandLogo from '@/components/BrandLogo';
import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { detectProductRoute, openProductSelection } from '@/services/productSelection';
import { addProduct, useVisualizationSession } from '@/services/visualizationSession';

const tutorialVideoSource = require('@/assets/videos/Check-video.mov');

export default function CheckProduct() {
  const router = useRouter();

  // "Generate another product" mode: the photo is added to the current
  // visualization session instead of starting a product check.
  const { addToSession } = useLocalSearchParams<{ addToSession?: string }>();
  const session = useVisualizationSession();
  const isSessionMode = addToSession === '1';

  const [imageUri, setImageUri] = React.useState<
    string | null
  >(null);

  const hasImage = Boolean(imageUri);
  const [checkingPhoto, setCheckingPhoto] = React.useState(false);

  const tutorialPlayer = useVideoPlayer(tutorialVideoSource, (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  const takePhoto = async () => {
    const permission =
      await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Camera access needed',
        'Please allow camera access in Settings to take a product photo.',
        [{ text: 'OK' }]
      );

      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const chooseFromGallery = async () => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Please allow photo library access in Settings to choose a product photo.',
        [{ text: 'OK' }]
      );

      return;
    }

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  // The existing "add to this room" step, unchanged. Case 1 calls it with the
  // photo as taken; Case 2 with the product the user outlined.
  const addToCurrentSession = (productImageUri: string, selectedFromPhoto = false) => {
    const result = addProduct({
      imageUri: productImageUri,
      name: `Product ${(session?.products.length ?? 0) + 1}`,
      ...(selectedFromPhoto ? { selectedFromPhoto: true } : {}),
    });

    if (!result.ok) {
      Alert.alert("Couldn't add product", result.message);
      if (result.reason === 'no-session') router.replace('/my-home');
      return false;
    }
    return true;
  };

  // Decides BEFORE the existing pipeline: one clear product → add the photo as
  // before; several / unclear → the user outlines the product first.
  const routeSessionProduct = async (photoUri: string) => {
    setCheckingPhoto(true);
    const decision = await detectProductRoute({ imageUri: photoUri });
    setCheckingPhoto(false);

    if (decision.route === 'auto') {
      if (addToCurrentSession(photoUri)) router.back(); // back to the visualization screen, same session
      return;
    }

    openProductSelection({
      source: { imageUri: photoUri },
      reason: decision.reason,
      products: decision.products,
      onConfirm: (selectedImageUri) => {
        if (addToCurrentSession(selectedImageUri, true)) router.dismissTo('/visualization');
      },
    });
    router.push('/select-product');
  };

  const continueWithProduct = () => {
    if (!imageUri || checkingPhoto) {
      return;
    }

    if (isSessionMode) {
      void routeSessionProduct(imageUri);
      return;
    }

    router.push({
      pathname: '/product-captured',
      params: { imageUri },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {isSessionMode ? (
          <ScreenHeader eyebrow="MY ROOM" title="Add product" />
        ) : (
          <BrandLogo />
        )}

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.title}>
            {isSessionMode ? 'Add a product.' : 'Check the product.'}
          </Text>

          <Text style={styles.subtitle}>
            {isSessionMode
              ? 'Take or choose a photo of another product to place in the same room.'
              : "Take a photo of a product you're thinking about buying. We'll help you understand it before you spend your money."}
          </Text>
        </View>

        {/* Capture area */}
        <View style={styles.previewOuter}>
          <View style={styles.previewContainer}>
            {imageUri ? (
              <>
                <Image
                  source={{ uri: imageUri }}
                  style={styles.previewImage}
                />

                <Pressable
                  onPress={() => setImageUri(null)}
                  style={({ pressed }) => [
                    styles.retakeButton,
                    pressed && styles.retakeButtonPressed,
                  ]}
                >
                  <Text style={styles.retakeText}>
                    ✕ RETAKE
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <VideoView
                  player={tutorialPlayer}
                  style={styles.tutorialVideo}
                  contentFit="cover"
                  nativeControls={false}
                  pointerEvents="none"
                />

                <View style={styles.cornerTL} pointerEvents="none" />
                <View style={styles.cornerTR} pointerEvents="none" />
                <View style={styles.cornerBL} pointerEvents="none" />
                <View style={styles.cornerBR} pointerEvents="none" />
              </>
            )}
          </View>
        </View>

        {/* Continue — appears once a photo exists, becomes the primary action */}
        {imageUri && (
          <Pressable
            onPress={continueWithProduct}
            disabled={checkingPhoto}
            style={({ pressed }) => [
              styles.pillPrimary,
              pressed && styles.pillPrimaryPressed,
              checkingPhoto && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.pillPrimaryText}>
              {isSessionMode ? (checkingPhoto ? 'CHECKING YOUR PHOTO…' : 'ADD TO MY ROOM') : 'CHECK THIS PRODUCT'}
            </Text>
            <Text style={styles.pillPrimaryArrow}>→</Text>
          </Pressable>
        )}

        {/* Camera */}
        <Pressable
          onPress={takePhoto}
          style={({ pressed }) => [
            hasImage ? styles.pillSecondary : styles.pillPrimary,
            pressed &&
              (hasImage
                ? styles.pillSecondaryPressed
                : styles.pillPrimaryPressed),
          ]}
        >
          <Text style={hasImage ? styles.pillSecondaryIcon : styles.pillPrimaryIcon}>
            ◎
          </Text>
          <Text
            style={
              hasImage
                ? styles.pillSecondaryText
                : styles.pillPrimaryText
            }
          >
            {hasImage ? 'RETAKE PHOTO' : 'TAKE PRODUCT PHOTO'}
          </Text>
        </Pressable>

        {/* Gallery */}
        <Pressable
          onPress={chooseFromGallery}
          style={({ pressed }) => [
            styles.pillSecondary,
            pressed && styles.pillSecondaryPressed,
          ]}
        >
          <Text style={styles.pillSecondaryIcon}>▦</Text>
          <Text style={styles.pillSecondaryText}>
            CHOOSE FROM GALLERY
          </Text>
        </Pressable>

        {/* What happens next */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>
            WHAT HAPPENS NEXT
          </Text>

          {[
            {
              num: '01',
              title: 'Identify the product',
              desc: "We'll identify what you're looking at and collect useful product information.",
            },
            {
              num: '02',
              title: 'See it in your room',
              desc: 'Generate the product inside one of your saved rooms.',
            },
            {
              num: '03',
              title: 'Decide before buying',
              desc: 'Understand the price, quality, alternatives, and whether it makes sense for you.',
            },
          ].map(({ num, title, desc }) => (
            <View key={num} style={styles.infoRow}>
              <View style={styles.numberCircle}>
                <Text style={styles.number}>{num}</Text>
              </View>

              <View style={styles.infoTextContainer}>
                <Text style={styles.infoTitle}>
                  {title}
                </Text>
                <Text style={styles.infoDescription}>
                  {desc}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {!isSessionMode && <BottomNavigation activeTab="check" />}
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
    paddingBottom: 130,
  },

  intro: {
    marginTop: 36,
    marginBottom: 28,
  },

  title: {
    color: Colors.lightTextPrimary,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
    letterSpacing: 0.2,
  },

  subtitle: {
    color: Colors.lightTextSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    maxWidth: 320,
  },

  /* ── Capture area ──────────────────────────────────────── */

  previewOuter: {
    borderRadius: 30,
    padding: 2,
    backgroundColor: 'rgba(111, 173, 232, 0.28)',
    shadowColor: Colors.checkAccent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },

  previewContainer: {
    width: '100%',
    height: 300,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: Colors.checkSurface,
    borderWidth: 1,
    borderColor: Colors.checkBorder,
  },

  previewImage: {
    width: '100%',
    height: '100%',
  },

  retakeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(14, 27, 48, 0.78)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.checkBorder,
  },

  retakeButtonPressed: {
    opacity: 0.75,
  },

  retakeText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  tutorialVideo: {
    width: '100%',
    height: '100%',
  },

  cornerTL: {
    position: 'absolute',
    top: 18,
    left: 18,
    width: 22,
    height: 22,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: 8,
    borderColor: 'rgba(180, 217, 247, 0.55)',
  },

  cornerTR: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 22,
    height: 22,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopRightRadius: 8,
    borderColor: 'rgba(180, 217, 247, 0.55)',
  },

  cornerBL: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    width: 22,
    height: 22,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: 8,
    borderColor: 'rgba(180, 217, 247, 0.55)',
  },

  cornerBR: {
    position: 'absolute',
    bottom: 18,
    right: 18,
    width: 22,
    height: 22,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: 8,
    borderColor: 'rgba(180, 217, 247, 0.55)',
  },

  /* ── Actions ───────────────────────────────────────────── */

  pillPrimary: {
    height: 52,
    borderRadius: 26,
    marginHorizontal: 6,
    backgroundColor: Colors.checkAccent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    shadowColor: Colors.checkAccent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 7,
  },

  pillPrimaryPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },

  pillPrimaryText: {
    color: Colors.textInverse,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  pillPrimaryIcon: {
    color: Colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },

  pillPrimaryArrow: {
    color: Colors.textInverse,
    fontSize: 15,
    fontWeight: '800',
  },

  pillSecondary: {
    height: 48,
    borderRadius: 24,
    marginHorizontal: 6,
    backgroundColor: 'rgba(111, 173, 232, 0.10)',
    borderWidth: 1.5,
    borderColor: Colors.checkBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },

  pillSecondaryIcon: {
    color: Colors.lightAccentText,
    fontSize: 16,
    fontWeight: '700',
  },

  pillSecondaryPressed: {
    opacity: 0.75,
  },

  pillSecondaryText: {
    color: Colors.lightAccentText,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  /* ── What happens next ─────────────────────────────────── */

  infoSection: {
    marginTop: 40,
  },

  sectionTitle: {
    color: Colors.lightTextSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 18,
  },

  infoRow: {
    flexDirection: 'row',
    marginBottom: 22,
    gap: 14,
  },

  numberCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.checkSurface,
    borderWidth: 1,
    borderColor: Colors.checkBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  number: {
    color: Colors.checkAccentText,
    fontSize: 9,
    fontWeight: '700',
  },

  infoTextContainer: {
    flex: 1,
    paddingTop: 4,
  },

  infoTitle: {
    color: Colors.lightTextPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

  infoDescription: {
    color: Colors.lightTextSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
});
