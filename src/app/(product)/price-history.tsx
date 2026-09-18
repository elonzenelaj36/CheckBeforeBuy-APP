import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';

export default function PriceHistory() {
  const prices = [
    { month: 'APR', price: 229 },
    { month: 'MAY', price: 219 },
    { month: 'JUN', price: 205 },
    { month: 'JUL', price: 199 },
    { month: 'AUG', price: 189 },
    { month: 'SEP', price: 189 },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow="PRICE TRACKING" title="Price history" />

        <Text style={styles.subtitle}>
          See how this product&apos;s price has changed.
        </Text>

        <View style={styles.currentCard}>
          <Text style={styles.label}>
            CURRENT PRICE
          </Text>

          <Text style={styles.currentPrice}>
            €189.99
          </Text>

          <View style={styles.goodBadge}>
            <Text style={styles.good}>
              Lowest price in the last 6 months
            </Text>
          </View>
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
    backgroundColor: Colors.background,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 24,
  },

  currentCard: {
    backgroundColor: Colors.cardHighlight,
    borderRadius: 20,
    padding: 22,
    marginTop: 20,
  },

  label: {
    color: Colors.cardHighlightTextMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  currentPrice: {
    color: Colors.cardHighlightText,
    fontSize: 32,
    fontWeight: '700',
    marginTop: 8,
  },

  goodBadge: {
    backgroundColor: Colors.successDim,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 10,
  },

  good: {
    color: Colors.successText,
    fontSize: 11,
    fontWeight: '600',
  },

  historyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
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
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },

  barContainer: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.surface2,
    borderRadius: 4,
    overflow: 'hidden',
    marginHorizontal: 10,
  },

  bar: {
    height: 8,
    backgroundColor: Colors.accent,
    borderRadius: 4,
  },

  price: {
    width: 55,
    textAlign: 'right',
    color: Colors.textPrimary,
    fontSize: 12,
  },
});
