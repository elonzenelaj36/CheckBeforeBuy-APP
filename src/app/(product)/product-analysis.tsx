import React from 'react';

import {
  ActivityIndicator,
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

import {
  ProductAnalysis as Analysis,
  analyzeProduct,
} from '@/services/ai';

export default function ProductAnalysis() {
  const router = useRouter();

  const { productId } =
    useLocalSearchParams<{
      productId: string;
    }>();

  const [analysis, setAnalysis] =
    React.useState<Analysis | null>(null);

  React.useEffect(() => {
    analyzeProduct(productId || '1').then(
      setAnalysis
    );
  }, [productId]);

  if (!analysis) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator
            size="large"
            color="#FFFFFF"
          />

          <Text style={styles.loadingText}>
            Analyzing product...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backArrow}>
            ←
          </Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>
          ANALYSIS COMPLETE
        </Text>

        <Text style={styles.title}>
          Here's what we found.
        </Text>

        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>
            CHECK SCORE
          </Text>

          <Text style={styles.score}>
            {analysis.score}
          </Text>

          <Text style={styles.scoreOut}>
            /100
          </Text>

          <Text style={styles.recommendation}>
            {analysis.recommendation}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            SUMMARY
          </Text>

          <Text style={styles.text}>
            {analysis.summary}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            WHAT WE LIKE
          </Text>

          {analysis.pros.map((item) => (
            <Text
              key={item}
              style={styles.listItem}
            >
              + {item}
            </Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            THINGS TO CONSIDER
          </Text>

          {analysis.cons.map((item) => (
            <Text
              key={item}
              style={styles.listItem}
            >
              − {item}
            </Text>
          ))}
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            router.push({
              pathname: '/product-info',
              params: {
                productId,
              },
            })
          }
        >
          <Text style={styles.buttonText}>
            SEE PRODUCT DETAILS
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

  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    color: '#777777',
    marginTop: 14,
  },

  content: {
    padding: 20,
    paddingBottom: 40,
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
    marginBottom: 28,
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
  },

  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 7,
  },

  scoreCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginTop: 28,
    alignItems: 'center',
  },

  scoreLabel: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  score: {
    color: '#111111',
    fontSize: 64,
    fontWeight: '700',
    marginTop: 8,
  },

  scoreOut: {
    color: '#777777',
    fontSize: 14,
    marginTop: -10,
  },

  recommendation: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    letterSpacing: 1,
  },

  card: {
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 18,
    marginTop: 14,
  },

  cardTitle: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  text: {
    color: '#AAAAAA',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },

  listItem: {
    color: '#AAAAAA',
    fontSize: 13,
    lineHeight: 21,
    marginTop: 9,
  },

  button: {
    height: 56,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
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