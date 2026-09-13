import AsyncStorage from '@react-native-async-storage/async-storage';

const ROOMS_KEY = '@check_before_buy_rooms';

export type SavedRoom = {
  id: string;
  roomType: string;
  imageUri: string;
  createdAt: string;
};

export async function getRooms(): Promise<SavedRoom[]> {
  try {
    const data = await AsyncStorage.getItem(ROOMS_KEY);

    if (!data) {
      return [];
    }

    return JSON.parse(data);
  } catch (error) {
    console.log('Failed to load rooms:', error);
    return [];
  }
}

export async function saveRoom(
  room: SavedRoom
): Promise<void> {
  try {
    const rooms = await getRooms();

    const updatedRooms = [...rooms, room];

    await AsyncStorage.setItem(
      ROOMS_KEY,
      JSON.stringify(updatedRooms)
    );
  } catch (error) {
    console.log('Failed to save room:', error);
  }
}

export async function deleteRoom(
  roomId: string
): Promise<void> {
  try {
    const rooms = await getRooms();

    const updatedRooms = rooms.filter(
      (room) => room.id !== roomId
    );

    await AsyncStorage.setItem(
      ROOMS_KEY,
      JSON.stringify(updatedRooms)
    );
  } catch (error) {
    console.log('Failed to delete room:', error);
  }
}