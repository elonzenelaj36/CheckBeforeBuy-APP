import { router } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.smallText}>
              WELCOME BACK
            </Text>

            <Text style={styles.greeting}>
              Elon
            </Text>
          </View>

          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => router.push('/profile')}
          >
            <Text style={styles.profileText}>
              E
            </Text>
          </TouchableOpacity>
        </View>

        {/* Main message */}
        <View style={styles.intro}>
          <Text style={styles.title}>
            Before you buy,
            {'\n'}
            check it.
          </Text>

          <Text style={styles.description}>
            Analyze products, see how they fit your home,
            and find out if they're really worth buying.
          </Text>
        </View>

        {/* Check Product */}
        <TouchableOpacity
          style={styles.checkCard}
          onPress={() => router.push('/check-product')}
        >
          <View>
            <Text style={styles.cardLabel}>
              MAIN FEATURE
            </Text>

            <Text style={styles.checkTitle}>
              Check a product
            </Text>

            <Text style={styles.checkDescription}>
              Scan or select a product to start your analysis.
            </Text>
          </View>

          <View style={styles.arrowCircle}>
            <Text style={styles.arrow}>
              →
            </Text>
          </View>
        </TouchableOpacity>

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>
          QUICK ACTIONS
        </Text>

        <View style={styles.quickActions}>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/find-for-my-home')}
          >
            <Text style={styles.actionNumber}>
              01
            </Text>

            <Text style={styles.actionTitle}>
              Find for
              {'\n'}
              my home
            </Text>

            <Text style={styles.actionArrow}>
              →
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/my-home')}
          >
            <Text style={styles.actionNumber}>
              02
            </Text>

            <Text style={styles.actionTitle}>
              My
              {'\n'}
              home
            </Text>

            <Text style={styles.actionArrow}>
              →
            </Text>
          </TouchableOpacity>

        </View>

        {/* Recently checked */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            RECENTLY CHECKED
          </Text>

          <TouchableOpacity
            onPress={() => router.push('/history')}
          >
            <Text style={styles.seeAll}>
              SEE ALL
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>
              +
            </Text>
          </View>

          <View style={styles.emptyContent}>
            <Text style={styles.emptyTitle}>
              Nothing checked yet
            </Text>

            <Text style={styles.emptyDescription}>
              Products you analyze will appear here.
            </Text>
          </View>
        </View>

        {/* Recommendations */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            RECOMMENDED FOR YOU
          </Text>

          <TouchableOpacity
            onPress={() => router.push('/recommendations')}
          >
            <Text style={styles.seeAll}>
              SEE ALL
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>
              ★
            </Text>
          </View>

          <View style={styles.emptyContent}>
            <Text style={styles.emptyTitle}>
              Recommendations coming soon
            </Text>

            <Text style={styles.emptyDescription}>
              Once we know what you like, we'll find products
              that fit your home and budget.
            </Text>
          </View>
        </View>

      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNavigation}>

        <TouchableOpacity style={styles.navItem}>
          <View style={styles.activeDot} />

          <Text style={styles.activeNavText}>
            Home
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push('/search')}
        >
          <Text style={styles.navIcon}>
            ⌕
          </Text>

          <Text style={styles.navText}>
            Search
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push('/saved')}
        >
          <Text style={styles.navIcon}>
            ♡
          </Text>

          <Text style={styles.navText}>
            Saved
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push('/profile')}
        >
          <Text style={styles.navIcon}>
            ○
          </Text>

          <Text style={styles.navText}>
            Profile
          </Text>
        </TouchableOpacity>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },

  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 120,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  smallText: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  greeting: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '700',
    marginTop: 5,
  },

  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },

  intro: {
    marginTop: 45,
    marginBottom: 30,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 38,
    lineHeight: 43,
    fontWeight: '700',
  },

  description: {
    color: '#888888',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 15,
    maxWidth: 340,
  },

  checkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    minHeight: 190,
    justifyContent: 'space-between',
  },

  cardLabel: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  checkTitle: {
    color: '#111111',
    fontSize: 27,
    fontWeight: '700',
    marginTop: 12,
  },

  checkDescription: {
    color: '#555555',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
    maxWidth: 280,
  },

  arrowCircle: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },

  arrow: {
    color: '#FFFFFF',
    fontSize: 22,
  },

  sectionTitle: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 15,
  },

  actionCard: {
    flex: 1,
    minHeight: 155,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    backgroundColor: '#181818',
    padding: 18,
    justifyContent: 'space-between',
  },

  actionNumber: {
    color: '#555555',
    fontSize: 11,
    fontWeight: '700',
  },

  actionTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '600',
  },

  actionArrow: {
    color: '#FFFFFF',
    fontSize: 20,
    alignSelf: 'flex-end',
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 38,
    marginBottom: 15,
  },

  seeAll: {
    color: '#AAAAAA',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  emptyCard: {
    minHeight: 100,
    borderRadius: 16,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#282828',
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },

  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyIconText: {
    color: '#777777',
    fontSize: 20,
  },

  emptyContent: {
    flex: 1,
    marginLeft: 14,
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
    marginTop: 4,
  },

  bottomNavigation: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 82,
    backgroundColor: '#151515',
    borderTopWidth: 1,
    borderTopColor: '#282828',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 8,
  },

  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 65,
  },

  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
  },

  activeNavText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },

  navIcon: {
    color: '#777777',
    fontSize: 21,
    height: 25,
    marginBottom: 2,
  },

  navText: {
    color: '#777777',
    fontSize: 11,
  },
});