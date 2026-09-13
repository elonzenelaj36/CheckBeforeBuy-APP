import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { useRouter } from 'expo-router';

export default function PriceHistory() {
  const router = useRouter();

  const prices = [
    {
      month: 'APR',
      price: 229,
    },
    {
      month: 'MAY',
      price: 219,
    },
    {
      month: 'JUN',
      price: 205,
    },
    {
      month: 'JUL',
      price: 199,
    },
    {
      month: 'AUG',
      price: 189,
    },
    {
      month: 'SEP',
      price: 189,
    },
  ];

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
          PRICE TRACKING
        </Text>

        <Text style={styles.title}>
          Price history.
        </Text>

        <Text style={styles.subtitle}>
          See how this product's price has changed.
        </Text>

        <View style={styles.currentCard}>
          <Text style={styles.label}>
            CURRENT PRICE
          </Text>

          <Text style={styles.currentPrice}>
            €189.99
          </Text>

          <Text style={styles.good}>
            Lowest price in the last 6 months
          </Text>
        </View>

        <View style={styles.historyCard}>
          {prices.map((item) => (
            <View
              key={item.month}
              style={styles.row}
            >
              <Text style={styles.month}>
                {item.month}
              </Text>

              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      width: `${(item.price / 250) * 100}%`,
                    },
                  ]}
                />
              </View>

              <Text style={styles.price}>
                €{item.price}
              </Text>
            </View>
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
  },

  subtitle: {
    color: '#888888',
    fontSize: 14,
    marginTop: 10,
  },

  currentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    marginTop: 28,
  },

  label: {
    color: '#777777',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  currentPrice: {
    color: '#111111',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 8,
  },

  good: {
    color: '#555555',
    fontSize: 12,
    marginTop: 5,
  },

  historyCard: {
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 18,
    marginTop: 14,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },

  month: {
    width: 35,
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
  },

  barContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#2D2D2D',
    borderRadius: 4,
    overflow: 'hidden',
    marginHorizontal: 10,
  },

  bar: {
    height: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
  },

  price: {
    width: 55,
    textAlign: 'right',
    color: '#FFFFFF',
    fontSize: 12,
  },
});