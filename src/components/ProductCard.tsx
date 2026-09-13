import {
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

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
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 14,
  },

  image: {
    width: '100%',
    height: 190,
    backgroundColor: '#222222',
  },

  info: {
    padding: 15,
  },

  brand: {
    color: '#777777',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.3,
  },

  name: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginTop: 5,
  },

  store: {
    color: '#777777',
    fontSize: 12,
    marginTop: 5,
  },

  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },

  price: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  rating: {
    color: '#AAAAAA',
    fontSize: 12,
  },
});