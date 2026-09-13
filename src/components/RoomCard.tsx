import {
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import { SavedRoom } from '@/services/storage';

type RoomCardProps = {
  room: SavedRoom;
  onPress: () => void;
};

export default function RoomCard({
  room,
  onPress,
}: RoomCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Image
        source={{ uri: room.imageUri }}
        style={styles.image}
      />

      <View style={styles.info}>
        <Text style={styles.type}>
          {room.roomType}
        </Text>

        <Text style={styles.description}>
          Your saved room
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
    height: 96,
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  image: {
    width: 76,
    height: 76,
    borderRadius: 11,
  },

  info: {
    flex: 1,
    marginLeft: 14,
  },

  type: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  description: {
    color: '#777777',
    fontSize: 12,
    marginTop: 5,
  },

  arrow: {
    color: '#FFFFFF',
    fontSize: 20,
    marginRight: 8,
  },
});