import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';

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
        <ScreenHeader eyebrow="CHECK" title="Alternatives" />

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

        <View style={styles.list}>
          {alternatives.map((item) => (
            <TouchableOpacity
              key={item.name}
              style={styles.alternativeCard}
              activeOpacity={0.85}
            >
              <View style={styles.productPlaceholder}>
                <Text style={styles.placeholderText}>
                  {item.name.charAt(0)}
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

                  <View style={styles.savingBadge}>
                    <Text style={styles.saving}>
                      {item.saving}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.arrow}>
                →
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            HOW WE&apos;LL FIND ALTERNATIVES
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
    backgroundColor: Colors.background,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  intro: {
    marginTop: 32,
    marginBottom: 24,
  },

  title: {
    color: Colors.textPrimary,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
  },

  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },

  currentCard: {
    backgroundColor: Colors.cardHighlight,
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  currentLabel: {
    color: Colors.cardHighlightTextMuted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  currentName: {
    color: Colors.cardHighlightText,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 6,
  },

  currentPrice: {
    color: Colors.cardHighlightText,
    fontSize: 24,
    fontWeight: '700',
  },

  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 28,
    marginBottom: 12,
  },

  list: {
    gap: 10,
  },

  alternativeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  productPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  placeholderText: {
    color: Colors.accentText,
    fontSize: 18,
    fontWeight: '700',
  },

  alternativeContent: {
    flex: 1,
    marginLeft: 13,
  },

  productName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

  reason: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 9,
    gap: 10,
  },

  price: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },

  savingBadge: {
    backgroundColor: Colors.successDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  saving: {
    color: Colors.successText,
    fontSize: 9,
    fontWeight: '700',
  },

  arrow: {
    color: Colors.accent,
    fontSize: 18,
    marginLeft: 8,
  },

  infoCard: {
    marginTop: 22,
    padding: 18,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  infoTitle: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  infoText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
  },

  button: {
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.cardHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },

  buttonText: {
    color: Colors.cardHighlightText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
