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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow="COMPARISON" title="Is it right for you?" />

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
            isLast
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
          activeOpacity={0.85}
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
  isLast,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
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
    backgroundColor: Colors.background,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  table: {
    marginTop: 28,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },

  row: {
    minHeight: 58,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  rowLast: {
    borderBottomWidth: 0,
  },

  rowLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
  },

  rowValue: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
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
