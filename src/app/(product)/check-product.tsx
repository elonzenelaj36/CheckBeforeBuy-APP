import React from 'react';

import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';

export default function CheckProduct() {
  const router = useRouter();

  const [imageUri, setImageUri] = React.useState<
    string | null
  >(null);

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

  const continueWithProduct = () => {
    if (!imageUri) {
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
        <ScreenHeader
          eyebrow="CHECK"
          title="Check a product"
        />

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.title}>
            Before you buy,
          </Text>
          <Text style={styles.title}>check it.</Text>

          <Text style={styles.subtitle}>
            Take a photo of a product you're thinking
            about buying. We'll help you understand it
            before you spend your money.
          </Text>
        </View>

        {/* Preview */}
        <View style={styles.previewContainer}>
          {imageUri ? (
            <>
              <Image
                source={{ uri: imageUri }}
                style={styles.previewImage}
              />

              {/* Retake overlay */}
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={() => setImageUri(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.retakeText}>
                  ✕ RETAKE
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.emptyPreview}>
              <View style={styles.cameraCircle}>
                <Text style={styles.cameraSymbol}>
                  ◎
                </Text>
              </View>

              <Text style={styles.previewTitle}>
                Take a photo
              </Text>

              <Text style={styles.previewDescription}>
                Point your camera at the product you
                want to check.
              </Text>
            </View>
          )}
        </View>

        {/* Camera */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={takePhoto}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {imageUri
              ? 'RETAKE PHOTO'
              : 'TAKE PRODUCT PHOTO'}
          </Text>
        </TouchableOpacity>

        {/* Gallery */}
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={chooseFromGallery}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryButtonText}>
            CHOOSE FROM GALLERY
          </Text>
        </TouchableOpacity>

        {/* Continue */}
        {imageUri && (
          <TouchableOpacity
            style={styles.continueButton}
            onPress={continueWithProduct}
            activeOpacity={0.85}
          >
            <Text style={styles.continueButtonText}>
              CHECK THIS PRODUCT →
            </Text>
          </TouchableOpacity>
        )}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  intro: {
    marginTop: 40,
    marginBottom: 24,
  },

  title: {
    color: Colors.textPrimary,
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
  },

  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },

  previewContainer: {
    width: '100%',
    height: 280,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  previewImage: {
    width: '100%',
    height: '100%',
  },

  retakeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  retakeText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  emptyPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },

  cameraCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accentDim,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  cameraSymbol: {
    color: Colors.accent,
    fontSize: 28,
  },

  previewTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
  },

  previewDescription: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 7,
    maxWidth: 280,
  },

  primaryButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.cardHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },

  primaryButtonText: {
    color: Colors.cardHighlightText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  secondaryButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  secondaryButtonText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  continueButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  continueButtonText: {
    color: Colors.cardHighlight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  infoSection: {
    marginTop: 36,
  },

  sectionTitle: {
    color: Colors.textMuted,
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  number: {
    color: Colors.accent,
    fontSize: 9,
    fontWeight: '700',
  },

  infoTextContainer: {
    flex: 1,
    paddingTop: 4,
  },

  infoTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

  infoDescription: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
});