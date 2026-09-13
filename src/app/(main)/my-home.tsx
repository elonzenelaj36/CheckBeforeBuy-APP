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

import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useFocusEffect,
  useRouter,
} from 'expo-router';

import BottomNavigation from '@/components/BottomNavigation';

import {
  deleteRoom,
  getRooms,
  SavedRoom,
} from '@/services/storage';

export default function MyHome() {
  const router = useRouter();

  const [rooms, setRooms] = React.useState<SavedRoom[]>(
    []
  );

  const loadRooms = async () => {
    const savedRooms = await getRooms();

    setRooms(savedRooms);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadRooms();
    }, [])
  );

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
              YOUR SPACE
            </Text>

            <Text style={styles.headerTitle}>
              My Home
            </Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* Intro */}

        <View style={styles.intro}>
          <Text style={styles.title}>
            Build your home.
          </Text>

          <Text style={styles.subtitle}>
            Add your rooms so we can make every product
            recommendation more personal.
          </Text>
        </View>

        {/* Add Room */}

        <TouchableOpacity
          style={styles.addRoomCard}
          activeOpacity={0.85}
          onPress={() => router.push('/select-room')}
        >
          <View style={styles.addRoomIcon}>
            <Text style={styles.plus}>
              +
            </Text>
          </View>

          <View style={styles.addRoomText}>
            <Text style={styles.addRoomTitle}>
              Add a room
            </Text>

            <Text style={styles.addRoomDescription}>
              Add a room photo and start building your
              space.
            </Text>
          </View>

          <Text style={styles.addRoomArrow}>
            →
          </Text>
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
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>
                +
              </Text>
            </View>

            <Text style={styles.emptyTitle}>
              No rooms yet
            </Text>

            <Text style={styles.emptyDescription}>
              Add your first room to start visualizing
              products in your actual space.
            </Text>

            <TouchableOpacity
              style={styles.addButton}
              onPress={() =>
                router.push('/select-room')
              }
            >
              <Text style={styles.addButtonText}>
                ADD FIRST ROOM
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Saved Rooms */

          <View style={styles.roomsList}>
            {rooms.map((room) => (
              <View
                key={room.id}
                style={styles.roomCard}
              >
                <Image
                  source={{
                    uri: room.imageUri,
                  }}
                  style={styles.roomImage}
                />

                <View style={styles.roomInfo}>
                  <Text style={styles.roomType}>
                    {room.roomType}
                  </Text>

                  <Text
                    style={styles.roomDescription}
                  >
                    Added to your home
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => {
                    Alert.alert(
                      'Remove room',
                      `Remove your ${room.roomType.toLowerCase()}?`,
                      [
                        {
                          text: 'Cancel',
                          style: 'cancel',
                        },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: async () => {
                            await deleteRoom(
                              room.id
                            );

                            loadRooms();
                          },
                        },
                      ]
                    );
                  }}
                >
                  <Text style={styles.deleteText}>
                    ×
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Why Add Home */}

        <View style={styles.whySection}>
          <Text style={styles.sectionTitle}>
            WHY ADD YOUR HOME?
          </Text>

          <Text style={styles.whyTitle}>
            Make every recommendation personal.
          </Text>

          <Text style={styles.whyDescription}>
            Your rooms will help Check Before Buy
            understand your space and show you how
            products actually look before you buy them.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Navigation */}

      <BottomNavigation activeTab="home" />
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
    maxWidth: 340,
  },

  addRoomCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    minHeight: 120,
    flexDirection: 'row',
    alignItems: 'center',
  },

  addRoomIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },

  plus: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '300',
  },

  addRoomText: {
    flex: 1,
    marginLeft: 14,
  },

  addRoomTitle: {
    color: '#111111',
    fontSize: 17,
    fontWeight: '700',
  },

  addRoomDescription: {
    color: '#666666',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
    paddingRight: 10,
  },

  addRoomArrow: {
    color: '#111111',
    fontSize: 20,
    marginLeft: 8,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 34,
    marginBottom: 12,
  },

  sectionTitle: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  roomCount: {
    color: '#555555',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },

  emptyCard: {
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 22,
    alignItems: 'center',
  },

  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  emptyIconText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '300',
  },

  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  emptyDescription: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 7,
    maxWidth: 290,
  },

  addButton: {
    height: 46,
    paddingHorizontal: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },

  addButtonText: {
    color: '#111111',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  roomsList: {
    gap: 12,
  },

  roomCard: {
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  roomImage: {
    width: 82,
    height: 82,
    borderRadius: 12,
  },

  roomInfo: {
    flex: 1,
    marginLeft: 14,
  },

  roomType: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  roomDescription: {
    color: '#777777',
    fontSize: 12,
    marginTop: 5,
  },

  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
  },

  deleteText: {
    color: '#777777',
    fontSize: 22,
    fontWeight: '300',
  },

  whySection: {
    marginTop: 36,
    paddingBottom: 20,
  },

  whyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 12,
  },

  whyDescription: {
    color: '#777777',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 9,
  },
});