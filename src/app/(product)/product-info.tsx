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

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow={product.brand} title={product.name} />

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
          activeOpacity={0.85}
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
    backgroundColor: Colors.lightBackground,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  priceCard: {
    backgroundColor: Colors.cardHighlight,
    borderRadius: 20,
    padding: 22,
    marginTop: 28,
  },

  price: {
    color: Colors.cardHighlightText,
    fontSize: 30,
    fontWeight: '700',
  },

  store: {
    color: Colors.cardHighlightTextMuted,
    fontSize: 12,
    marginTop: 7,
  },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    marginTop: 14,
  },

  label: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 8,
  },

  value: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 12,
  },

  button: {
    height: 56,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },

  buttonText: {
    color: Colors.cardHighlight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
