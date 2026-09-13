import React from 'react';

import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { saveRoom as saveRoomToStorage } from '@/services/storage';

export default function Visualization() {
  const router = useRouter();

  const { roomType, imageUri } =
    useLocalSearchParams<{
      roomType: string;
      imageUri: string;
    }>();

  const [saving, setSaving] = React.useState(false);

  const saveRoom = async () => {
    if (!imageUri || !roomType || saving) {
      return;
    }

    try {
      setSaving(true);

      await saveRoomToStorage({
        id: Date.now().toString(),
        roomType,
        imageUri,
        createdAt: new Date().toISOString(),
      });

      router.replace('/my-home');
    } catch (error) {
      console.log('Failed to save room:', error);

      setSaving(false);
    }
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
            <Text style={styles.backArrow}>
              ←
            </Text>
          </TouchableOpacity>

          <View>
            <Text style={styles.eyebrow}>
              MY HOME
            </Text>

            <Text style={styles.headerTitle}>
              Room Preview
            </Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* Intro */}

        <View style={styles.intro}>
          <Text style={styles.title}>
            Your space.
          </Text>

          <Text style={styles.subtitle}>
            This is how your{' '}
            {roomType?.toLowerCase()} will look
            inside Check Before Buy.
          </Text>
        </View>

        {/* Room Image */}

        <View style={styles.imageContainer}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.roomImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.noImage}>
              <Text style={styles.noImageText}>
                No room photo found.
              </Text>
            </View>
          )}
        </View>

        {/* Room Information */}

        <View style={styles.infoCard}>
          <View>
            <Text style={styles.infoLabel}>
              ROOM TYPE
            </Text>

            <Text style={styles.infoTitle}>
              {roomType}
            </Text>
          </View>

          <View style={styles.checkCircle}>
            <Text style={styles.check}>
              ✓
            </Text>
          </View>
        </View>

        {/* Future Visualization */}

        <View style={styles.futureCard}>
          <Text style={styles.futureLabel}>
            FUTURE VISUALIZATION
          </Text>

          <Text style={styles.futureTitle}>
            See products inside your room.
          </Text>

          <Text style={styles.futureDescription}>
            Later, you'll be able to place products
            inside this room photo and see how they
            actually fit before buying them.
          </Text>
        </View>

        {/* Save Room */}

        <TouchableOpacity
          style={[
            styles.saveButton,
            saving && styles.saveButtonDisabled,
          ]}
          onPress={saveRoom}
          activeOpacity={0.85}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'SAVING...' : 'SAVE ROOM'}
          </Text>
        </TouchableOpacity>

        {/* Retake */}

        <TouchableOpacity
          style={styles.retakeButton}
          onPress={() => router.back()}
          activeOpacity={0.85}
          disabled={saving}
        >
          <Text style={styles.retakeButtonText}>
            RETAKE PHOTO
          </Text>
        </TouchableOpacity>
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
  },

  subtitle: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },

  imageContainer: {
    width: '100%',
    height: 300,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },

  roomImage: {
    width: '100%',
    height: '100%',
  },

  noImage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  noImageText: {
    color: '#777777',
    fontSize: 13,
  },

  infoCard: {
    marginTop: 14,
    padding: 18,
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  infoLabel: {
    color: '#777777',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  infoTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginTop: 5,
  },

  checkCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  check: {
    color: '#111111',
    fontSize: 18,
    fontWeight: '700',
  },

  futureCard: {
    marginTop: 28,
    padding: 18,
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },

  futureLabel: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  futureTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '600',
    marginTop: 10,
  },

  futureDescription: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
  },

  saveButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },

  saveButtonDisabled: {
    opacity: 0.5,
  },

  saveButtonText: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  retakeButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  retakeButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});