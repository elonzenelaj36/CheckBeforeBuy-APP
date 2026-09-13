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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CaptureRoom() {
  const router = useRouter();

  const { roomType } = useLocalSearchParams<{
    roomType: string;
  }>();

  const [imageUri, setImageUri] = React.useState<string | null>(null);

  const takePhoto = async () => {
    const permission =
      await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Camera permission needed',
        'Please allow camera access to take a photo of your room.'
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
        'Please allow photo library access to choose a room photo.'
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

  const usePhoto = () => {
    if (!imageUri) {
      return;
    }

    router.push({
      pathname: '/visualization',
      params: {
        roomType: roomType,
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
              MY HOME
            </Text>

            <Text style={styles.headerTitle}>
              Add {roomType}
            </Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.title}>
            Show us your space.
          </Text>

          <Text style={styles.subtitle}>
            Take a photo of your{' '}
            {roomType?.toLowerCase()} so we can use it for
            future product visualizations.
          </Text>
        </View>

        {/* Photo Preview */}
        <View style={styles.previewContainer}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.previewImage}
            />
          ) : (
            <View style={styles.emptyPreview}>
              <View style={styles.cameraIcon}>
                <Text style={styles.cameraIconText}>
                  +
                </Text>
              </View>

              <Text style={styles.previewTitle}>
                No photo yet
              </Text>

              <Text style={styles.previewDescription}>
                Take a photo or choose one from your
                gallery.
              </Text>
            </View>
          )}
        </View>

        {/* Camera Button */}
        <TouchableOpacity
          style={styles.cameraButton}
          onPress={takePhoto}
          activeOpacity={0.85}
        >
          <Text style={styles.cameraButtonText}>
            TAKE PHOTO
          </Text>
        </TouchableOpacity>

        {/* Gallery Button */}
        <TouchableOpacity
          style={styles.galleryButton}
          onPress={chooseFromGallery}
          activeOpacity={0.85}
        >
          <Text style={styles.galleryButtonText}>
            CHOOSE FROM GALLERY
          </Text>
        </TouchableOpacity>

        {/* Use Photo */}
        {imageUri && (
          <TouchableOpacity
            style={styles.useButton}
            onPress={usePhoto}
            activeOpacity={0.85}
          >
            <Text style={styles.useButtonText}>
              USE THIS PHOTO
            </Text>
          </TouchableOpacity>
        )}

        {/* Tip */}
        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>
            PHOTO TIP
          </Text>

          <Text style={styles.tipText}>
            Try to capture most of the room from a corner.
            Good lighting will make future visualizations
            more accurate.
          </Text>
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
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
  },

  subtitle: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },

  previewContainer: {
    width: '100%',
    height: 260,
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

  cameraIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  cameraIconText: {
    color: '#111111',
    fontSize: 30,
    fontWeight: '300',
  },

  previewTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  previewDescription: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 7,
  },

  cameraButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },

  cameraButtonText: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  galleryButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  galleryButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  useButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  useButtonText: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  tipCard: {
    marginTop: 28,
    padding: 18,
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },

  tipTitle: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  tipText: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
  },
});