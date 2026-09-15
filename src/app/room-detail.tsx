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
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import BottomNavigation from '@/components/BottomNavigation';
import EmptyState from '@/components/EmptyState';
import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import {
  deleteGeneratedImage,
  getGeneratedImagesForRoom,
  GeneratedImage,
} from '@/services/generatedImages';
import {
  addRoomPhoto,
  analyzeRoom,
  deleteRoom,
  getRoomById,
  removeRoomPhoto,
  Room,
  setRoomPrimaryPhoto,
} from '@/services/rooms';
import { deleteUserItem, getUserItemsForRoom, UserItem } from '@/services/userItems';

export default function RoomDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ roomId?: string }>();
  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;

  const [room, setRoom] = React.useState<Room | null>(null);
  const [generatedImages, setGeneratedImages] = React.useState<GeneratedImage[]>([]);
  const [userItems, setUserItems] = React.useState<UserItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [analyzing, setAnalyzing] = React.useState(false);

  const loadData = React.useCallback(async () => {
    if (!roomId) {
      setLoading(false);
      return;
    }
    const [fetchedRoom, fetchedGenImages, fetchedItems] = await Promise.all([
      getRoomById(roomId),
      getGeneratedImagesForRoom(roomId),
      getUserItemsForRoom(roomId),
    ]);

    setRoom(fetchedRoom);
    setGeneratedImages(fetchedGenImages);
    setUserItems(fetchedItems);
    setLoading(false);
  }, [roomId]);

  // useFocusEffect (not a plain mount-only useEffect) so returning here —
  // e.g. after renaming a visualization, or saved-product/history name
  // changes elsewhere — always shows current data instead of whatever was
  // last rendered before navigating away.
  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [loadData])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading room details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!room) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ScreenHeader eyebrow="MY HOME" title="Room details" />
          <View style={styles.notFoundCard}>
            <Text style={styles.notFoundTitle}>Room not found</Text>
            <Text style={styles.notFoundSubtitle}>
              This room may have been removed or does not exist.
            </Text>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>BACK TO MY HOME</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const primaryPhoto = room.primaryImageUri || room.imageUris[0] || null;

  // Best-effort: re-analyzing after a new photo is added must never block
  // or fail the photo add itself, which has already succeeded by the time
  // this runs. Already-known items are not re-added (see
  // backend roomController.js#analyzeRoom), so this is safe to call after
  // every new photo.
  const analyzeAndRefreshItems = async () => {
    if (!roomId) return;
    setAnalyzing(true);
    try {
      const result = await analyzeRoom(roomId);
      if (result.items.length > 0) {
        setUserItems((prev) => [...result.items, ...prev]);
        Alert.alert(
          'Room analyzed',
          `${result.items.length} item${result.items.length === 1 ? '' : 's'} added to My Items.`
        );
      }
    } catch (error) {
      console.error('[room-detail] Room analysis failed:', error);
    }
    setAnalyzing(false);
  };

  const handleAddPhoto = () => {
    Alert.alert('Add Room Photo', 'Choose photo source', [
      {
        text: 'Camera',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permission needed', 'Camera permission required.');
            return;
          }
          const res = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.85,
          });
          if (!res.canceled && res.assets[0]) {
            const updated = await addRoomPhoto(room.id, res.assets[0].uri);
            if (updated) setRoom(updated);
            await analyzeAndRefreshItems();
          }
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permission needed', 'Photo library permission required.');
            return;
          }
          const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.85,
          });
          if (!res.canceled && res.assets[0]) {
            const updated = await addRoomPhoto(room.id, res.assets[0].uri);
            if (updated) setRoom(updated);
            await analyzeAndRefreshItems();
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSetPrimary = async (uri: string) => {
    const updated = await setRoomPrimaryPhoto(room.id, uri);
    if (updated) setRoom(updated);
  };

  const handleRemovePhoto = (uri: string) => {
    Alert.alert('Remove photo?', 'Remove this photo from the room?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const updated = await removeRoomPhoto(room.id, uri);
          if (updated) setRoom(updated);
        },
      },
    ]);
  };

  const handleDeleteGenImage = (genId: string) => {
    Alert.alert('Delete visualization?', 'Remove this generated image?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteGeneratedImage(genId);
          loadData();
        },
      },
    ]);
  };

  const openVisualization = (item: GeneratedImage) => {
    router.push({
      pathname: '/visualization-detail',
      params: {
        id: item.id,
        generatedImageUri: item.generatedImageUri ?? undefined,
        productImageUri: item.productImageUri ?? undefined,
        productName: item.productName ?? undefined,
        roomName: item.roomName ?? undefined,
        roomType: item.roomType ?? undefined,
        roomId: item.roomId,
        productCheckId: item.productCheckId ?? undefined,
        createdAt: item.createdAt,
      },
    });
  };

  const handleDeleteItem = (item: UserItem) => {
    Alert.alert('Remove item?', `Remove "${item.name}" from this room's items?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteUserItem(item.id);
          setUserItems((prev) => prev.filter((i) => i.id !== item.id));
        },
      },
    ]);
  };

  const handleDeleteRoom = () => {
    Alert.alert('Delete Room', `Are you sure you want to delete "${room.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRoom(room.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow="MY HOME" title={room.name} />

        {/* Primary Photo Banner */}
        <View style={styles.bannerContainer}>
          {primaryPhoto ? (
            <Image source={{ uri: primaryPhoto }} style={styles.bannerImage} />
          ) : (
            <View style={styles.bannerPlaceholder}>
              <Text style={styles.placeholderIcon}>🏠</Text>
              <Text style={styles.placeholderText}>No room photo yet</Text>
            </View>
          )}
          <View style={styles.bannerBadge}>
            <Text style={styles.bannerBadgeText}>{room.roomType}</Text>
          </View>
        </View>

        {/* Room Photos Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ROOM PHOTOS ({room.imageUris.length})</Text>
          <TouchableOpacity onPress={handleAddPhoto}>
            <Text style={styles.actionText}>+ ADD PHOTO</Text>
          </TouchableOpacity>
        </View>

        {room.imageUris.length === 0 ? (
          <EmptyState
            icon="📷"
            title="No room photos"
            description="Add photos of your room so we can visualize products accurately."
            actionLabel="TAKE FIRST PHOTO"
            onAction={handleAddPhoto}
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
            {room.imageUris.map((uri, idx) => {
              const isPrimary = uri === primaryPhoto;
              return (
                <View key={idx} style={styles.photoItem}>
                  <Image source={{ uri }} style={styles.photoThumb} />
                  {isPrimary ? (
                    <View style={styles.primaryBadge}>
                      <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.setPrimaryBtn}
                      onPress={() => handleSetPrimary(uri)}
                    >
                      <Text style={styles.setPrimaryBtnText}>SET PRIMARY</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.removePhotoBadge}
                    onPress={() => handleRemovePhoto(uri)}
                  >
                    <Text style={styles.removePhotoBadgeText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Generated Images Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            GENERATED VISUALIZATIONS ({generatedImages.length})
          </Text>
        </View>

        {generatedImages.length === 0 ? (
          <EmptyState
            icon="🎨"
            title="No visualizations yet"
            description="Check a product and generate it into this room to see visualizations here."
            actionLabel="CHECK A PRODUCT"
            onAction={() => router.push('/check-product')}
          />
        ) : (
          <View style={styles.genGrid}>
            {generatedImages.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.genCard}
                activeOpacity={0.85}
                onPress={() => openVisualization(item)}
              >
                <Image
                  source={{ uri: item.generatedImageUri ?? item.productImageUri ?? undefined }}
                  style={styles.genImage}
                />
                <View style={styles.genInfo}>
                  <Text style={styles.genProductName} numberOfLines={1}>
                    {item.productName}
                  </Text>
                  <Text style={styles.genDate}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.genDeleteBtn}
                  onPress={() => handleDeleteGenImage(item.id)}
                >
                  <Text style={styles.genDeleteBtnText}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Items detected in this room */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ITEMS DETECTED ({userItems.length})</Text>
        </View>

        {analyzing ? (
          <View style={styles.subtleInfoCard}>
            <Text style={styles.subtleInfoText}>Analyzing your room photo...</Text>
          </View>
        ) : userItems.length === 0 ? (
          <View style={styles.subtleInfoCard}>
            <Text style={styles.subtleInfoText}>
              No items detected in this room yet. Add a room photo and AI will look for recognizable furniture.
            </Text>
          </View>
        ) : (
          <View style={styles.itemsList}>
            {userItems.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemRowText}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemCategory}>{item.category}</Text>
                </View>
                <TouchableOpacity
                  style={styles.itemDeleteBtn}
                  onPress={() => handleDeleteItem(item)}
                >
                  <Text style={styles.itemDeleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Action Controls — visualization generation lives in the Check
            flow (Check Product → Product Captured → Generate Into My Room
            → Select Room), not duplicated here. */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.deleteRoomBtn}
            onPress={handleDeleteRoom}
            activeOpacity={0.85}
          >
            <Text style={styles.deleteRoomBtnText}>DELETE ROOM</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <BottomNavigation activeTab="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundElevated,
  },
  center: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  bannerContainer: {
    height: 220,
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 24,
    marginBottom: 24,
    position: 'relative',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface2,
  },
  placeholderIcon: {
    fontSize: 40,
  },
  placeholderText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 8,
  },
  bannerBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(11, 18, 32, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bannerBadgeText: {
    color: Colors.accentText,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  actionText: {
    color: Colors.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  photosScroll: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  photoItem: {
    width: 140,
    height: 140,
    borderRadius: 14,
    overflow: 'hidden',
    marginHorizontal: 4,
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
  primaryBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: Colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  primaryBadgeText: {
    color: Colors.cardHighlight,
    fontSize: 8,
    fontWeight: '700',
  },
  setPrimaryBtn: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(11, 18, 32, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  setPrimaryBtnText: {
    color: Colors.textSecondary,
    fontSize: 8,
    fontWeight: '600',
  },
  removePhotoBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(224, 82, 82, 0.85)',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  genGrid: {
    gap: 10,
  },
  genCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    gap: 12,
  },
  genImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
  },
  genInfo: {
    flex: 1,
  },
  genProductName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  genDate: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  genDeleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genDeleteBtnText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  subtleInfoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  subtleInfoText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  itemsList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  itemRowText: {
    flex: 1,
  },
  itemName: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
  itemCategory: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  itemDeleteBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  itemDeleteBtnText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  actionsContainer: {
    marginTop: 32,
    gap: 12,
  },
  deleteRoomBtn: {
    height: 52,
    backgroundColor: Colors.dangerDim,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteRoomBtnText: {
    color: Colors.dangerText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  notFoundCard: {
    backgroundColor: Colors.surface,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    marginTop: 40,
    width: '100%',
  },
  notFoundTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  notFoundSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  backBtn: {
    marginTop: 18,
    backgroundColor: Colors.cardHighlight,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  backBtnText: {
    color: Colors.cardHighlightText,
    fontSize: 11,
    fontWeight: '700',
  },
});
