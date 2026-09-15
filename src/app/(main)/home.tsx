import React from 'react';

import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useFocusEffect,
  useRouter,
} from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import BottomNavigation from '@/components/BottomNavigation';
import { Colors } from '@/constants/colors';
import { CheckedProduct, getHistory } from '@/services/history';

export default function Home() {
  const router = useRouter();

  const [recentHistory, setRecentHistory] = React.useState<
    CheckedProduct[]
  >([]);

  const loadData = async () => {
    const history = await getHistory();
    setRecentHistory(history.slice(0, 3));
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>
              WELCOME BACK
            </Text>
            <Text style={styles.name}>Elon</Text>
          </View>

          <TouchableOpacity
            style={styles.profileCircle}
            onPress={() => router.push('/profile')}
            activeOpacity={0.8}
          >
            <Text style={styles.profileLetter}>E</Text>
          </TouchableOpacity>
        </View>

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.title}>
            Before you buy,
          </Text>
          <Text style={styles.title}>check it.</Text>

          <Text style={styles.subtitle}>
            Analyze products, see how they fit your home,
            and make better buying decisions.
          </Text>
        </View>

        {/* Check Product — Main CTA */}
        <TouchableOpacity
          style={styles.mainCard}
          onPress={() => router.push('/check-product')}
          activeOpacity={0.85}
        >
          <View>
            <Text style={styles.mainCardEyebrow}>
              MAIN TOOL
            </Text>

            <Text style={styles.mainCardTitle}>
              Check a product
            </Text>

            <Text style={styles.mainCardDescription}>
              Take a photo of something you&apos;re thinking
              about buying. We&apos;ll help you decide.
            </Text>
          </View>

          <View style={styles.arrowCircle}>
            <Text style={styles.arrow}>→</Text>
          </View>
        </TouchableOpacity>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>
          QUICK ACTIONS
        </Text>

        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickCardFull}
            onPress={() => router.push('/my-home')}
            activeOpacity={0.85}
          >
            <Text style={styles.quickIcon}>🏠</Text>

            <Text style={styles.quickTitle}>
              My home
            </Text>

            <Text style={styles.quickDescription}>
              Manage your rooms, your detected items, and find products for your space.
            </Text>

            <Text style={styles.quickArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Recently Checked */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            RECENTLY CHECKED
          </Text>

          <TouchableOpacity
            onPress={() => router.push('/history')}
          >
            <Text style={styles.viewAll}>VIEW ALL</Text>
          </TouchableOpacity>
        </View>

        {recentHistory.length === 0 ? (
          <TouchableOpacity
            style={styles.emptyCard}
            onPress={() => router.push('/check-product')}
            activeOpacity={0.85}
          >
            <Text style={styles.emptyTitle}>
              Nothing checked yet
            </Text>

            <Text style={styles.emptyDescription}>
              Products you analyze will appear here.
              Tap to check your first product.
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.historyList}>
            {recentHistory.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.historyCard}
                activeOpacity={0.85}
              >
                <Image
                  source={{ uri: item.imageUri ?? undefined }}
                  style={styles.historyImage}
                />

                <View style={styles.historyInfo}>
                  <Text
                    style={styles.historyName}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>

                  <Text style={styles.historyMeta}>
                    {item.hasAnalysis
                      ? '✓ Analyzed'
                      : 'Not analyzed'}
                    {item.hasVisualization
                      ? '  ·  ✓ Visualized'
                      : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Recommended */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            RECOMMENDED FOR YOU
          </Text>

          <TouchableOpacity
            onPress={() =>
              router.push('/recommendations')
            }
          >
            <Text style={styles.viewAll}>VIEW ALL</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.recommendationCard}>
          <View style={styles.recommendationBadge}>
            <Text style={styles.recommendationBadgeText}>
              COMING SOON
            </Text>
          </View>

          <Text style={styles.emptyTitle}>
            Personalised recommendations
          </Text>

          <Text style={styles.emptyDescription}>
            As you check products and build your home
            profile, we&apos;ll learn what fits you. Check
            more products to get started.
          </Text>
        </View>
      </ScrollView>

      <BottomNavigation activeTab="home" />
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
    paddingBottom: 120,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  eyebrow: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  name: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },

  profileCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileLetter: {
    color: Colors.cardHighlight,
    fontSize: 16,
    fontWeight: '700',
  },

  intro: {
    marginTop: 40,
    marginBottom: 24,
  },

  title: {
    color: Colors.textPrimary,
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
  },

  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    maxWidth: 340,
  },

  mainCard: {
    backgroundColor: Colors.cardHighlight,
    borderRadius: 20,
    padding: 22,
    minHeight: 185,
    justifyContent: 'space-between',
  },

  mainCardEyebrow: {
    color: Colors.cardHighlightTextMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  mainCardTitle: {
    color: Colors.cardHighlightText,
    fontSize: 25,
    fontWeight: '700',
    marginTop: 10,
  },

  mainCardDescription: {
    color: Colors.cardHighlightTextMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    maxWidth: 290,
  },

  arrowCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },

  arrow: {
    color: Colors.textPrimary,
    fontSize: 20,
  },

  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 30,
  },

  quickRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },

  quickCardFull: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    minHeight: 110,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'space-between',
  },

  quickIcon: {
    fontSize: 22,
    marginBottom: 4,
  },

  quickTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },

  quickDescription: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },

  quickArrow: {
    color: Colors.accent,
    fontSize: 18,
    marginTop: 14,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 12,
  },

  viewAll: {
    color: Colors.accent,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },

  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

  emptyDescription: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  historyList: {
    gap: 10,
  },

  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    gap: 12,
  },

  historyImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
  },

  historyInfo: {
    flex: 1,
  },

  historyName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

  historyMeta: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },

  recommendationCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  recommendationBadge: {
    backgroundColor: Colors.accentDim,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },

  recommendationBadgeText: {
    color: Colors.accentText,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
});