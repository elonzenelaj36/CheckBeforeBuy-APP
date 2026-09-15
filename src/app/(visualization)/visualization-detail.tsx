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

import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { saveImageToGallery } from '@/services/gallery';

export default function VisualizationDetail() {
  const params = useLocalSearchParams<{
    generatedImageUri?: string;
    productImageUri?: string;
    productName?: string;
    roomName?: string;
    createdAt?: string;
  }>();

  const imageUri = params.generatedImageUri || params.productImageUri;
  const productName = params.productName || 'Visualization';
  const roomName = params.roomName;

  const [saving, setSaving] = React.useState(false);

  const handleSaveToGallery = async () => {
    if (saving) return;
    setSaving(true);
    const result = await saveImageToGallery(imageUri);
    setSaving(false);

    const isError = result.status === 'permission-denied' || result.status === 'failed';
    Alert.alert(isError ? "Couldn't save photo" : 'Gallery', result.message);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow="VISUALIZATION" title="Photo" />

        <View style={styles.imageContainer}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.placeholderText}>Image unavailable</Text>
            </View>
          )}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.productName}>{productName}</Text>
          {roomName ? <Text style={styles.roomName}>{roomName}</Text> : null}
          {params.createdAt ? (
            <Text style={styles.dateText}>
              {new Date(params.createdAt).toLocaleDateString()}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSaveToGallery}
          activeOpacity={0.85}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={Colors.cardHighlight} />
          ) : (
            <Text style={styles.saveButtonText}>SAVE TO GALLERY</Text>
          )}
        </TouchableOpacity>
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
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 24,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface2,
  },
  placeholderText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  infoCard: {
    marginTop: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
  },
  productName: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  roomName: {
    color: Colors.accentText,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  dateText: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 6,
  },
  saveButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: Colors.cardHighlight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
