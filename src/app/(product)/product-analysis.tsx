import React from 'react';

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import {
  analyzeProduct,
  ProductCheckResult,
} from '@/services/productChecks';

const RECOMMENDATION_LABEL: Record<string, string> = {
  buy: 'Good Buy',
  consider: 'Worth Considering',
  skip: 'Consider Skipping',
  unknown: 'Not Enough Information',
};

const PRICE_ASSESSMENT_LABEL: Record<string, string> = {
  fair: 'Fair Price',
  good_deal: 'Good Deal',
  overpriced: 'Overpriced',
  unknown: 'Price Unknown',
};

export default function ProductAnalysis() {
  const router = useRouter();

  const { imageUri, productName } = useLocalSearchParams<{
    imageUri?: string;
    productName?: string;
  }>();

  const [result, setResult] = React.useState<ProductCheckResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const runAnalysis = React.useCallback(() => {
    if (!imageUri) {
      setError("We couldn't find the product photo.\nPlease try again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    analyzeProduct(imageUri, undefined, productName)
      .then((res) => {
        setResult(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(
          err?.message ??
            "We couldn't analyze this product.\nPlease try again."
        );
        setLoading(false);
      });
  }, [imageUri]);

  React.useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ScreenHeader eyebrow="ANALYSIS" title="Analysis" />

          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Analysis failed</Text>
            <Text style={styles.errorText}>{error}</Text>

            <TouchableOpacity style={styles.retryButton} onPress={runAnalysis}>
              <Text style={styles.retryButtonText}>TRY AGAIN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (loading || !result) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Analyzing product...</Text>
          <Text style={styles.loadingSubtext}>
            Please wait while we identify this product.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { analysis, product } = result;

  const recommendationColor =
    analysis.recommendation === 'buy'
      ? Colors.success
      : analysis.recommendation === 'consider'
        ? Colors.warning
        : analysis.recommendation === 'skip'
          ? Colors.danger
          : Colors.textSecondary;

  const recommendationBg =
    analysis.recommendation === 'buy'
      ? Colors.successDim
      : analysis.recommendation === 'consider'
        ? Colors.warningDim
        : analysis.recommendation === 'skip'
          ? Colors.dangerDim
          : Colors.surface2;

  const hasPriceRange =
    analysis.estimatedPriceMin !== null && analysis.estimatedPriceMax !== null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          eyebrow="ANALYSIS COMPLETE"
          title={product.name || productName || 'Product analysis'}
        />

        {analysis.isMock && (
          <View style={styles.mockBanner}>
            <Text style={styles.mockBannerText}>
              ⚠ AI analysis is not configured on this server yet — showing a
              placeholder result. See backend/README.md.
            </Text>
          </View>
        )}

        {/* Recommendation Card */}
        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>OUR RECOMMENDATION</Text>

          <View
            style={[
              styles.recommendationBadge,
              { backgroundColor: recommendationBg },
            ]}
          >
            <Text style={[styles.recommendation, { color: recommendationColor }]}>
              {RECOMMENDATION_LABEL[analysis.recommendation] ?? analysis.recommendation}
            </Text>
          </View>

          <Text style={styles.confidenceText}>
            {analysis.confidence !== null
              ? `Confidence: ${Math.round(analysis.confidence * 100)}%`
              : 'Confidence: not available'}
          </Text>
        </View>

        {/* Product info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>PRODUCT</Text>
          <Text style={styles.productName}>{product.name || 'Unknown product'}</Text>
          <Text style={styles.productMeta}>
            {[product.category, product.brand].filter(Boolean).join(' · ') || 'Category unknown'}
          </Text>
        </View>

        {/* Price Analysis */}
        <View style={styles.priceCard}>
          <Text style={styles.cardTitle}>PRICE</Text>

          {hasPriceRange ? (
            <Text style={styles.priceRange}>
              Estimated range: {analysis.currency}
              {analysis.estimatedPriceMin} – {analysis.currency}
              {analysis.estimatedPriceMax}
            </Text>
          ) : (
            <Text style={styles.priceRange}>
              Not enough information to estimate a price.
            </Text>
          )}

          {analysis.userPrice !== null && (
            <Text style={styles.priceRange}>
              Your price: {analysis.currency}
              {analysis.userPrice}
            </Text>
          )}

          <View
            style={[
              styles.verdictBadge,
              {
                backgroundColor:
                  analysis.priceAssessment === 'good_deal'
                    ? Colors.successDim
                    : analysis.priceAssessment === 'overpriced'
                      ? Colors.dangerDim
                      : Colors.accentDim,
              },
            ]}
          >
            <Text
              style={[
                styles.verdictText,
                {
                  color:
                    analysis.priceAssessment === 'good_deal'
                      ? Colors.successText
                      : analysis.priceAssessment === 'overpriced'
                        ? Colors.dangerText
                        : Colors.accentText,
                },
              ]}
            >
              {PRICE_ASSESSMENT_LABEL[analysis.priceAssessment] ?? analysis.priceAssessment}
            </Text>
          </View>
        </View>

        {/* Description */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>WHAT WE SEE</Text>
          <Text style={styles.text}>
            {analysis.description || 'No description available.'}
          </Text>
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() =>
            router.push({
              pathname: '/decision',
              params: {
                imageUri,
                productName: product.name || productName,
                recommendation: analysis.recommendation,
                confidence: analysis.confidence !== null ? String(analysis.confidence) : '',
                priceAssessment: analysis.priceAssessment,
                description: analysis.description || '',
              },
            })
          }
        >
          <Text style={styles.primaryButtonText}>SEE FULL RECOMMENDATION →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() =>
            router.push({
              pathname: '/select-room',
              params: {
                productImageUri: result.imageUrl ?? imageUri,
                productName: product.name || productName,
                productCheckId: result.id,
              },
            })
          }
        >
          <Text style={styles.secondaryButtonText}>GENERATE INTO MY ROOM</Text>
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

  centerState: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
  },

  loadingSubtext: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },

  errorCard: {
    backgroundColor: Colors.dangerDim,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.danger,
    padding: 20,
    marginTop: 40,
    width: '100%',
    alignItems: 'center',
  },

  errorTitle: {
    color: Colors.dangerText,
    fontSize: 16,
    fontWeight: '700',
  },

  errorText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },

  retryButton: {
    height: 48,
    paddingHorizontal: 22,
    backgroundColor: Colors.cardHighlight,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },

  retryButtonText: {
    color: Colors.cardHighlightText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  mockBanner: {
    backgroundColor: Colors.warningDim,
    borderRadius: 10,
    padding: 10,
    marginTop: 14,
    borderWidth: 1,
    borderColor: Colors.warning,
  },

  mockBannerText: {
    color: Colors.warningText,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    textAlign: 'center',
  },

  scoreCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    marginTop: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },

  scoreLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  recommendationBadge: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 14,
  },

  recommendation: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  confidenceText: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 12,
  },

  priceCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    marginTop: 14,
  },

  productName: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },

  productMeta: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },

  priceRange: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 8,
  },

  verdictBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 12,
  },

  verdictText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    marginTop: 14,
  },

  cardTitle: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  text: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },

  primaryButton: {
    height: 56,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },

  primaryButtonText: {
    color: Colors.cardHighlight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  secondaryButton: {
    height: 56,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  secondaryButtonText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
