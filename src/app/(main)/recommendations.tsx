import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import BottomNavigation from '@/components/BottomNavigation';
import ProductCard from '@/components/ProductCard';
import { products } from '@/services/products';

export default function Recommendations() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.eyebrow}>
          FOR YOU
        </Text>

        <Text style={styles.title}>
          Recommendations.
        </Text>

        <Text style={styles.subtitle}>
          Products that could fit your preferences and
          home.
        </Text>

        <View style={styles.list}>
          {products.slice(0, 3).map((product) => (
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
          ))}
        </View>
      </ScrollView>

      <BottomNavigation activeTab="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },

  content: {
    padding: 20,
    paddingBottom: 120,
  },

  eyebrow: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 20,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 7,
  },

  subtitle: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 28,
  },

  list: {
    gap: 2,
  },
});