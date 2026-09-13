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

export default function Saved() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
      >
        <Text style={styles.eyebrow}>
          YOUR COLLECTION
        </Text>

        <Text style={styles.title}>
          Saved.
        </Text>

        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            Nothing saved yet
          </Text>

          <Text style={styles.emptyText}>
            Save products you like while browsing and
            comparing.
          </Text>

          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/search')}
          >
            <Text style={styles.buttonText}>
              EXPLORE PRODUCTS
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <BottomNavigation activeTab="saved" />
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

  eyebrow: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 20,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '700',
    marginTop: 7,
  },

  emptyCard: {
    marginTop: 35,
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 22,
  },

  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },

  emptyText: {
    color: '#777777',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
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