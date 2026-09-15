import React from 'react';
import {
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

export default function SelectRoom() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    productImageUri?: string | string[];
    productName?: string | string[];
    productCheckId?: string | string[];
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
  const selectSavedRoom = (room: Room) => {
    router.push({
      pathname: '/visualization',
      params: {
        roomType: room.roomType,
        roomId: room.id,
        imageUri: room.primaryImageUri || productImageUri,
        productImageUri,
        productName: productName || room.name,
        productCheckId,
        productMode: 'true',
      },
    });
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
    backgroundColor: Colors.backgroundElevated,
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
    lineHeight: 38,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: Colors.textMuted,
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
});
