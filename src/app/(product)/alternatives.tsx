import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ProductCard from '@/components/ProductCard';
import { products } from '@/services/products';

export default function Alternatives() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
      >
        <Text style={styles.eyebrow}>
          SMARTER OPTIONS
        </Text>

        <Text style={styles.title}>
          Better alternatives.
        </Text>

        <Text style={styles.subtitle}>
          Similar products that may offer better value.
        </Text>

        <View style={styles.list}>
          {products.slice(1, 4).map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onPress={() =>
                router.push({
                  pathname: '/product-info',
                  params: {
                    productId: product.id,
                  },
                })
              }
            />
          ))}
        </View>
      </ScrollView>
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
    paddingBottom: 40,
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
    marginTop: 10,
    marginBottom: 28,
  },

  list: {
    gap: 2,
  },
});