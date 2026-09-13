import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

import { getProductById } from '@/services/products';

export default function ProductInfo() {
  const router = useRouter();

  const { productId } =
    useLocalSearchParams<{
      productId: string;
    }>();

  const product =
    getProductById(productId || '1');

  if (!product) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backArrow}>
            ←
          </Text>
        </TouchableOpacity>

        <Text style={styles.brand}>
          {product.brand}
        </Text>

        <Text style={styles.title}>
          {product.name}
        </Text>

        <View style={styles.priceCard}>
          <Text style={styles.price}>
            €{product.price.toFixed(2)}
          </Text>

          <Text style={styles.store}>
            Available at {product.store}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>
            CATEGORY
          </Text>

          <Text style={styles.value}>
            {product.category}
          </Text>

          <Text style={styles.label}>
            RATING
          </Text>

          <Text style={styles.value}>
            ★ {product.rating}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            router.push({
              pathname: '/comparison',
              params: {
                productId: product.id,
              },
            })
          }
        >
          <Text style={styles.buttonText}>
            COMPARE
          </Text>
        </TouchableOpacity>
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

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },

  backArrow: {
    color: '#FFFFFF',
    fontSize: 20,
  },

  brand: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 8,
  },

  priceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    marginTop: 28,
  },

  price: {
    color: '#111111',
    fontSize: 30,
    fontWeight: '700',
  },

  store: {
    color: '#666666',
    fontSize: 12,
    marginTop: 7,
  },

  card: {
    backgroundColor: '#181818',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 20,
    marginTop: 14,
  },

  label: {
    color: '#777777',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 8,
  },

  value: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 12,
  },

  button: {
    height: 56,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },

  buttonText: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});