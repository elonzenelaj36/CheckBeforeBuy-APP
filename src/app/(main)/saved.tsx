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

import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import BottomNavigation from '@/components/BottomNavigation';
import EmptyState from '@/components/EmptyState';
import { Colors } from '@/constants/colors';
import {
  deleteSavedProduct,
  getSavedProducts,
  SavedProduct,
} from '@/services/savedProducts';

export default function Saved() {
  const router = useRouter();
  const [products, setProducts] = React.useState<SavedProduct[]>([]);

  const loadData = async () => {
    const savedProducts = await getSavedProducts();
    setProducts(savedProducts);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const handleDeleteProduct = (product: SavedProduct) => {
    Alert.alert(
      'Remove product?',
      `Remove "${product.name}" from your saved products?`,
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: 'REMOVE',
          style: 'destructive',
          onPress: async () => {
            await deleteSavedProduct(product.id);
            loadData();
          },
        },
      ]
    );
  };

  const openProduct = (product: SavedProduct) => {
    router.push({
      pathname: '/product-captured',
      params: {
        imageUri: product.imageUri,
        productName: product.name,
        // Carries this saved product back to the same underlying check (when
        // it has one) so editing its name updates the existing record
        // instead of creating an unrelated duplicate.
        ...(product.productCheckId ? { productCheckId: product.productCheckId } : {}),
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
          <View style={styles.headerTitleRow}>
            <View style={styles.heartBadge}>
              <Text style={styles.heartBadgeIcon}>♡</Text>
            </View>

            <View>
              <Text style={styles.eyebrow}>YOUR COLLECTION</Text>
              <Text style={styles.headerTitle}>Saved</Text>
            </View>
          </View>

          <Text style={styles.count}>{products.length} PRODUCTS</Text>
        </View>

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.title}>Keep what matters.</Text>

          <Text style={styles.subtitle}>
            Products you save will stay here so you can review them anytime. Room visualizations now live inside
            My Home → each room.
          </Text>
        </View>

        {/* Saved Products */}
        {products.length === 0 ? (
          <EmptyState
            icon="♡"
            title="Nothing saved yet"
            description="When you find a product you want to remember, save it and it will appear here."
            actionLabel="CHECK A PRODUCT"
            onAction={() => router.push('/check-product')}
          />
        ) : (
          <View style={styles.productList}>
            {products.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={styles.productCard}
                activeOpacity={0.88}
                onPress={() => openProduct(product)}
              >
                <View style={styles.imageFrame}>
                  <Image source={{ uri: product.imageUri ?? undefined }} style={styles.productImage} />
                </View>

                <View style={styles.productInfo}>
                  <Text style={styles.productName} numberOfLines={2}>
                    {product.name}
                  </Text>
                  <Text style={styles.productLabel}>SAVED PRODUCT</Text>
                </View>

                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteProduct(product)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.deleteText}>×</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.addMoreButton}
          onPress={() => router.push('/check-product')}
          activeOpacity={0.85}
        >
          <Text style={styles.addMoreText}>+ CHECK ANOTHER PRODUCT</Text>
        </TouchableOpacity>
      </ScrollView>

      <BottomNavigation activeTab="saved" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.savedBackground,
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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heartBadge: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: Colors.savedAccentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartBadgeIcon: {
    color: Colors.savedAccentText,
    fontSize: 17,
  },
  eyebrow: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 25,
    fontWeight: '800',
    marginTop: 3,
  },
  count: {
    color: Colors.savedAccentText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  intro: {
    marginTop: 30,
    marginBottom: 26,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  productList: {
    gap: 14,
  },
  productCard: {
    minHeight: 100,
    backgroundColor: 'rgba(40, 55, 90, 0.55)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(172, 163, 242, 0.20)',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: Colors.savedAccent,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 2,
  },
  imageFrame: {
    padding: 2,
    borderRadius: 16,
    backgroundColor: 'rgba(172, 163, 242, 0.18)',
  },
  productImage: {
    width: 78,
    height: 78,
    borderRadius: 14,
    backgroundColor: Colors.savedSurfaceRaised,
  },
  productInfo: {
    flex: 1,
    marginLeft: 14,
    paddingRight: 8,
  },
  productName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  productLabel: {
    color: Colors.savedAccentText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 6,
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.savedSurfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: Colors.textMuted,
    fontSize: 20,
    fontWeight: '300',
  },
  addMoreButton: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.savedBorder,
    backgroundColor: Colors.savedSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  addMoreText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
