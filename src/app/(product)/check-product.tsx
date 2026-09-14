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

export default function CheckProduct() {
  const router = useRouter();

  const [imageUri, setImageUri] = React.useState<string | null>(null);

  const takePhoto = async () => {
    const permission =
      await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Camera permission needed',
        'Please allow camera access to take a product photo.'
      );

      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const chooseFromGallery = async () => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Photo permission needed',
        'Please allow photo library access to choose a product photo.'
      );

      return;
    }

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const continueWithProduct = () => {
    if (!imageUri) {
      return;
    }

    router.push({
      pathname: '/product-captured',
      params: {
        imageUri: imageUri,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>

          <View>
            <Text style={styles.eyebrow}>
              CHECK
            </Text>

            <Text style={styles.headerTitle}>
              Check a product
            </Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.title}>
            Before you buy,
          </Text>

          <Text style={styles.title}>
            check it.
          </Text>

          <Text style={styles.subtitle}>
            Take a photo of a product you're thinking about
            buying. We'll help you understand it before you
            spend your money.
          </Text>
        </View>

        {/* Preview */}
        <View style={styles.previewContainer}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.previewImage}
            />
          ) : (
            <View style={styles.emptyPreview}>
              <View style={styles.cameraCircle}>
                <Text style={styles.cameraSymbol}>
                  +
                </Text>
              </View>

              <Text style={styles.previewTitle}>
                Take a photo
              </Text>

              <Text style={styles.previewDescription}>
                Point your camera at the product you want
                to check.
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
            TAKE PRODUCT PHOTO
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

        {/* What happens */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>
            WHAT HAPPENS NEXT
          </Text>

          <View style={styles.infoRow}>
            <View style={styles.numberCircle}>
              <Text style={styles.number}>
                01
              </Text>
            </View>

            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>
                Identify the product
              </Text>

              <Text style={styles.infoDescription}>
                We'll identify what you're looking at and
                collect useful product information.
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.numberCircle}>
              <Text style={styles.number}>
                02
              </Text>
            </View>

            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>
                See it in your room
              </Text>

              <Text style={styles.infoDescription}>
                Generate the product inside one of your
                saved rooms.
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.numberCircle}>
              <Text style={styles.number}>
                03
              </Text>
            </View>

            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>
                Decide before buying
              </Text>

              <Text style={styles.infoDescription}>
                Understand the price, quality, alternatives,
                and whether it makes sense for you.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backArrow: {
    color: '#FFFFFF',
    fontSize: 20,
  },

  eyebrow: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center',
  },

  headerSpacer: {
    width: 44,
  },

  intro: {
    marginTop: 42,
    marginBottom: 28,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 38,
  },

  subtitle: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
  },

  previewContainer: {
    width: '100%',
    height: 280,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },

  previewImage: {
    width: '100%',
    height: '100%',
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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  cameraSymbol: {
    color: '#111111',
    fontSize: 32,
    fontWeight: '300',
  },

  previewTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },

  previewDescription: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 7,
    maxWidth: 280,
  },

  primaryButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },

  primaryButtonText: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  secondaryButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  continueButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  continueButtonText: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  infoSection: {
    marginTop: 36,
  },

  sectionTitle: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 18,
  },

  infoRow: {
    flexDirection: 'row',
    marginBottom: 22,
  },

  numberCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  number: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },

  infoTextContainer: {
    flex: 1,
    marginLeft: 14,
  },

  infoTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  infoDescription: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
});