import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Alternatives() {
  const router = useRouter();

  const alternatives = [
    {
      name: 'Minimal Lounge Chair',
      price: '€199',
      saving: 'Save €50',
      reason: 'Similar style and slightly lower price.',
    },
    {
      name: 'Comfort Fabric Chair',
      price: '€219',
      saving: 'Save €30',
      reason: 'Similar materials with a simpler design.',
    },
    {
      name: 'Modern Accent Chair',
      price: '€235',
      saving: 'Save €14',
      reason: 'Very similar appearance and dimensions.',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backArrow}>
              ←
            </Text>
          </TouchableOpacity>

          <View>
            <Text style={styles.eyebrow}>
              CHECK
            </Text>

            <Text style={styles.headerTitle}>
              Alternatives
            </Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.title}>
            Better options.
          </Text>

          <Text style={styles.subtitle}>
            We found products that may give you similar
            value for less money.
          </Text>
        </View>

        {/* Current product */}
        <View style={styles.currentCard}>
          <View>
            <Text style={styles.currentLabel}>
              YOUR PRODUCT
            </Text>

            <Text style={styles.currentName}>
              Modern Lounge Chair
            </Text>
          </View>

          <Text style={styles.currentPrice}>
            €249
          </Text>
        </View>

        {/* Alternatives */}
        <Text style={styles.sectionTitle}>
          POSSIBLE ALTERNATIVES
        </Text>

        {alternatives.map((item) => (
          <TouchableOpacity
            key={item.name}
            style={styles.alternativeCard}
            activeOpacity={0.85}
          >
            <View style={styles.productPlaceholder}>
              <Text style={styles.placeholderText}>
                PRODUCT
              </Text>
            </View>

            <View style={styles.alternativeContent}>
              <Text style={styles.productName}>
                {item.name}
              </Text>

              <Text style={styles.reason}>
                {item.reason}
              </Text>

              <View style={styles.bottomRow}>
                <Text style={styles.price}>
                  {item.price}
                </Text>

                <Text style={styles.saving}>
                  {item.saving}
                </Text>
              </View>
            </View>

            <Text style={styles.arrow}>
              →
            </Text>
          </TouchableOpacity>
        ))}

        {/* Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            How we'll find alternatives
          </Text>

          <Text style={styles.infoText}>
            Later, Check Before Buy will compare products
            from supported stores using price, category,
            materials, dimensions, style, and other product
            characteristics.
          </Text>
        </View>

        {/* Back */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/home')}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>
            BACK TO HOME
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    textAlign: 'center',
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center',
  },

  headerSpacer: {
    width: 44,
  },

  intro: {
    marginTop: 42,
    marginBottom: 26,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '700',
  },

  subtitle: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },

  currentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  currentLabel: {
    color: '#777777',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  currentName: {
    color: '#111111',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 6,
  },

  currentPrice: {
    color: '#111111',
    fontSize: 24,
    fontWeight: '700',
  },

  sectionTitle: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 30,
    marginBottom: 12,
  },

  alternativeCard: {
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  productPlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
  },

  placeholderText: {
    color: '#666666',
    fontSize: 8,
    fontWeight: '700',
  },

  alternativeContent: {
    flex: 1,
    marginLeft: 13,
  },

  productName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  reason: {
    color: '#777777',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },

  price: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },

  saving: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 9,
  },

  arrow: {
    color: '#FFFFFF',
    fontSize: 18,
    marginLeft: 8,
  },

  infoCard: {
    marginTop: 20,
    padding: 18,
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },

  infoTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  infoText: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },

  button: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
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