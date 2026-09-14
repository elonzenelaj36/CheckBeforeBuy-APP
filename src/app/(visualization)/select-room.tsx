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

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { getRooms, ROOM_TYPES, Room, RoomType } from '@/services/rooms';

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

  useFocusEffect(
    React.useCallback(() => {
      getRooms().then(setSavedRooms);
    }, [])
  );

  const selectSavedRoom = (room: Room) => {
    if (productImageUri) {
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
      return;
    }

    router.push({
      pathname: '/room-detail',
      params: { roomId: room.id },
    });
  };

  const selectRoomType = (type: RoomType) => {
    if (productImageUri) {
      router.push({
        pathname: '/visualization',
        params: {
          roomType: type,
          imageUri: productImageUri,
          productName,
          productCheckId,
          productMode: 'true',
        },
      });
      return;
    }

    router.push({
      pathname: '/capture-room',
      params: {
        roomType: type,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader
          eyebrow={productImageUri ? 'VISUALIZE' : 'MY HOME'}
          title={productImageUri ? 'Choose a room' : 'Select room type'}
        />

        <View style={styles.intro}>
          <Text style={styles.title}>
            {productImageUri
              ? 'Where should we put it?'
              : 'What room are we adding?'}
          </Text>

          <Text style={styles.subtitle}>
            {productImageUri
              ? 'Choose one of your saved rooms or a room category to visualize this product.'
              : 'Choose the type of room you want to add to your home.'}
          </Text>
        </View>

        {/* User's Saved Rooms (if any) */}
        {savedRooms.length > 0 && (
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
            </View>
          </View>
        )}

        {/* Standard Room Types */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {savedRooms.length > 0 ? 'OR CHOOSE A ROOM CATEGORY' : 'ROOM CATEGORIES'}
          </Text>

          <View style={styles.roomList}>
            {ROOM_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={styles.roomCard}
                onPress={() => selectRoomType(type)}
                activeOpacity={0.8}
              >
                <View style={styles.roomIcon}>
                  <Text style={styles.roomIconText}>{type.charAt(0)}</Text>
                </View>

                <View style={styles.roomText}>
                  <Text style={styles.roomName}>{type}</Text>
                  <Text style={styles.roomDescription}>
                    {productImageUri
                      ? 'Visualize product in this category'
                      : 'Add a new ' + type.toLowerCase()}
                  </Text>
                </View>

                <Text style={styles.arrow}>→</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            {productImageUri
              ? 'How visualization works'
              : 'Why do we need this?'}
          </Text>

          <Text style={styles.infoText}>
            {productImageUri
              ? 'We will combine the product photo with your selected room space to preview how it fits.'
              : 'Room details help Check Before Buy personalize recommendations and visualize products in your actual space.'}
          </Text>
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
  roomCard: {
    minHeight: 74,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  roomIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.accentDim,
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