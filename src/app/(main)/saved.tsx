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

import {
  deleteSavedProduct,
  getSavedProducts,
  SavedProduct,
} from '@/services/savedProducts';

export default function Saved() {
  const router = useRouter();

  const [products, setProducts] = React.useState<SavedProduct[]>(
    []
  );

  const loadProducts = async () => {
    const savedProducts = await getSavedProducts();

    setProducts(savedProducts);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadProducts();
    }, [])
  );

  const handleDelete = (product: SavedProduct) => {
    Alert.alert(
      'Remove product?',
      `Remove "${product.name}" from your saved products?`,
      [
        {
          text: 'CANCEL',
          style: 'cancel',
        },
        {
          text: 'REMOVE',
          style: 'destructive',
          onPress: async () => {
            await deleteSavedProduct(product.id);

            loadProducts();
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
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>
              YOUR PRODUCTS
            </Text>

            <Text style={styles.headerTitle}>
              Saved
            </Text>
          </View>

          <Text style={styles.count}>
            {products.length} SAVED
          </Text>
        </View>

        <View style={styles.intro}>
          <Text style={styles.title}>
            Keep what matters.
          </Text>

          <Text style={styles.subtitle}>
            Products you save will stay here so you can
            come back to them later.
          </Text>
        </View>

        {products.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>
                ♡
              </Text>
            </View>

            <Text style={styles.emptyTitle}>
              Nothing saved yet
            </Text>

            <Text style={styles.emptyDescription}>
              When you find a product you want to remember,
              save it and it will appear here.
            </Text>

            <TouchableOpacity
              style={styles.checkButton}
              onPress={() => router.push('/check-product')}
              activeOpacity={0.85}
            >
              <Text style={styles.checkButtonText}>
                CHECK A PRODUCT
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.productList}>
            {products.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={styles.productCard}
                activeOpacity={0.85}
                onPress={() => openProduct(product)}
              >
                <Image
                  source={{ uri: product.imageUri }}
                  style={styles.productImage}
                />

                <View style={styles.productInfo}>
                  <Text
                    style={styles.productName}
                    numberOfLines={2}
                  >
                    {product.name}
                  </Text>

                  <Text style={styles.productLabel}>
                    SAVED PRODUCT
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(product)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.deleteText}>
                    ×
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {products.length > 0 && (
          <TouchableOpacity
            style={styles.addMoreButton}
            onPress={() => router.push('/check-product')}
            activeOpacity={0.85}
          >
            <Text style={styles.addMoreText}>
              + CHECK ANOTHER PRODUCT
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <BottomNavigation activeTab="saved" />
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

  eyebrow: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },

  count: {
    color: '#555555',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
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

  emptyCard: {
    backgroundColor: '#181818',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 24,
    alignItems: 'center',
  },

  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },

  emptyIconText: {
    color: '#FFFFFF',
    fontSize: 28,
  },

  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },

  emptyDescription: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 300,
  },

  checkButton: {
    height: 48,
    paddingHorizontal: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },

  checkButtonText: {
    color: '#111111',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  productList: {
    gap: 12,
  },

  productCard: {
    minHeight: 110,
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  productImage: {
    width: 90,
    height: 90,
    borderRadius: 12,
    backgroundColor: '#222222',
  },

  productInfo: {
    flex: 1,
    marginLeft: 14,
    paddingRight: 8,
  },

  productName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
  },

  productLabel: {
    color: '#666666',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 8,
  },

  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
  },

  deleteText: {
    color: '#888888',
    fontSize: 22,
    fontWeight: '300',
    marginTop: -2,
  },

  addMoreButton: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    backgroundColor: '#181818',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },

  addMoreText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
});