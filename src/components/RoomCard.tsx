import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Colors } from '@/constants/colors';
import { Room } from '@/services/rooms';

type RoomCardProps = {
  room: Room;
  onPress: () => void;
};

export default function RoomCard({
  room,
  onPress,
}: RoomCardProps) {
  const imageUri =
    room.primaryImageUri ??
    room.imageUris[0] ??
    null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.placeholderText}>
            No photo
          </Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.name}>
          {room.name}
        </Text>

        <Text style={styles.type}>
          {room.roomType}
        </Text>

        <Text style={styles.description}>
          {room.imageUris.length}{' '}
          {room.imageUris.length === 1
            ? 'photo'
            : 'photos'}
        </Text>
      </View>

      <Text style={styles.arrow}>
        →
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 96,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  image: {
    width: 76,
    height: 76,
    borderRadius: 11,
  },

  imagePlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 11,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  placeholderText: {
    color: Colors.textMuted,
    fontSize: 10,
  },

  info: {
    flex: 1,
    marginLeft: 14,
  },

  name: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  type: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },

  description: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },

  arrow: {
    color: Colors.textPrimary,
    fontSize: 20,
    marginRight: 8,
  },
});