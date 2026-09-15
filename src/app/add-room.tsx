import React from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { analyzeRoom, createRoom, ROOM_TYPES, RoomType } from '@/services/rooms';

export default function AddRoom() {
  const router = useRouter();

  const [name, setName] = React.useState('');
  const [selectedType, setSelectedType] = React.useState<RoomType>('Living Room');
  const [imageUri, setImageUri] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera permission needed',
        'Please allow camera access in Settings to take a room photo.'
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
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo permission needed',
        'Please allow photo library access in Settings to choose a room photo.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Room name required', 'Please enter a name for your room.');
      return;
    }

    setIsSaving(true);
    try {
      const room = await createRoom({
        name: trimmedName,
        roomType: selectedType,
        imageUri: imageUri ?? undefined,
      });

      setIsSaving(false);

      // Room analysis is best-effort: the room is already saved above, so a
      // failure here must never block navigation or look like the room save
      // itself failed.
      if (imageUri) {
        setIsAnalyzing(true);
        try {
          const result = await analyzeRoom(room.id);
          if (result.items.length > 0) {
            Alert.alert(
              'Room analyzed',
              `${result.items.length} item${result.items.length === 1 ? '' : 's'} added to My Items.`
            );
          }
        } catch (error) {
          console.error('[add-room] Room analysis failed:', error);
        }
        setIsAnalyzing(false);
      }

      router.back();
    } catch (error: any) {
      setIsSaving(false);
      setIsAnalyzing(false);
      Alert.alert(
        'Error',
        error?.message ?? 'Failed to save room. Please try again.'
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader eyebrow="MY HOME" title="Add a room" />

          <View style={styles.intro}>
            <Text style={styles.title}>Create your room</Text>
            <Text style={styles.subtitle}>
              Give your room a name, choose a category, and optionally add a primary photo.
            </Text>
          </View>

          {/* Room Name Input */}
          <Text style={styles.label}>ROOM NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Master Bedroom, Cozy Living Room"
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          {/* Room Type Selector */}
          <Text style={styles.label}>ROOM TYPE</Text>
          <View style={styles.typeGrid}>
            {ROOM_TYPES.map((type) => {
              const isSelected = selectedType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeChip,
                    isSelected && styles.typeChipSelected,
                  ]}
                  onPress={() => setSelectedType(type)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      isSelected && styles.typeChipTextSelected,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Room Photo Section */}
          <Text style={styles.label}>ROOM PHOTO (OPTIONAL)</Text>
          <View style={styles.photoContainer}>
            {imageUri ? (
              <View style={styles.previewWrapper}>
                <Image source={{ uri: imageUri }} style={styles.previewImage} />
                <TouchableOpacity
                  style={styles.removePhotoButton}
                  onPress={() => setImageUri(null)}
                >
                  <Text style={styles.removePhotoText}>✕ Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.photoActions}>
                <TouchableOpacity
                  style={styles.photoButton}
                  onPress={takePhoto}
                  activeOpacity={0.8}
                >
                  <Text style={styles.photoButtonIcon}>📷</Text>
                  <Text style={styles.photoButtonText}>Take Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.photoButton}
                  onPress={chooseFromGallery}
                  activeOpacity={0.8}
                >
                  <Text style={styles.photoButtonIcon}>🖼️</Text>
                  <Text style={styles.photoButtonText}>Gallery</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, (isSaving || isAnalyzing) && styles.disabledButton]}
            onPress={handleSave}
            disabled={isSaving || isAnalyzing}
            activeOpacity={0.85}
          >
            <Text style={styles.saveButtonText}>
              {isAnalyzing
                ? 'ANALYZING YOUR ROOM...'
                : isSaving
                  ? 'CREATING ROOM...'
                  : 'CREATE ROOM'}
            </Text>
          </TouchableOpacity>

          {isAnalyzing && (
            <Text style={styles.analyzingHint}>
              AI is checking your room photo for recognizable furniture — this only takes a moment.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundElevated,
  },
  flex: {
    flex: 1,
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
    color: Colors.textPrimary,
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  label: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 18,
    marginBottom: 10,
  },
  input: {
    height: 54,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    color: Colors.textPrimary,
    fontSize: 14,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeChipSelected: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  typeChipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  typeChipTextSelected: {
    color: Colors.accentText,
    fontWeight: '700',
  },
  photoContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewWrapper: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(11, 18, 32, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  removePhotoText: {
    color: Colors.dangerText,
    fontSize: 12,
    fontWeight: '600',
  },
  photoActions: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    justifyContent: 'center',
  },
  photoButton: {
    flex: 1,
    height: 90,
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoButtonIcon: {
    fontSize: 24,
  },
  photoButtonText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  saveButton: {
    height: 56,
    backgroundColor: Colors.cardHighlight,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: Colors.cardHighlightText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  analyzingHint: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 12,
  },
});
