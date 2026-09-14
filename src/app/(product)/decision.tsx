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

const RECOMMENDATION_LABEL: Record<string, string> = {
  buy: 'BUY',
  consider: 'CONSIDER',
  skip: 'SKIP',
  unknown: 'UNCLEAR',
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
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
              CHECK
            </Text>

            <Text style={styles.headerTitle}>
              Buying decision
            </Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* Verdict */}
        <View style={styles.verdictSection}>
          <Text style={styles.verdictEyebrow}>
            OUR RECOMMENDATION
          </Text>

          <Text style={styles.verdict}>
            {RECOMMENDATION_LABEL[rec] ?? rec.toUpperCase()}
          </Text>

          <Text style={styles.verdictSubtitle}>
            {RECOMMENDATION_SUBTITLE[rec] ?? RECOMMENDATION_SUBTITLE.unknown}
          </Text>
        </View>

        {/* Score */}
        <View style={styles.scoreCard}>
          <View>
            <Text style={styles.scoreLabel}>
              CONFIDENCE
            </Text>

            <Text style={styles.score}>
              {confidencePercent !== null ? confidencePercent : '—'}
              <Text style={styles.scoreOutOf}>
                {confidencePercent !== null ? '%' : ''}
              </Text>
            </Text>
          </View>

          <View style={styles.scoreStatus}>
            <Text style={styles.scoreStatusTitle}>
              {productName || 'This product'}
            </Text>

            <Text style={styles.scoreStatusText}>
              {PRICE_ASSESSMENT_NOTE[priceAssessment || 'unknown'] ?? PRICE_ASSESSMENT_NOTE.unknown}
            </Text>
          </View>
        </View>

        {/* Reasons */}
        <Text style={styles.sectionTitle}>
          WHY
        </Text>

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
        <Text style={styles.sectionTitle}>
          BEFORE YOU BUY
        </Text>

        <View style={styles.tipCard}>
          <Text style={styles.tipNumber}>
            01
          </Text>

          <Text style={styles.tipText}>
            Check the dimensions against your available
            space.
          </Text>

          <Text style={styles.tipNumber}>
            02
          </Text>

          <Text style={styles.tipText}>
            Compare the material and build quality with
            similar products.
          </Text>

          <Text style={styles.tipNumber}>
            03
          </Text>

          <Text style={styles.tipText}>
            Check whether a cheaper alternative offers the
            same value.
          </Text>
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
            How this recommendation is made
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
    backgroundColor: '#111111',
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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

  eyebrow: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center',
  },

  headerSpacer: {
    width: 44,
  },

  verdictSection: {
    marginTop: 48,
    marginBottom: 30,
  },

  verdictEyebrow: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  verdict: {
    color: '#FFFFFF',
    fontSize: 58,
    fontWeight: '700',
    marginTop: 5,
  },

  verdictSubtitle: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },

  scoreCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  scoreLabel: {
    color: '#777777',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  score: {
    color: '#111111',
    fontSize: 40,
    fontWeight: '700',
    marginTop: 4,
  },

  scoreOutOf: {
    color: '#777777',
    fontSize: 18,
  },

  scoreStatus: {
    alignItems: 'flex-end',
    maxWidth: 130,
  },

  scoreStatusTitle: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '700',
  },

  scoreStatusText: {
    color: '#777777',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'right',
    marginTop: 5,
  },

  sectionTitle: {
    color: '#777777',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 30,
    marginBottom: 12,
  },

  reasonCard: {
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    paddingHorizontal: 18,
  },

  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
  },

  reasonIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  reasonIconText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },

  reasonText: {
    flex: 1,
    marginLeft: 13,
  },

  reasonTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  reasonDescription: {
    color: '#777777',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  divider: {
    height: 1,
    backgroundColor: '#2D2D2D',
  },

  tipCard: {
    backgroundColor: '#181818',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D2D',
    padding: 18,
  },

  tipNumber: {
    color: '#777777',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 4,
  },

  tipText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    marginBottom: 15,
  },

  primaryButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },

  primaryButtonText: {
    color: '#111111',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  secondaryButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  infoCard: {
    marginTop: 24,
    padding: 18,
    backgroundColor: '#181818',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },

  infoTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  infoText: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },
});