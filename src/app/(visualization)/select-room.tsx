import React from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import EmptyState from '@/components/EmptyState';
import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { getRooms, Room } from '@/services/rooms';
import { detectProductRoute, openProductSelection } from '@/services/productSelection';
import { startSession } from '@/services/visualizationSession';

export default function SelectRoom() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    productImageUri?: string | string[];
    productName?: string | string[];
    productCheckId?: string | string[];
    productCategory?: string | string[];
    productBrand?: string | string[];
  }>();

  const productImageUri = Array.isArray(params.productImageUri)
    ? params.productImageUri[0]
    : params.productImageUri;

  const productName = Array.isArray(params.productName)
    ? params.productName[0]
    : params.productName;

  const productCheckId = Array.isArray(params.productCheckId)
    ? params.productCheckId[0]
    : params.productCheckId;

  const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);

  const [savedRooms, setSavedRooms] = React.useState<Room[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      getRooms().then((rooms) => {
        setSavedRooms(rooms);
        setLoaded(true);
      });
    }, [])
  );

  // A room only exists once the user has explicitly created it — selecting
  // it here must always carry its real roomId into the visualization
  // request, never just a roomType category.
  // The existing session start, unchanged except that Case 2 passes the
  // product the user outlined instead of the full photo.
  const startWithProduct = (room: Room, selectedImageUri?: string) => {
    // Starts a fresh temporary session: the room + Product 1. It lives in
    // memory (services/visualizationSession.ts), so no images go through params.
    startSession(
      {
        id: room.id,
        name: room.name,
        roomType: room.roomType,
        imageUri: room.primaryImageUri ?? null,
      },
      productImageUri
        ? {
            imageUri: selectedImageUri ?? productImageUri,
            name: productName || 'Product',
            category: first(params.productCategory),
            brand: first(params.productBrand),
            productCheckId: productCheckId ?? null,
            ...(selectedImageUri ? { selectedFromPhoto: true } : {}),
          }
        : undefined
    );
  };

  const [checkingPhoto, setCheckingPhoto] = React.useState(false);

  // Decides BEFORE the existing pipeline: one clear product → exactly as
  // before; several / unclear → the user outlines the product first.
  const selectSavedRoom = async (room: Room) => {
    if (checkingPhoto) return;
    if (!productImageUri) {
      startWithProduct(room);
      router.push('/visualization');
      return;
    }

    setCheckingPhoto(true);
    const decision = await detectProductRoute({ imageUri: productImageUri, productCheckId });
    setCheckingPhoto(false);

    if (decision.route === 'auto') {
      startWithProduct(room);
      router.push('/visualization');
      return;
    }

    openProductSelection({
      source: { imageUri: productImageUri, productCheckId },
      reason: decision.reason,
      products: decision.products,
      onConfirm: (selectedImageUri) => {
        startWithProduct(room, selectedImageUri);
        router.replace('/visualization'); // back from the room goes to this room list, as before
      },
    });
    router.push('/select-product');
  };

  const goToCreateRoom = () => {
    router.push('/add-room');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow="VISUALIZE" title="Choose a room" />

        <View style={styles.intro}>
          <Text style={styles.title}>Where should we put it?</Text>

          <Text style={styles.subtitle}>
            Choose one of your saved rooms to visualize this product.
          </Text>
        </View>

        {checkingPhoto && (
          <View style={styles.checking}>
            <ActivityIndicator size="small" color={Colors.accent} />
            <Text style={styles.checkingText}>Checking your photo…</Text>
          </View>
        )}

        {!loaded ? null : savedRooms.length === 0 ? (
          <EmptyState
            icon="🏠"
            title="NO ROOMS YET"
            description="Create a room to visualize products in your space."
            actionLabel="CREATE A ROOM"
            onAction={goToCreateRoom}
          />
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>YOUR SAVED ROOMS</Text>
            <View style={styles.roomList}>
              {savedRooms.map((room) => (
                <TouchableOpacity
                  key={room.id}
                  style={styles.savedRoomCard}
                  onPress={() => selectSavedRoom(room)}
                  disabled={checkingPhoto}
                  activeOpacity={0.8}
                >
                  {room.primaryImageUri ? (
                    <Image
                      source={{ uri: room.primaryImageUri }}
                      style={styles.roomThumb}
                    />
                  ) : (
                    <View style={styles.roomThumbPlaceholder}>
                      <Text style={styles.roomIconText}>🏠</Text>
                    </View>
                  )}

                  <View style={styles.roomText}>
                    <Text style={styles.roomName}>{room.name}</Text>
                    <Text style={styles.roomDescription}>
                      {room.roomType} · {room.imageUris.length} photos
                    </Text>
                  </View>

                  <Text style={styles.arrow}>→</Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={styles.addRoomCard}
                onPress={goToCreateRoom}
                activeOpacity={0.8}
              >
                <Text style={styles.addRoomText}>+ CREATE ANOTHER ROOM</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How visualization works</Text>

          <Text style={styles.infoText}>
            We will combine the product photo with your selected room space to preview how it fits.
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: Colors.lightTextSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  roomList: {
    gap: 10,
  },
  savedRoomCard: {
    minHeight: 80,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  roomThumb: {
    width: 54,
    height: 54,
    borderRadius: 10,
  },
  roomThumbPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomIconText: {
    color: Colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
  roomText: {
    flex: 1,
    marginLeft: 14,
  },
  roomName: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  roomDescription: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  arrow: {
    color: Colors.accent,
    fontSize: 20,
    marginLeft: 10,
  },
  addRoomCard: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRoomText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  infoCard: {
    marginTop: 16,
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
    marginTop: 8,
  },
  checking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  checkingText: {
    color: Colors.lightTextSecondary,
    fontSize: 13,
  },
});
