import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';

const RECOMMENDATION_LABEL: Record<string, string> = {
  buy: 'Good Buy',
  consider: 'Worth Considering',
  skip: 'Consider Skipping',
  unknown: 'Unclear',
};

const RECOMMENDATION_SUBTITLE: Record<string, string> = {
  buy: 'This looks like a solid purchase based on the analysis.',
  consider: 'It could work, but weigh the notes below first.',
  skip: 'The analysis suggests holding off on this one.',
  unknown: 'There was not enough information for a confident verdict.',
};

const PRICE_ASSESSMENT_NOTE: Record<string, string> = {
  fair: 'The price looks in line with typical market value.',
  good_deal: 'The price looks better than typical market value.',
  overpriced: 'The price looks higher than typical market value.',
  unknown: 'We could not confidently assess whether the price is fair.',
};

export default function Decision() {
  const router = useRouter();

  const { imageUri, productName, recommendation, confidence, priceAssessment, description } =
    useLocalSearchParams<{
      imageUri: string;
      productName?: string;
      recommendation?: string;
      confidence?: string;
      priceAssessment?: string;
      description?: string;
    }>();

  const rec = recommendation || 'unknown';
  const confidenceValue = confidence ? Number(confidence) : null;
  const confidencePercent =
    confidenceValue !== null && !Number.isNaN(confidenceValue)
      ? Math.round(confidenceValue * 100)
      : null;

  const recommendationColor =
    rec === 'buy'
      ? Colors.success
      : rec === 'consider'
        ? Colors.warning
        : rec === 'skip'
          ? Colors.danger
          : Colors.textSecondary;

  const recommendationBg =
    rec === 'buy'
      ? Colors.successDim
      : rec === 'consider'
        ? Colors.warningDim
        : rec === 'skip'
          ? Colors.dangerDim
          : Colors.surface2;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow="CHECK" title="Buying decision" />

        {/* Verdict */}
        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>OUR RECOMMENDATION</Text>

          <View style={[styles.recommendationBadge, { backgroundColor: recommendationBg }]}>
            <Text style={[styles.recommendation, { color: recommendationColor }]}>
              {RECOMMENDATION_LABEL[rec] ?? rec}
            </Text>
          </View>

          <Text style={styles.verdictSubtitle}>
            {RECOMMENDATION_SUBTITLE[rec] ?? RECOMMENDATION_SUBTITLE.unknown}
          </Text>

          <View style={styles.confidenceRow}>
            <Text style={styles.confidenceLabel}>CONFIDENCE</Text>
            <Text style={styles.confidenceValue}>
              {confidencePercent !== null ? `${confidencePercent}%` : '—'}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>PRODUCT</Text>
          <Text style={styles.productName}>{productName || 'This product'}</Text>
        </View>

        {/* Reasons */}
        <Text style={styles.sectionTitle}>WHY</Text>

        <View style={styles.reasonCard}>
          <View style={styles.reasonRow}>
            <View style={styles.reasonIcon}>
              <Text style={styles.reasonIconText}>
                {rec === 'buy' ? '+' : rec === 'skip' ? '−' : '!'}
              </Text>
            </View>

            <View style={styles.reasonText}>
              <Text style={styles.reasonTitle}>
                Price assessment
              </Text>

              <Text style={styles.reasonDescription}>
                {PRICE_ASSESSMENT_NOTE[priceAssessment || 'unknown'] ?? PRICE_ASSESSMENT_NOTE.unknown}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.reasonRow}>
            <View style={styles.reasonIcon}>
              <Text style={styles.reasonIconText}>
                i
              </Text>
            </View>

            <View style={styles.reasonText}>
              <Text style={styles.reasonTitle}>
                What the AI saw
              </Text>

              <Text style={styles.reasonDescription}>
                {description || 'No additional details were captured for this product.'}
              </Text>
            </View>
          </View>
        </View>

        {/* What to do */}
        <Text style={styles.sectionTitle}>BEFORE YOU BUY</Text>

        <View style={styles.tipCard}>
          {[
            'Check the dimensions against your available space.',
            'Compare the material and build quality with similar products.',
            'Check whether a cheaper alternative offers the same value.',
          ].map((tip, index) => (
            <View key={tip} style={styles.tipRow}>
              <Text style={styles.tipNumber}>{String(index + 1).padStart(2, '0')}</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() =>
            router.push({
              pathname: '/alternatives',
              params: {
                imageUri: imageUri,
              },
            })
          }
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            FIND BETTER ALTERNATIVES →
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryButtonText}>
            BACK TO ANALYSIS
          </Text>
        </TouchableOpacity>

        {/* Note */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>
            HOW THIS IS DECIDED
          </Text>

          <Text style={styles.infoText}>
            This is based on the AI&apos;s product analysis (what it saw in the
            photo and, if you gave one, how the price compares). It does not
            yet factor in your home or your saved items — that&apos;s a planned
            improvement, see the README roadmap.
          </Text>
        </View>
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
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  verdictSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 280,
  },

  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },

  confidenceLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  confidenceValue: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
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

  productName: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },

  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 26,
    marginBottom: 12,
  },

  reasonCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
  },

  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 14,
  },

  reasonIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  reasonIconText: {
    color: Colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },

  reasonText: {
    flex: 1,
  },

  reasonTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },

  reasonDescription: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },

  tipCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 16,
  },

  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },

  tipNumber: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 1,
  },

  tipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },

  primaryButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 26,
  },

  primaryButtonText: {
    color: Colors.cardHighlight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  secondaryButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.surface,
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

  infoCard: {
    marginTop: 22,
    padding: 18,
    backgroundColor: Colors.accentDim,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  infoTitle: {
    color: Colors.accentText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  infoText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
});
