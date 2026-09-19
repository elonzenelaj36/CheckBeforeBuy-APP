import React from 'react';

import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { saveImageToGallery } from '@/services/gallery';
import { updateGeneratedImage } from '@/services/generatedImages';

export default function VisualizationDetail() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    id?: string;
    generatedImageUri?: string;
    productImageUri?: string;
    productName?: string;
    roomName?: string;
    roomType?: string;
    roomId?: string;
    productCheckId?: string;
    createdAt?: string;
  }>();

  const imageUri = params.generatedImageUri || params.productImageUri;
  const roomName = params.roomName;

  // The name starts from whatever the previous screen already had (so it
  // renders instantly), but a rename here is the source of truth going
  // forward until this screen is left and reopened with fresh data.
  const [currentName, setCurrentName] = React.useState(params.productName || 'Visualization');
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState(currentName);
  const [savingName, setSavingName] = React.useState(false);

  const [saving, setSaving] = React.useState(false);

  const handleSaveToGallery = async () => {
    if (saving) return;
    setSaving(true);
    const result = await saveImageToGallery(imageUri);
    setSaving(false);

    const isError = result.status === 'permission-denied' || result.status === 'failed';
    Alert.alert(isError ? "Couldn't save photo" : 'Gallery', result.message);
  };

  const canGenerateAgain = !!params.roomId;

  const handleGenerateAgain = () => {
    router.push({
      pathname: '/visualization',
      params: {
        roomId: params.roomId,
        roomType: params.roomType || roomName || 'Room',
        imageUri: params.productImageUri,
        productImageUri: params.productImageUri,
        productName: currentName,
        productCheckId: params.productCheckId,
        productMode: 'true',
      },
    });
  };

  const startEditingName = () => {
    setNameDraft(currentName);
    setIsEditingName(true);
  };

  const cancelEditingName = () => {
    setIsEditingName(false);
  };

  const handleSaveName = async () => {
    if (!params.id) return;

    const trimmed = nameDraft.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Please enter a name for this visualization.');
      return;
    }

    setSavingName(true);
    try {
      // Renames the visualization's canonical name — when it's linked to a
      // product check, that also updates the shared product/check record,
      // so Saved Products and History pick up the same new name.
      const updated = await updateGeneratedImage(params.id, trimmed);
      setCurrentName(updated.productName || trimmed);
      setIsEditingName(false);
    } catch (error: any) {
      Alert.alert('Could not rename', error?.message ?? 'Please try again.');
    } finally {
      setSavingName(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow={roomName ? `MY HOME · ${roomName.toUpperCase()}` : 'VISUALIZATION'} title="Photo" />

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
          {isEditingName ? (
            <>
              <TextInput
                style={styles.nameInput}
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder="Visualization name"
                placeholderTextColor={Colors.textMuted}
                autoFocus
                editable={!savingName}
              />

              <View style={styles.nameEditActions}>
                <TouchableOpacity
                  style={styles.nameCancelBtn}
                  onPress={cancelEditingName}
                  disabled={savingName}
                >
                  <Text style={styles.nameCancelBtnText}>CANCEL</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.nameSaveBtn, savingName && styles.saveButtonDisabled]}
                  onPress={handleSaveName}
                  disabled={savingName}
                >
                  {savingName ? (
                    <ActivityIndicator color={Colors.cardHighlightText} size="small" />
                  ) : (
                    <Text style={styles.nameSaveBtnText}>SAVE NAME</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.productName}>{currentName}</Text>
              {roomName ? <Text style={styles.roomName}>{roomName}</Text> : null}
              {params.createdAt ? (
                <Text style={styles.dateText}>
                  {new Date(params.createdAt).toLocaleDateString()}
                </Text>
              ) : null}

              {params.id && (
                <TouchableOpacity style={styles.editNameBtn} onPress={startEditingName}>
                  <Text style={styles.editNameBtnText}>EDIT NAME</Text>
                </TouchableOpacity>
              )}
            </>
          )}
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

        {canGenerateAgain && (
          <TouchableOpacity
            style={styles.generateAgainButton}
            onPress={handleGenerateAgain}
            activeOpacity={0.85}
          >
            <Text style={styles.generateAgainButtonText}>GENERATE AGAIN</Text>
          </TouchableOpacity>
        )}
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
  editNameBtn: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
  },
  editNameBtnText: {
    color: Colors.accentText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  nameInput: {
    height: 48,
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  nameEditActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  nameCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameCancelBtnText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  nameSaveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.cardHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameSaveBtnText: {
    color: Colors.cardHighlightText,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
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
  generateAgainButton: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  generateAgainButtonText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
