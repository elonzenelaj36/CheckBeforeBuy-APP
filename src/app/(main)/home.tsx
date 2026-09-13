import { useRouter } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BottomNavigation from '@/components/BottomNavigation';

export default function Home() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>WELCOME BACK</Text>
            <Text style={styles.name}>Elon</Text>
          </View>

          <TouchableOpacity
            style={styles.profileCircle}
            onPress={() => router.push('/profile')}
          >
            <Text style={styles.profileLetter}>E</Text>
          </TouchableOpacity>
        </View>

        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.title}>Before you buy,</Text>
          <Text style={styles.title}>check it.</Text>

          <Text style={styles.subtitle}>
            Analyze products, see how they fit your home,
            and make better buying decisions.
          </Text>
        </View>

        {/* Check Product */}
        <TouchableOpacity
          style={styles.mainCard}
          onPress={() => router.push('/check-product')}
          activeOpacity={0.85}
        >
          <View>
            <Text style={styles.cardEyebrow}>MAIN TOOL</Text>

            <Text style={styles.mainCardTitle}>
              Check a product
            </Text>

            <Text style={styles.mainCardDescription}>
              Scan or search for something you're thinking
              about buying.
            </Text>
          </View>

          <View style={styles.arrowCircle}>
            <Text style={styles.arrow}>→</Text>
          </View>
        </TouchableOpacity>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>

        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/find-for-my-home')}
            activeOpacity={0.85}
          >
            <Text style={styles.quickTitle}>
              Find for my home
            </Text>

            <Text style={styles.quickDescription}>
              Tell us what you need.
            </Text>

            <Text style={styles.quickArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/my-home')}
            activeOpacity={0.85}
          >
            <Text style={styles.quickTitle}>
              My home
            </Text>

            <Text style={styles.quickDescription}>
              Manage your rooms.
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

        <TouchableOpacity
          style={styles.emptyCard}
          onPress={() => router.push('/history')}
          activeOpacity={0.85}
        >
          <Text style={styles.emptyTitle}>
            Nothing checked yet
          </Text>

          <Text style={styles.emptyDescription}>
            Products you analyze will appear here.
          </Text>
        </TouchableOpacity>

        {/* Recommended */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            RECOMMENDED FOR YOU
          </Text>

          <TouchableOpacity
            onPress={() => router.push('/recommendations')}
          >
            <Text style={styles.viewAll}>VIEW ALL</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.emptyCard}
          onPress={() => router.push('/recommendations')}
          activeOpacity={0.85}
        >
          <Text style={styles.emptyTitle}>
            Recommendations will appear here
          </Text>

          <Text style={styles.emptyDescription}>
            As you check products and build your home,
            we'll learn what fits you.
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Fixed Bottom Navigation */}
      <BottomNavigation activeTab="home" />
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
    paddingBottom: 120,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  eyebrow: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  name: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },

  profileCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileLetter: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },

  intro: {
    marginTop: 42,
    marginBottom: 28,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 38,
  },

  subtitle: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
    maxWidth: 330,
  },

  mainCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    minHeight: 190,
    justifyContent: 'space-between',
  },

  cardEyebrow: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  mainCardTitle: {
    color: '#111111',
    fontSize: 25,
    fontWeight: '700',
    marginTop: 10,
  },

  mainCardDescription: {
    color: '#555555',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    maxWidth: 280,
  },

  arrowCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },

  arrow: {
    color: '#FFFFFF',
    fontSize: 20,
  },

  sectionTitle: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  quickRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },

  quickCard: {
    flex: 1,
    backgroundColor: '#181818',
    borderRadius: 16,
    padding: 16,
    minHeight: 145,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },

  quickTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },

  quickDescription: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },

  quickArrow: {
    color: '#FFFFFF',
    fontSize: 18,
    marginTop: 18,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 34,
    marginBottom: 12,
  },

  viewAll: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },

  emptyCard: {
    backgroundColor: '#181818',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },

  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  emptyDescription: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
});