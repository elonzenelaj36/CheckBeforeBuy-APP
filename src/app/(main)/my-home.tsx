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

  const loadRooms = async () => {
    const savedRooms = await getRooms();
    setRooms(savedRooms);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadRooms();
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
            loadRooms();
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
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>

          <View>
            <Text style={styles.eyebrow}>YOUR SPACE</Text>
            <Text style={styles.headerTitle}>My Home</Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.title}>Build your home.</Text>

          <Text style={styles.subtitle}>
            Add your rooms so we can make every product
            recommendation more personal.
          </Text>
        </View>

        {/* Add Room CTA */}
        <TouchableOpacity
          style={styles.addRoomCard}
          activeOpacity={0.85}
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
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: '/room-detail',
                    params: { roomId: room.id },
                  })
                }
              >
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

                <View style={styles.roomInfo}>
                  <Text style={styles.roomName}>
                    {room.name}
                  </Text>

                  <Text style={styles.roomType}>
                    {room.roomType}
                  </Text>

                  <Text style={styles.roomPhotos}>
                    {room.imageUris.length}{' '}
                    {room.imageUris.length === 1
                      ? 'photo'
                      : 'photos'}
                  </Text>
                </View>

                <View style={styles.roomActions}>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() =>
                      handleDeleteRoom(room)
                    }
                  >
                    <Text style={styles.deleteText}>
                      ×
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.chevron}>›</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Why section */}
        <View style={styles.whySection}>
          <Text style={styles.sectionTitle}>
            WHY ADD YOUR HOME?
          </Text>

          <Text style={styles.whyTitle}>
            Make every recommendation personal.
          </Text>

          <Text style={styles.whyDescription}>
            Your rooms will help Check Before Buy understand
            your space and show you how products actually
            look before you buy them.
          </Text>
        </View>
      </ScrollView>

      <BottomNavigation activeTab="home" />
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backArrow: {
    color: Colors.textPrimary,
    fontSize: 20,
  },

  eyebrow: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center',
  },

  headerSpacer: {
    width: 44,
  },

  intro: {
    marginTop: 40,
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
    lineHeight: 21,
    marginTop: 10,
    maxWidth: 340,
  },

  addRoomCard: {
    backgroundColor: Colors.cardHighlight,
    borderRadius: 20,
    padding: 18,
    minHeight: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  addRoomIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  plus: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '300',
  },

  addRoomText: {
    flex: 1,
  },

  addRoomTitle: {
    color: Colors.cardHighlightText,
    fontSize: 17,
    fontWeight: '700',
  },

  addRoomDescription: {
    color: Colors.cardHighlightTextMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  addRoomArrow: {
    color: Colors.cardHighlightText,
    fontSize: 20,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 30,
    marginBottom: 12,
  },

  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  roomCount: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },

  roomsList: {
    gap: 10,
  },

  roomCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  roomImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    flexShrink: 0,
  },

  roomImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  roomImagePlaceholderText: {
    fontSize: 28,
  },

  roomInfo: {
    flex: 1,
  },

  roomName: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  roomType: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 3,
    fontWeight: '500',
  },

  roomPhotos: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },

  roomActions: {
    alignItems: 'center',
    gap: 8,
  },

  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  deleteText: {
    color: Colors.textMuted,
    fontSize: 20,
    fontWeight: '300',
    lineHeight: 22,
  },

  chevron: {
    color: Colors.textMuted,
    fontSize: 24,
  },

  whySection: {
    marginTop: 36,
    paddingBottom: 10,
  },

  whyTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '600',
    marginTop: 10,
  },

  whyDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
});