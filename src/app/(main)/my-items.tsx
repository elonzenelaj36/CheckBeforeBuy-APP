import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import BottomNavigation from '@/components/BottomNavigation';
import EmptyState from '@/components/EmptyState';
import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { getRooms, Room } from '@/services/rooms';
import { deleteUserItem, getUserItems, UserItem } from '@/services/userItems';

type ItemGroup = {
  key: string;
  roomName: string;
  items: UserItem[];
};

function groupByRoom(items: UserItem[], rooms: Room[]): ItemGroup[] {
  const roomNameById = new Map(rooms.map((r) => [r.id, r.name]));
  const groups = new Map<string, ItemGroup>();

  for (const item of items) {
    const key = item.roomId ?? '__unassigned__';
    const roomName = item.roomId ? roomNameById.get(item.roomId) ?? 'Unknown room' : 'Not linked to a room';

    if (!groups.has(key)) {
      groups.set(key, { key, roomName, items: [] });
    }
    groups.get(key)!.items.push(item);
  }

  return Array.from(groups.values());
}

export default function MyItems() {
  const router = useRouter();
  const [items, setItems] = React.useState<UserItem[]>([]);
  const [rooms, setRooms] = React.useState<Room[]>([]);

  const loadItems = async () => {
    const [fetchedItems, fetchedRooms] = await Promise.all([getUserItems(), getRooms()]);
    setItems(fetchedItems);
    setRooms(fetchedRooms);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadItems();
    }, [])
  );

  const handleDelete = (item: UserItem) => {
    Alert.alert('Remove Item', `Remove "${item.name}" from My Items?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteUserItem(item.id);
          loadItems();
        },
      },
    ]);
  };

  const groups = groupByRoom(items, rooms);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader eyebrow="YOUR BELONGINGS" title="My Items" />

        <View style={styles.intro}>
          <Text style={styles.title}>Items detected from your rooms.</Text>
          <Text style={styles.subtitle}>
            When you add a room and its photos, AI looks for recognizable furniture and objects so Check Before Buy
            can avoid recommending things you already own.
          </Text>
        </View>

        {items.length === 0 ? (
          <EmptyState
            icon="🛋️"
            title="No items detected yet"
            description="Add a room with a photo in My Home — AI will detect furniture and other objects automatically."
            actionLabel="GO TO MY HOME"
            onAction={() => router.push('/my-home')}
          />
        ) : (
          <View style={styles.groupList}>
            {groups.map((group) => (
              <View key={group.key} style={styles.group}>
                <Text style={styles.groupTitle}>{group.roomName.toUpperCase()}</Text>

                <View style={styles.itemList}>
                  {group.items.map((item) => (
                    <View key={item.id} style={styles.itemCard}>
                      <View style={styles.itemIcon}>
                        <Text style={styles.itemIconText}>📦</Text>
                      </View>

                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemMeta}>{item.category}</Text>
                        {item.description ? (
                          <Text style={styles.itemDescription} numberOfLines={2}>
                            {item.description}
                          </Text>
                        ) : null}
                      </View>

                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                        <Text style={styles.deleteBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <BottomNavigation activeTab="profile" />
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
    lineHeight: 20,
    marginTop: 8,
  },
  groupList: {
    gap: 24,
  },
  group: {
    gap: 10,
  },
  groupTitle: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  itemList: {
    gap: 10,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 12,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconText: {
    fontSize: 20,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  itemMeta: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  itemDescription: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 15,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});
