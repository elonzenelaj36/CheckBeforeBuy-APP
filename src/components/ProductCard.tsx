import {
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import { Colors } from '@/constants/colors';

export type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  store: string;
  image: string;
  rating: number;
};

type ProductCardProps = {
  product: Product;
  onPress: () => void;
};

export default function ProductCard({
  product,
  onPress,
}: ProductCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Image
        source={{ uri: product.image }}
        style={styles.image}
      />

      <View style={styles.info}>
        <Text style={styles.brand}>
          {product.brand}
        </Text>

        <Text style={styles.name}>
          {product.name}
        </Text>

        <Text style={styles.store}>
          {product.store}
        </Text>

        <View style={styles.bottom}>
          <Text style={styles.price}>
            €{product.price.toFixed(2)}
          </Text>

          <Text style={styles.rating}>
            ★ {product.rating}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },

  image: {
    width: '100%',
    height: 190,
    backgroundColor: Colors.surface2,
  },

  info: {
    padding: 15,
  },

  brand: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.3,
  },

  name: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 5,
  },

  store: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },

  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },

  price: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },

  rating: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
});