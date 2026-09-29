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
import RoomSpatialHero from '@/components/spatial/RoomSpatialHero';
import { deleteRoomCapture, isSpatialRoom } from '@/services/roomCaptures';
import ItemHighlight from '@/components/ItemHighlight';
import { deleteUserItem, getUserItemsForRoom, UserItem } from '@/services/userItems';

/** A spatial room's main visual is taller than a photo banner: the capture is portrait and it IS the room. */
const SPATIAL_BANNER_HEIGHT = 360;

export default function RoomDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ roomId?: string }>();
  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;

  const [room, setRoom] = React.useState<Room | null>(null);
  const [generatedImages, setGeneratedImages] = React.useState<GeneratedImage[]>([]);
  const [userItems, setUserItems] = React.useState<UserItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [heroWidth, setHeroWidth] = React.useState(0);
  /** Items Detected: the item outlined on the room (selection only — nothing moves). */
  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);
  const [detectError, setDetectError] = React.useState<string | null>(null);
  const [bannerSize, setBannerSize] = React.useState({ width: 0, height: 0 });
  const [photoAspect, setPhotoAspect] = React.useState<{ uri: string; aspect: number } | null>(null);
  const scrollRef = React.useRef<ScrollView>(null);

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

  // Items Detected selection → which sighting to outline on the room.
  const selectedItem = userItems.find((i) => i.id === selectedItemId) ?? null;
  const selectedObs = selectedItem?.observations?.[0] ?? null;
  // Photo room: show the photo the item was seen on (normally the primary photo).
  const bannerPhoto =
    (room && !isSpatialRoom(room) && selectedObs?.photoId
      ? room.photos.find((p) => p.id === selectedObs.photoId)?.imageUri
      : null) ??
    room?.primaryImageUri ??
    room?.imageUris[0] ??
    null;
  // The outline needs the photo's real shape (the banner crops it to fill).
  React.useEffect(() => {
    if (!bannerPhoto) return;
    let cancelled = false;
    Image.getSize(
      bannerPhoto,
      (w, h) => !cancelled && w > 0 && h > 0 && setPhotoAspect({ uri: bannerPhoto, aspect: w / h }),
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [bannerPhoto]);

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

  const selectItem = (item: UserItem) => {
    if (!item.observations?.length) return; // manual items have no location to show
    setSelectedItemId((cur) => (cur === item.id ? null : item.id));
    scrollRef.current?.scrollTo({ y: 0, animated: true }); // the outline is on the room at the top
  };

  // Best-effort: re-analyzing after a new photo is added must never block
  // or fail the photo add itself, which has already succeeded by the time
  // this runs. Already-known items are not re-added (see
  // backend roomController.js#analyzeRoom), so this is safe to call after
  // every new photo.
  const analyzeAndRefreshItems = async () => {
    if (!roomId) return;
    setAnalyzing(true);
    setDetectError(null);
    setSelectedItemId(null);
    try {
      await analyzeRoom(roomId);
      // Detection replaces this room's previous AI items — reload the list as stored.
      setUserItems(await getUserItemsForRoom(roomId));
    } catch (error: any) {
      console.error('[room-detail] Room analysis failed:', error);
      // The room itself is unaffected; only the detection didn't work.
      setDetectError(error?.message ?? "We couldn't detect furniture in this room.");
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

  const openRoomCapture = () => router.push({ pathname: '/room-capture', params: { roomId: room.id } });

  const handleDeleteCapture = () => {
    const capture = room.capture;
    if (!capture) return;
    Alert.alert('Remove room views?', 'This removes the captured views. Your room photos are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRoomCapture(room.id, capture.id);
            loadData();
          } catch (error: any) {
            Alert.alert("Couldn't remove the views", error?.message ?? 'Please try again.');
          }
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
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow="MY HOME" title={room.name} />

        {/* Main visual: a spatial room is its swipeable 180°/360° capture; a photo room its primary photo. */}
        {isSpatialRoom(room) ? (
          <View style={styles.bannerOuter}>
            <View
              style={[styles.bannerContainer, styles.spatialBanner]}
              onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width - 2)}
            >
              {heroWidth > 0 && (
                <RoomSpatialHero
                  roomId={room.id}
                  capture={room.capture!}
                  selectedItem={
                    selectedItem && selectedObs?.frameId
                      ? { id: selectedItem.id, name: selectedItem.name, observation: selectedObs }
                      : null
                  }
                  width={heroWidth}
                  height={SPATIAL_BANNER_HEIGHT - 2}
                  onTap={() => router.push({ pathname: '/room-view', params: { roomId: room.id } })}
                >
                  <View style={styles.bannerScrim} />
                  <View style={styles.bannerBadge}>
                    <Text style={styles.bannerBadgeText}>
                      {room.capture!.mode}° ROOM · SWIPE TO LOOK AROUND
                    </Text>
                  </View>
                </RoomSpatialHero>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.bannerOuter}>
            <View
              style={styles.bannerContainer}
              onLayout={(e) => setBannerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            >
              {primaryPhoto ? (
                <Image source={{ uri: bannerPhoto ?? primaryPhoto }} style={styles.bannerImage} />
              ) : (
                <View style={styles.bannerPlaceholder}>
                  <Text style={styles.placeholderIcon}>🏠</Text>
                  <Text style={styles.placeholderText}>No room photo yet</Text>
                </View>
              )}

              <View style={styles.bannerScrim} pointerEvents="none" />

              {selectedItem && selectedObs?.photoId && photoAspect?.uri === bannerPhoto && (
                <ItemHighlight
                  box={selectedObs.box}
                  containerWidth={bannerSize.width}
                  containerHeight={bannerSize.height}
                  imageAspect={photoAspect.aspect}
                  label={selectedItem.name}
                />
              )}

              <View style={styles.bannerBadge}>
                <Text style={styles.bannerBadgeText}>{room.roomType}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Room name — the strongest text on this screen */}
        <View style={styles.roomNameBlock}>
          <Text style={styles.roomNameTitle}>{room.name}</Text>
          <Text style={styles.roomNameType}>{room.roomType}</Text>
        </View>

        {/* Room Photos Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ROOM PHOTOS ({room.imageUris.length})</Text>
          <TouchableOpacity onPress={handleAddPhoto}>
            <Text style={styles.actionText}>+ ADD PHOTO</Text>
          </TouchableOpacity>
        </View>

        {room.imageUris.length === 0 && isSpatialRoom(room) ? (
          // A spatial room already shows the room above — photos are optional extras here.
          <TouchableOpacity style={styles.subtleInfoCard} onPress={handleAddPhoto} activeOpacity={0.85}>
            <Text style={styles.subtleInfoText}>Optional: add still photos of this room.</Text>
          </TouchableOpacity>
        ) : room.imageUris.length === 0 ? (
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

        {/* Room Views — optional 180°/360° capture; the photos above stay as they are. */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ROOM VIEWS</Text>
          <TouchableOpacity onPress={openRoomCapture}>
            <Text style={styles.actionText}>{room.capture ? 'RECAPTURE' : '+ CAPTURE'}</Text>
          </TouchableOpacity>
        </View>

        {room.capture ? (
          <TouchableOpacity
            style={styles.captureCard}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/room-view', params: { roomId: room.id } })}
          >
            {room.capture.coverImageUri ? (
              <Image source={{ uri: room.capture.coverImageUri }} style={styles.captureThumb} />
            ) : (
              <View style={styles.captureThumb} />
            )}
            <View style={styles.captureInfo}>
              <Text style={styles.captureTitle}>
                {room.capture.mode}° capture · {room.capture.frameCount} views
              </Text>
              <Text style={styles.captureMeta}>
                {room.capture.selectedView
                  ? `Products use the view at ≈${Math.round(room.capture.selectedView.angleDeg)}°`
                  : 'Products use the original room photo'}
                {room.capture.angleSource === 'time' ? ' · angles estimated' : ''}
              </Text>
              <Text style={styles.captureOpen}>OPEN VIEWER ›</Text>
            </View>
            <TouchableOpacity style={styles.captureDelete} onPress={handleDeleteCapture}>
              <Text style={styles.removePhotoBadgeText}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.subtleInfoCard} onPress={openRoomCapture} activeOpacity={0.85}>
            <Text style={styles.subtleInfoText}>
              Optional: record a slow 180° or 360° turn to swipe around this room and pick the best view for your
              products.
            </Text>
            <Text style={styles.captureOpen}>CAPTURE ROOM VIEWS ›</Text>
          </TouchableOpacity>
        )}

        {/* Generated Images Section — creative / visual treatment */}
        <View style={styles.vizSectionCard}>
          <View style={styles.vizSectionHeader}>
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
                  <View style={styles.genImageFrame}>
                    <Image
                      source={{ uri: item.generatedImageUri ?? item.productImageUri ?? undefined }}
                      style={styles.genImage}
                    />
                  </View>
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
        </View>

        {/* Items detected in this room — clean / structured treatment. Tap an
            item to outline it on the room above (selection only; nothing moves). */}
        <View style={styles.itemsSectionCard}>
          <View style={styles.itemsSectionHeader}>
            <Text style={[styles.sectionTitle, { color: Colors.textMuted }]}>ITEMS DETECTED ({userItems.length})</Text>
            {(isSpatialRoom(room) || room.imageUris.length > 0) && (
              <TouchableOpacity onPress={analyzeAndRefreshItems} disabled={analyzing}>
                <Text style={styles.detectAction}>
                  {analyzing ? 'DETECTING…' : userItems.some((i) => i.source === 'ai') ? 'DETECT AGAIN' : 'DETECT ITEMS'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {analyzing ? (
            <View style={styles.subtleInfoCard}>
              <Text style={styles.subtleInfoText}>
                {isSpatialRoom(room)
                  ? 'Looking for furniture across your room views… this can take a minute.'
                  : 'Looking for furniture in your room photo…'}
              </Text>
            </View>
          ) : detectError ? (
            <View style={styles.subtleInfoCard}>
              <Text style={styles.subtleInfoText}>
                We couldn&apos;t detect furniture in this room. Your room is fine — tap DETECT ITEMS to try again.
              </Text>
            </View>
          ) : userItems.length === 0 ? (
            <View style={styles.subtleInfoCard}>
              <Text style={styles.subtleInfoText}>
                {isSpatialRoom(room) || room.imageUris.length > 0
                  ? 'No items detected yet. Tap DETECT ITEMS to find the furniture in this room.'
                  : 'No items detected in this room yet. Add a room photo and AI will look for recognizable furniture.'}
              </Text>
            </View>
          ) : (
            <View style={styles.itemsList}>
              {userItems.map((item) => {
                const selected = item.id === selectedItemId;
                const views = item.observations?.length ?? 0;
                const details = [
                  item.category,
                  item.source === 'ai' ? 'Detected automatically' : 'Added by you',
                  views > 1 ? `seen in ${views} views` : null,
                  item.confidence != null ? `${Math.round(item.confidence * 100)}%` : null,
                ].filter(Boolean);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.itemRow, selected && styles.itemRowSelected]}
                    onPress={() => selectItem(item)}
                    activeOpacity={views > 0 ? 0.8 : 1}
                    accessibilityState={{ selected }}
                  >
                    <View style={styles.itemRowText}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemCategory}>{details.join(' · ')}</Text>
                    </View>
                    {selected && <Text style={styles.itemShown}>SHOWN ABOVE</Text>}
                    <TouchableOpacity
                      style={styles.itemDeleteBtn}
                      onPress={() => handleDeleteItem(item)}
                    >
                      <Text style={styles.itemDeleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

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
    backgroundColor: Colors.lightBackground,
  },
  center: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.lightTextSecondary,
    fontSize: 14,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  bannerOuter: {
    marginTop: 24,
    marginBottom: 22,
    borderRadius: 26,
    padding: 2,
    backgroundColor: 'rgba(94, 214, 196, 0.28)',
    shadowColor: Colors.myHomeAccent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 6,
  },
  bannerContainer: {
    height: 230,
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: Colors.myHomeSurface,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
  },
  spatialBanner: {
    height: SPATIAL_BANNER_HEIGHT,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.myHomeSurfaceRaised,
  },
  placeholderIcon: {
    fontSize: 40,
  },
  placeholderText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 8,
  },
  bannerScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: 'rgba(13, 27, 44, 0.4)',
  },
  bannerBadge: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    backgroundColor: 'rgba(13, 27, 44, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(166, 237, 224, 0.3)',
  },
  bannerBadgeText: {
    color: Colors.myHomeAccentText,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  roomNameBlock: {
    marginBottom: 22,
  },
  roomNameTitle: {
    color: Colors.lightTextPrimary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  roomNameType: {
    color: Colors.lightMyHomeAccentText,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    color: Colors.lightTextSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  actionText: {
    color: Colors.lightMyHomeAccentText,
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
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: 4,
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
    backgroundColor: Colors.myHomeSurface,
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
  primaryBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: Colors.myHomeAccent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  primaryBadgeText: {
    color: Colors.textInverse,
    fontSize: 8,
    fontWeight: '700',
  },
  setPrimaryBtn: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(13, 27, 44, 0.85)',
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
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  /* Generated Visualizations — creative / visual: aqua-tinted glass panel,
     softer/larger radius, gentle glow. */
  vizSectionCard: {
    marginTop: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(94, 214, 196, 0.25)',
    backgroundColor: 'rgba(94, 214, 196, 0.06)',
    padding: 14,
    shadowColor: Colors.myHomeAccent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 4,
  },
  vizSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  genGrid: {
    gap: 10,
  },
  genCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.myHomeSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
    padding: 10,
    gap: 12,
  },
  genImageFrame: {
    padding: 2,
    borderRadius: 14,
    backgroundColor: 'rgba(94, 214, 196, 0.18)',
  },
  genImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: Colors.myHomeSurfaceRaised,
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
    backgroundColor: Colors.myHomeSurfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genDeleteBtnText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  captureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.myHomeSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
    padding: 10,
  },
  captureThumb: {
    width: 64,
    height: 86,
    borderRadius: 10,
    backgroundColor: Colors.myHomeSurfaceRaised,
  },
  captureInfo: {
    flex: 1,
    gap: 4,
  },
  captureTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  captureMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  captureOpen: {
    color: Colors.myHomeAccent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 6,
  },
  captureDelete: {
    alignSelf: 'flex-start',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.myHomeSurfaceRaised,
  },
  subtleInfoCard: {
    backgroundColor: Colors.myHomeSurfaceRaised,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
    padding: 14,
  },
  subtleInfoText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  /* Items Detected — clean / structured: neutral blue-gray panel, sharper
     radius, no glow. */
  itemsSectionCard: {
    marginTop: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
    backgroundColor: Colors.myHomeSurface,
    padding: 14,
  },
  itemsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  detectAction: {
    color: Colors.myHomeAccent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  itemRowSelected: {
    borderColor: Colors.myHomeAccent,
    backgroundColor: 'rgba(94, 214, 196, 0.12)',
  },
  itemShown: {
    color: Colors.myHomeAccent,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginRight: 10,
  },
  itemsList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.myHomeSurfaceRaised,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
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
    backgroundColor: Colors.myHomeSurfaceRaised,
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
    backgroundColor: Colors.myHomeSurface,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.myHomeBorder,
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
    backgroundColor: Colors.myHomeAccent,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  backBtnText: {
    color: Colors.textInverse,
    fontSize: 11,
    fontWeight: '700',
  },
});
