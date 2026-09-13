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

export default function Comparison() {
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

        <Text style={styles.eyebrow}>
          COMPARISON
        </Text>

        <Text style={styles.title}>
          Is it right for you?
        </Text>

        <View style={styles.table}>
          <Row
            label="Price"
            value={`€${product.price.toFixed(2)}`}
          />

          <Row
            label="Rating"
            value={`★ ${product.rating}`}
          />

          <Row
            label="Category"
            value={product.category}
          />

          <Row
            label="Store"
            value={product.store}
          />

          <Row
            label="Style"
            value="Modern"
          />

          <Row
            label="Value"
            value="Excellent"
          />
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            router.push({
              pathname: '/decision',
              params: {
                productId,
              },
            })
          }
        >
          <Text style={styles.buttonText}>
            SEE OUR DECISION
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>
        {label}
      </Text>

      <Text style={styles.rowValue}>
        {value}
      </Text>
    </View>
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
    marginBottom: 30,
  },

  backArrow: {
    color: '#FFFFFF',
    fontSize: 20,
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
    marginTop: 7,
    marginBottom: 28,
  },

  table: {
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    overflow: 'hidden',
  },

  row: {
    minHeight: 62,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D2D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  rowLabel: {
    color: '#777777',
    fontSize: 13,
  },

  rowValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
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