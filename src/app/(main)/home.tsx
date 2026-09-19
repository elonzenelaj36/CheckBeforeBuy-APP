import React from 'react';
import {
  Image,
  Pressable,
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
import BrandLogo from '@/components/BrandLogo';
import { Colors } from '@/constants/colors';
import { AuthUser, getCurrentUser } from '@/services/auth';
import { CheckedProduct, getHistory } from '@/services/history';

export default function Home() {
  const router = useRouter();

  const [recentHistory, setRecentHistory] = React.useState<
    CheckedProduct[]
  >([]);
  const [user, setUser] = React.useState<AuthUser | null>(null);

  const loadData = async () => {
    const history = await getHistory();
    setRecentHistory(history.slice(0, 3));
    setUser(getCurrentUser());
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const displayName = user?.name || 'there';

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
            <Text style={styles.name}>{displayName}</Text>
          </View>

          <View style={styles.headerLogoWrap} pointerEvents="none">
            <BrandLogo
              minSize={28}
              maxSize={36}
              widthRatio={0.09}
              style={styles.headerLogo}
            />
          </View>

          <TouchableOpacity
            style={styles.profileCircle}
            onPress={() => router.push('/profile')}
            activeOpacity={0.8}
          >
            <Text style={styles.profileLetter}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>

        {/* My Home — HERO: the destination */}
        <Pressable
          onPress={() => router.push('/my-home')}
          style={({ pressed }) => [
            styles.heroOuter,
            pressed && styles.heroOuterPressed,
          ]}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroGlow} pointerEvents="none" />
            <View style={styles.heroGlowSmall} pointerEvents="none" />

            <View style={styles.heroMarkRow}>
              <View style={styles.heroMark}>
                <Text style={styles.heroMarkIcon}>⌂</Text>
              </View>
              <Text style={styles.heroEyebrow}>YOUR SPACE</Text>
            </View>

            <Text style={styles.heroTitle}>My Home</Text>

            <Text style={styles.heroSubtitle}>
              Your rooms, your items, and every product visualized inside them — all in one place.
            </Text>

            <View style={styles.heroChipRow}>
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>🛋  Rooms</Text>
              </View>
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>📦  Items</Text>
              </View>
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>🎨  Visuals</Text>
              </View>
            </View>

            <View style={styles.heroCta}>
              <Text style={styles.heroCtaText}>ENTER MY HOME</Text>
              <Text style={styles.heroCtaArrow}>→</Text>
            </View>
          </View>
        </Pressable>

        {/* Check Product — TOOL: secondary and functional */}
        <Text style={styles.toolIntro}>
          Before you buy, check it.
        </Text>

        <Pressable
          onPress={() => router.push('/check-product')}
          style={({ pressed }) => [
            styles.toolCard,
            pressed && styles.toolCardPressed,
          ]}
        >
          <View style={styles.toolIconCircle}>
            <Text style={styles.toolIcon}>◎</Text>
          </View>

          <View style={styles.toolText}>
            <Text style={styles.toolTitle}>Check a product</Text>
            <Text style={styles.toolDescription}>
              Take a photo before you buy it.
            </Text>
          </View>

          <View style={styles.toolCta}>
            <Text style={styles.toolCtaText}>CHECK</Text>
            <Text style={styles.toolCtaArrow}>→</Text>
          </View>
        </Pressable>

        {/* Recently Checked — its own translucent panel, secondary to My Home */}
        <View style={styles.recentSection}>
          <View style={styles.recentSectionHeader}>
            <Text style={styles.recentSectionTitle}>
              Recently Checked
            </Text>

            <TouchableOpacity
              onPress={() => router.push('/history')}
            >
              <Text style={styles.recentViewAll}>View all</Text>
            </TouchableOpacity>
          </View>

          {recentHistory.length === 0 ? (
            <TouchableOpacity
              style={styles.recentEmptyCard}
              onPress={() => router.push('/check-product')}
              activeOpacity={0.85}
            >
              <Text style={styles.recentEmptyTitle}>
                Nothing checked yet
              </Text>

              <Text style={styles.recentEmptyDescription}>
                Products you analyze will appear here.
                Tap to check your first product.
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.historyList}>
              {recentHistory.map((item, index) => (
                <View key={item.id}>
                  {index > 0 && <View style={styles.historyDivider} />}

                  <TouchableOpacity
                    style={styles.historyCard}
                    activeOpacity={0.85}
                  >
                    <View style={styles.historyImageFrame}>
                      <Image
                        source={{ uri: item.imageUri ?? undefined }}
                        style={styles.historyImage}
                      />
                    </View>

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
                </View>
              ))}
            </View>
          )}
        </View>

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
    backgroundColor: Colors.lightBackground,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 130,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },

  headerLogoWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerLogo: {
    marginBottom: 0,
  },

  eyebrow: {
    color: Colors.lightTextSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  name: {
    color: Colors.lightTextPrimary,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },

  profileCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.homeSurfaceRaised,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileLetter: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },

  /* ── My Home hero ─────────────────────────────────────── */

  heroOuter: {
    marginTop: 22,
    borderRadius: 34,
    padding: 2,
    backgroundColor: 'rgba(61, 130, 247, 0.35)',
    shadowColor: Colors.homeAccent,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 10,
  },

  heroOuterPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.95,
  },

  heroCard: {
    borderRadius: 32,
    backgroundColor: Colors.homeSurface,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    paddingHorizontal: 24,
    paddingVertical: 28,
    overflow: 'hidden',
  },

  heroGlow: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.homeAccent,
    opacity: 0.16,
  },

  heroGlowSmall: {
    position: 'absolute',
    bottom: -30,
    left: -30,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.homeCyan,
    opacity: 0.1,
  },

  heroMarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  heroMark: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: Colors.homeAccentDim,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroMarkIcon: {
    color: Colors.homeAccentText,
    fontSize: 19,
    fontWeight: '700',
  },

  heroEyebrow: {
    color: Colors.homeAccentText,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },

  heroTitle: {
    color: Colors.textPrimary,
    fontSize: 38,
    fontWeight: '800',
    marginTop: 18,
    letterSpacing: 0.2,
  },

  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 10,
    maxWidth: 280,
  },

  heroChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 20,
  },

  heroChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.homeSurfaceRaised,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
  },

  heroChipText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },

  heroCta: {
    marginTop: 26,
    height: 54,
    borderRadius: 16,
    backgroundColor: Colors.homeAccent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: Colors.homeAccent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 6,
  },

  heroCtaText: {
    color: Colors.cardHighlight,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.3,
  },

  heroCtaArrow: {
    color: Colors.cardHighlight,
    fontSize: 15,
    fontWeight: '700',
  },

  /* ── Check Product tool ───────────────────────────────── */

  toolIntro: {
    color: Colors.lightTextSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 2,
  },

  toolCard: {
    backgroundColor: Colors.homeSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    padding: 14,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  toolCardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },

  toolIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: Colors.homeAccentDim,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  toolIcon: {
    color: Colors.homeAccentText,
    fontSize: 20,
  },

  toolText: {
    flex: 1,
  },

  toolTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },

  toolDescription: {
    color: Colors.textSecondary,
    fontSize: 11.5,
    marginTop: 3,
  },

  toolCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.homeAccent,
    flexShrink: 0,
  },

  toolCtaText: {
    color: Colors.cardHighlight,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  toolCtaArrow: {
    color: Colors.cardHighlight,
    fontSize: 12,
    fontWeight: '700',
  },

  /* ── Shared sections ──────────────────────────────────── */

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 14,
  },

  sectionTitle: {
    color: Colors.lightTextSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  viewAll: {
    color: Colors.lightAccentText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },

  emptyCard: {
    backgroundColor: Colors.homeSurface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
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

  /* ── Recently Checked (translucent panel) ─────────────── */

  recentSection: {
    marginTop: 34,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(143, 192, 255, 0.12)',
    backgroundColor: '#D8E3F0',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
  },

  recentSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  recentSectionTitle: {
    color: Colors.lightTextStrong,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  recentViewAll: {
    color: Colors.lightAccentText,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  recentEmptyCard: {
    paddingTop: 4,
    paddingBottom: 20,
  },

  recentEmptyTitle: {
    color: Colors.lightTextStrong,
    fontSize: 14,
    fontWeight: '600',
  },

  recentEmptyDescription: {
    color: Colors.lightTextBody,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  historyList: {
    paddingBottom: 10,
  },

  historyDivider: {
    height: 1,
    backgroundColor: 'rgba(143, 192, 255, 0.08)',
  },

  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },

  historyImageFrame: {
    padding: 2,
    borderRadius: 16,
    backgroundColor: 'rgba(143, 192, 255, 0.16)',
    shadowColor: Colors.homeAccent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },

  historyImage: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: Colors.homeSurfaceRaised,
  },

  historyInfo: {
    flex: 1,
  },

  historyName: {
    color: Colors.lightTextStrong,
    fontSize: 15,
    fontWeight: '600',
  },

  historyMeta: {
    color: Colors.lightTextBody,
    fontSize: 11,
    marginTop: 5,
  },

  recommendationCard: {
    backgroundColor: Colors.homeSurface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
  },

  recommendationBadge: {
    backgroundColor: Colors.homeCyanDim,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },

  recommendationBadgeText: {
    color: Colors.homeCyanText,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
