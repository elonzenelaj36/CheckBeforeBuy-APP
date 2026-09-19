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

import {
  useFocusEffect,
  useRouter,
} from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import BottomNavigation from '@/components/BottomNavigation';
import EmptyState from '@/components/EmptyState';
import { Colors } from '@/constants/colors';
import { deleteGeneratedImagesForRoom } from '@/services/generatedImages';
import {
  deleteRoom,
  getRooms,
  Room,
} from '@/services/rooms';

export default function MyHome() {
  const router = useRouter();

  const [rooms, setRooms] = React.useState<Room[]>([]);

  const loadData = async () => {
    const savedRooms = await getRooms();
    setRooms(savedRooms);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const handleDeleteRoom = (room: Room) => {
    Alert.alert(
      'Remove room?',
      `Remove "${room.name}"? This will also delete all generated images for this room.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteRoom(room.id);
            await deleteGeneratedImagesForRoom(room.id);
            loadData();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header — reached from Home, not a bottom-nav tab, so it needs its own back button */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>

          <View>
            <Text style={styles.headerTitle}>MY HOME</Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.title}>These are your spaces.</Text>

          <Text style={styles.subtitle}>
            Add your rooms so we can make every product
            recommendation more personal.
          </Text>
        </View>

        {/* Add Room CTA — its own special, accent-lit treatment */}
        <TouchableOpacity
          style={styles.addRoomCard}
          activeOpacity={0.88}
          onPress={() => router.push('/add-room')}
        >
          <View style={styles.addRoomIcon}>
            <Text style={styles.plus}>+</Text>
          </View>

          <View style={styles.addRoomText}>
            <Text style={styles.addRoomTitle}>
              Add a room
            </Text>

            <Text style={styles.addRoomDescription}>
              Name your room, choose a type, and add
              multiple photos.
            </Text>
          </View>

          <Text style={styles.addRoomArrow}>→</Text>
        </TouchableOpacity>

        {/* Rooms Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            YOUR ROOMS
          </Text>

          <Text style={styles.roomCount}>
            {rooms.length}{' '}
            {rooms.length === 1 ? 'ROOM' : 'ROOMS'}
          </Text>
        </View>

        {/* Empty State */}
        {rooms.length === 0 ? (
          <EmptyState
            icon="🏠"
            title="No rooms yet"
            description="Add your first room to start visualizing products in your actual space."
            actionLabel="ADD FIRST ROOM"
            onAction={() => router.push('/add-room')}
          />
        ) : (
          <View style={styles.roomsList}>
            {rooms.map((room) => (
              <TouchableOpacity
                key={room.id}
                style={styles.roomCard}
                activeOpacity={0.92}
                onPress={() =>
                  router.push({
                    pathname: '/room-detail',
                    params: { roomId: room.id },
                  })
                }
              >
                <View style={styles.roomImageWrap}>
                  {room.primaryImageUri ? (
                    <Image
                      source={{
                        uri: room.primaryImageUri,
                      }}
                      style={styles.roomImage}
                    />
                  ) : (
                    <View style={styles.roomImagePlaceholder}>
                      <Text
                        style={
                          styles.roomImagePlaceholderText
                        }
                      >
                        🏠
                      </Text>
                    </View>
                  )}

                  {/* Photo-count pill */}
                  <View style={styles.roomPhotosPill}>
                    <Text style={styles.roomPhotosPillText}>
                      {room.imageUris.length}{' '}
                      {room.imageUris.length === 1
                        ? 'photo'
                        : 'photos'}
                    </Text>
                  </View>

                  {/* Delete */}
                  <TouchableOpacity
                    style={styles.roomDeleteButton}
                    onPress={() =>
                      handleDeleteRoom(room)
                    }
                  >
                    <Text style={styles.roomDeleteText}>
                      ×
                    </Text>
                  </TouchableOpacity>

                  {/* Soft bottom fade + caption */}
                  <View style={styles.roomScrimUpper} pointerEvents="none" />
                  <View style={styles.roomScrimLower} pointerEvents="none" />

                  <View style={styles.roomCaption} pointerEvents="none">
                    <Text style={styles.roomName} numberOfLines={1}>
                      {room.name}
                    </Text>

                    <Text style={styles.roomType}>
                      {room.roomType}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Find for My Home CTA */}
        <TouchableOpacity
          style={styles.findCard}
          activeOpacity={0.88}
          onPress={() => router.push('/find-for-my-home')}
        >
          <View style={styles.findText}>
            <Text style={styles.findTitle}>Find for my home</Text>
            <Text style={styles.findDescription}>
              See products that would actually complement what you already have.
            </Text>
          </View>

          <Text style={styles.findArrow}>→</Text>
        </TouchableOpacity>
      </ScrollView>

      <BottomNavigation activeTab="home" />
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
    paddingBottom: 120,
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
    backgroundColor: Colors.myHomeSurface,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backArrow: {
    color: Colors.textPrimary,
    fontSize: 20,
  },

  eyebrow: {
    color: Colors.lightTextSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  headerTitle: {
    color: Colors.lightTextPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center',
  },

  headerSpacer: {
    width: 44,
  },

  intro: {
    marginTop: 36,
    marginBottom: 26,
  },

  title: {
    color: Colors.lightTextPrimary,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  subtitle: {
    color: Colors.lightTextSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    maxWidth: 340,
  },

  addRoomCard: {
    backgroundColor: 'rgba(94, 214, 196, 0.10)',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(94, 214, 196, 0.4)',
    padding: 18,
    minHeight: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: Colors.myHomeAccent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 5,
  },

  addRoomIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: Colors.myHomeAccentDim,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  plus: {
    color: Colors.myHomeAccentText,
    fontSize: 26,
    fontWeight: '300',
  },

  addRoomText: {
    flex: 1,
  },

  addRoomTitle: {
    color: Colors.lightTextPrimary,
    fontSize: 17,
    fontWeight: '700',
  },

  addRoomDescription: {
    color: Colors.lightTextSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  addRoomArrow: {
    color: Colors.lightMyHomeAccentText,
    fontSize: 20,
    fontWeight: '700',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 32,
    marginBottom: 14,
  },

  sectionTitle: {
    color: Colors.lightTextSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  roomCount: {
    color: Colors.lightTextMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },

  roomsList: {
    gap: 16,
  },

  /* ── Room card — image-first "space preview" ──────────── */

  roomCard: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: Colors.myHomeSurface,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 3,
  },

  roomImageWrap: {
    width: '100%',
    height: 190,
    position: 'relative',
  },

  roomImage: {
    width: '100%',
    height: '100%',
  },

  roomImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.myHomeSurfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },

  roomImagePlaceholderText: {
    fontSize: 34,
  },

  roomPhotosPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(13, 27, 44, 0.68)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(166, 237, 224, 0.3)',
  },

  roomPhotosPillText: {
    color: Colors.myHomeAccentText,
    fontSize: 10,
    fontWeight: '700',
  },

  roomDeleteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(13, 27, 44, 0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  roomDeleteText: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '300',
    lineHeight: 20,
  },

  roomScrimUpper: {
    position: 'absolute',
    bottom: 46,
    left: 0,
    right: 0,
    height: 46,
    backgroundColor: 'rgba(13, 27, 44, 0.32)',
  },

  roomScrimLower: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 66,
    backgroundColor: 'rgba(13, 27, 44, 0.72)',
  },

  roomCaption: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
  },

  roomName: {
    color: Colors.textPrimary,
    fontSize: 19,
    fontWeight: '700',
  },

  roomType: {
    color: Colors.myHomeAccentText,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 3,
  },

  findCard: {
    marginTop: 30,
    marginBottom: 10,
    backgroundColor: Colors.myHomeSurfaceRaised,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
    padding: 18,
    minHeight: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  findText: {
    flex: 1,
  },

  findTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },

  findDescription: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  findArrow: {
    color: Colors.myHomeAccentText,
    fontSize: 20,
    fontWeight: '700',
  },
});
