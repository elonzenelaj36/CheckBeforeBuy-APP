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
import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { products } from '@/services/products';

export default function Recommendations() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow="FOR YOU" title="Recommendations" />

        <View style={styles.intro}>
          <Text style={styles.title}>
            Picked for your taste.
          </Text>

          <Text style={styles.subtitle}>
            Products that could fit your preferences and home.
          </Text>
        </View>

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
    backgroundColor: Colors.lightBackground,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },

  intro: {
    marginTop: 30,
    marginBottom: 24,
  },

  title: {
    color: Colors.lightTextPrimary,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
  },

  subtitle: {
    color: Colors.lightTextSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },

  list: {
    gap: 2,
  },
});
