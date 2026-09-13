import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import BottomNavigation from '@/components/BottomNavigation';

export default function History() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
      >
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
              ACTIVITY
            </Text>

            <Text style={styles.title}>
              History
            </Text>
          </View>

          <View style={styles.spacer} />
        </View>

        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            Nothing checked yet
          </Text>

          <Text style={styles.emptyText}>
            Products you analyze will appear here so you
            can quickly review them later.
          </Text>

          <TouchableOpacity
            style={styles.button}
            onPress={() =>
              router.push('/check-product')
            }
          >
            <Text style={styles.buttonText}>
              CHECK A PRODUCT
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

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
    padding: 20,
    paddingBottom: 120,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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

  spacer: {
    width: 44,
  },

  eyebrow: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },

  emptyCard: {
    marginTop: 45,
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 24,
  },

  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '600',
  },

  emptyText: {
    color: '#777777',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 9,
  },

  button: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },

  buttonText: {
    color: '#111111',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
});