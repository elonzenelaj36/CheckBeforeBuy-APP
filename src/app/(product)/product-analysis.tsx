import React from 'react';

import {
  ActivityIndicator,
  Linking,
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
  ProductAlternative,
  ProductCheckResult,
} from '@/services/productChecks';

function formatMoney(amount: number, currency: string | null): string {
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return !currency || currency === 'EUR' ? `€${value}` : `${value} ${currency}`;
}

function AlternativeCard({ item }: { item: ProductAlternative }) {
  return (
    <View style={styles.matchRow}>
      <Text style={styles.matchStore}>
        {[item.source, item.localityLabel].filter(Boolean).join(' · ')}
      </Text>
      {item.title && <Text style={styles.matchTitle}>{item.title}</Text>}
      <Text style={styles.priceRange}>
        {item.price !== null
          ? `Listed price: ${formatMoney(item.price, item.currency)}`
          : 'Price not listed'}
      </Text>
      <Text style={styles.text}>{item.reason}</Text>
      <TouchableOpacity onPress={() => Linking.openURL(item.url)}>
        <Text style={styles.matchLink}>VIEW PRODUCT →</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ProductAnalysis() {
  const router = useRouter();

  const { imageUri, productName, userPrice } = useLocalSearchParams<{
    imageUri?: string;
    productName?: string;
    userPrice?: string;
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

    analyzeProduct(
      imageUri,
      userPrice ? Number(userPrice) : undefined,
      productName
    )
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
  }, [imageUri, productName, userPrice]);

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
          <Text style={styles.loadingText}>Analyzing your product...</Text>
          <Text style={styles.loadingSubtext}>
            Identifying the product, searching stores and comparing prices.
            This can take up to half a minute.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { analysis, product } = result;
  const comparison = result.comparison;
  const characteristics = result.characteristics ?? [];

  const decision = comparison?.decision ?? 'UNKNOWN';
  const decisionColor =
    decision === 'BUY'
      ? Colors.success
      : decision === 'COMPARE'
        ? Colors.warning
        : decision === 'SKIP'
          ? Colors.danger
          : Colors.textSecondary;
  const decisionBg =
    decision === 'BUY'
      ? Colors.successDim
      : decision === 'COMPARE'
        ? Colors.warningDim
        : decision === 'SKIP'
          ? Colors.dangerDim
          : Colors.surface2;

  const otherAlternatives = comparison
    ? comparison.alternatives.filter((a) => a !== comparison.exactMatch)
    : [];

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

        {/* Product info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>PRODUCT</Text>
          <Text style={styles.productName}>{product.name || 'Unknown product'}</Text>
          <Text style={styles.productMeta}>
            {[product.category, product.brand].filter(Boolean).join(' · ') || 'Category unknown'}
          </Text>
          {characteristics.map((c, i) => (
            <Text key={`${c}-${i}`} style={styles.text}>
              • {c}
            </Text>
          ))}
        </View>

        {/* User price */}
        <View style={styles.priceCard}>
          <Text style={styles.cardTitle}>PRICE YOU ENTERED</Text>
          <Text style={styles.priceRange}>
            {analysis.userPrice !== null
              ? formatMoney(analysis.userPrice, analysis.currency)
              : 'Price not provided'}
          </Text>
        </View>

        {/* Result */}
        {comparison && (
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>YOUR RESULT</Text>

            <View
              style={[styles.recommendationBadge, { backgroundColor: decisionBg }]}
            >
              <Text style={[styles.recommendation, { color: decisionColor }]}>
                {comparison.title}
              </Text>
            </View>

            <Text style={styles.text}>{comparison.summary}</Text>

            {comparison.reasoning.length > 0 && (
              <>
                <Text style={[styles.cardTitle, { marginTop: 14 }]}>WHY?</Text>
                {comparison.reasoning.map((line, i) => (
                  <Text key={i} style={styles.text}>
                    ✓ {line}
                  </Text>
                ))}
              </>
            )}
          </View>
        )}

        {/* Description */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>WHAT WE SEE</Text>
          <Text style={styles.text}>
            {analysis.description || 'No description available.'}
          </Text>
        </View>

        {/* Find where to buy */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>FIND WHERE TO BUY</Text>

          {comparison?.search.status === 'unavailable' && (
            <Text style={styles.errorText}>
              We couldn&apos;t search external products right now. The analysis
              above is based only on the product information and your price.
            </Text>
          )}

          {comparison?.search.status === 'ok' &&
            comparison.alternatives.length === 0 && (
              <Text style={styles.text}>
                No comparable products were found. The product was analyzed
                successfully, but we couldn&apos;t find reliable alternatives.
              </Text>
            )}

          {comparison?.exactMatch && (
            <>
              <Text style={styles.scoreLabel}>EXACT / POSSIBLE MATCH</Text>
              <AlternativeCard item={comparison.exactMatch} />
            </>
          )}

          {otherAlternatives.length > 0 && (
            <>
              <Text style={styles.scoreLabel}>SIMILAR PRODUCTS</Text>
              {otherAlternatives.map((item, index) => (
                <AlternativeCard key={`${item.url}-${index}`} item={item} />
              ))}
            </>
          )}

          {comparison && comparison.alternatives.length > 0 && (
            <Text style={styles.text}>
              Listed prices come from search results, not from us, and may not
              be current. You will open the original website.
            </Text>
          )}
        </View>

        {/* Actions */}
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
    backgroundColor: Colors.lightBackground,
  },

  centerState: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    color: Colors.lightTextPrimary,
    fontSize: 17,
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
  },

  loadingSubtext: {
    color: Colors.lightTextSecondary,
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

  matchLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },

  matchLoadingText: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginLeft: 10,
  },

  matchRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginTop: 12,
  },

  matchStore: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },

  matchTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },

  matchLink: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 8,
  },
});
