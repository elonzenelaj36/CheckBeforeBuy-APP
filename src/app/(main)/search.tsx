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
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>
              EXPLORE
            </Text>

            <Text style={styles.title}>
              Search products.
            </Text>
          </View>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Search furniture, electronics..."
          placeholderTextColor="#666666"
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

      <BottomNavigation activeTab="search" />
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
    marginBottom: 28,
  },

  eyebrow: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 6,
  },

  searchInput: {
    height: 56,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    borderRadius: 15,
    paddingHorizontal: 17,
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 28,
  },

  sectionTitle: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 14,
  },

  emptyCard: {
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 22,
  },

  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  emptyText: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },
});