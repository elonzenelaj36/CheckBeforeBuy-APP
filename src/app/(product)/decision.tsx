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

export default function Decision() {
  const router = useRouter();

  const { productId } =
    useLocalSearchParams<{
      productId: string;
    }>();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
      >
        <Text style={styles.eyebrow}>
          CHECK BEFORE BUY
        </Text>

        <Text style={styles.title}>
          Our decision.
        </Text>

        <View style={styles.decisionCard}>
          <Text style={styles.decision}>
            BUY
          </Text>

          <Text style={styles.score}>
            86 / 100
          </Text>

          <Text style={styles.description}>
            Based on the product's price, quality,
            rating and compatibility, this looks like
            a strong purchase.
          </Text>
        </View>

        <View style={styles.reasonCard}>
          <Text style={styles.label}>
            WHY?
          </Text>

          <Text style={styles.reason}>
            Good value for the price.
          </Text>

          <Text style={styles.reason}>
            Strong customer rating.
          </Text>

          <Text style={styles.reason}>
            Versatile design.
          </Text>

          <Text style={styles.reason}>
            Fits common home styles.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primary}
          onPress={() =>
            router.push({
              pathname: '/alternatives',
              params: {
                productId,
              },
            })
          }
        >
          <Text style={styles.primaryText}>
            SEE BETTER ALTERNATIVES
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondary}
          onPress={() =>
            router.push({
              pathname: '/price-history',
              params: {
                productId,
              },
            })
          }
        >
          <Text style={styles.secondaryText}>
            CHECK PRICE HISTORY
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
    paddingTop: 40,
    paddingBottom: 40,
  },

  eyebrow: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '700',
    marginTop: 7,
  },

  decisionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 26,
    alignItems: 'center',
    marginTop: 28,
  },

  decision: {
    color: '#111111',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 2,
  },

  score: {
    color: '#555555',
    fontSize: 14,
    marginTop: 5,
  },

  description: {
    color: '#666666',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 18,
  },

  reasonCard: {
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 20,
    marginTop: 14,
  },

  label: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 12,
  },

  reason: {
    color: '#AAAAAA',
    fontSize: 13,
    marginTop: 8,
  },

  primary: {
    height: 56,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },

  primaryText: {
    color: '#111111',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  secondary: {
    height: 56,
    backgroundColor: '#181818',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  secondaryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
});