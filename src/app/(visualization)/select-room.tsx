import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

type RoomType =
  | 'Living Room'
  | 'Bedroom'
  | 'Kitchen'
  | 'Office'
  | 'Other';

export default function SelectRoom() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    productImageUri?: string | string[];
  }>();

  const productImageUri = Array.isArray(params.productImageUri)
    ? params.productImageUri[0]
    : params.productImageUri;

  const rooms: RoomType[] = [
    'Living Room',
    'Bedroom',
    'Kitchen',
    'Office',
    'Other',
  ];

  const selectRoom = (room: RoomType) => {
    if (productImageUri) {
      router.push({
        pathname: '/visualization',
        params: {
          roomType: room,
          imageUri: productImageUri,
          productMode: 'true',
        },
      });

      return;
    }

    router.push({
      pathname: '/capture-room',
      params: {
        roomType: room,
      },
    });
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
            <Text style={styles.eyebrow}>
              {productImageUri ? 'VISUALIZE' : 'MY HOME'}
            </Text>

            <Text style={styles.headerTitle}>
              {productImageUri
                ? 'Choose a room'
                : 'Add a room'}
            </Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.title}>
            {productImageUri
              ? 'Where should we put it?'
              : 'What room are we adding?'}
          </Text>

          <Text style={styles.subtitle}>
            {productImageUri
              ? 'Choose one of your rooms to visualize this product inside it.'
              : 'Choose the type of room you want to add to your home.'}
          </Text>
        </View>

        {/* Room Options */}
        <View style={styles.roomList}>
          {rooms.map((room) => (
            <TouchableOpacity
              key={room}
              style={styles.roomCard}
              onPress={() => selectRoom(room)}
              activeOpacity={0.8}
            >
              <View style={styles.roomIcon}>
                <Text style={styles.roomIconText}>
                  {room.charAt(0)}
                </Text>
              </View>

              <View style={styles.roomText}>
                <Text style={styles.roomName}>
                  {room}
                </Text>

                <Text style={styles.roomDescription}>
                  {productImageUri
                    ? 'Visualize product here'
                    : 'Add this room to your home'}
                </Text>
              </View>

              <Text style={styles.arrow}>→</Text>
            </TouchableOpacity>
          ))}
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
              ? 'We will use the product photo together with your selected room to create a visualization of how the product could look in your space.'
              : 'We will use your room type together with its photo to make product recommendations and visualizations more relevant to your space.'}
          </Text>
        </View>
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
    lineHeight: 38,
  },

  subtitle: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },

  roomList: {
    gap: 12,
  },

  roomCard: {
    minHeight: 78,
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  roomIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  roomIconText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },

  roomText: {
    flex: 1,
    marginLeft: 14,
  },

  roomName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  roomDescription: {
    color: '#777777',
    fontSize: 11,
    marginTop: 4,
  },

  arrow: {
    color: '#FFFFFF',
    fontSize: 20,
    marginLeft: 10,
  },

  infoCard: {
    marginTop: 32,
    padding: 18,
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },

  infoTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  infoText: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
  },
});