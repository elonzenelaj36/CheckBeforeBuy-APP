import React from 'react';

import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import BottomNavigation from '@/components/BottomNavigation';
import ProductCard from '@/components/ProductCard';
import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { products } from '@/services/products';

export default function Search() {
  const router = useRouter();

  const [query, setQuery] = React.useState('');

  const filteredProducts = products.filter(
    (product) =>
      product.name
        .toLowerCase()
        .includes(query.toLowerCase()) ||
      product.brand
        .toLowerCase()
        .includes(query.toLowerCase()) ||
      product.category
        .toLowerCase()
        .includes(query.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow="EXPLORE" title="Search products" />

        <TextInput
          style={styles.searchInput}
          placeholder="Search furniture, electronics..."
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />

        <Text style={styles.sectionTitle}>
          {query
            ? `${filteredProducts.length} RESULTS`
            : 'POPULAR PRODUCTS'}
        </Text>

        {filteredProducts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              Nothing found
            </Text>

            <Text style={styles.emptyText}>
              Try searching for another product or
              category.
            </Text>
          </View>
        ) : (
          filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onPress={() =>
                router.push({
                  pathname: '/check-product',
                  params: {
                    productId: product.id,
                  },
                })
              }
            />
          ))
        )}
      </ScrollView>

      <BottomNavigation activeTab="home" />
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

  searchInput: {
    height: 56,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 15,
    paddingHorizontal: 17,
    color: Colors.textPrimary,
    fontSize: 14,
    marginTop: 20,
    marginBottom: 28,
  },

  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 14,
  },

  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 22,
  },

  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  emptyText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },
});