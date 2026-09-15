import React from 'react';

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import {
  findForMyHome,
  FindForMyHomeResult,
  RecommendedProduct,
} from '@/services/findForMyHome';

const CATEGORIES = ['Furniture', 'Lighting', 'Storage', 'Decor', 'Electronics'];

type ScreenState = 'form' | 'loading' | 'results' | 'error';

export default function FindForMyHome() {
  const [category, setCategory] = React.useState<string | null>(null);
  const [budget, setBudget] = React.useState('');
  const [city, setCity] = React.useState('');

  const [state, setState] = React.useState<ScreenState>('form');
  const [result, setResult] = React.useState<FindForMyHomeResult | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const search = async () => {
    setState('loading');
    setErrorMessage(null);

    try {
      const parsedBudget = budget.trim() ? Number(budget) : undefined;
      const data = await findForMyHome({
        category: category ?? undefined,
        budget: parsedBudget !== undefined && !Number.isNaN(parsedBudget) ? parsedBudget : undefined,
        city: city.trim() || undefined,
      });
      setResult(data);
      setState('results');
    } catch (error: any) {
      setErrorMessage(error?.message ?? "We couldn't get recommendations. Please try again.");
      setState('error');
    }
  };

  const searchAgain = () => {
    setResult(null);
    setState('form');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <ScreenHeader eyebrow="MY HOME" title="Find for my home" />

        {(state === 'form' || state === 'loading') && (
          <>
            <View style={styles.intro}>
              <Text style={styles.title}>What do you need?</Text>
              <Text style={styles.subtitle}>
                We&apos;ll look at your rooms and detected items first, so we only suggest things that would
                actually complement your space.
              </Text>
            </View>

            <Text style={styles.label}>CATEGORY (OPTIONAL)</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.chip, category === item && styles.chipActive]}
                  onPress={() => setCategory(category === item ? null : item)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>MAXIMUM BUDGET (OPTIONAL)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 100"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              value={budget}
              onChangeText={setBudget}
            />

            <Text style={styles.label}>CITY (OPTIONAL)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Pristina — leave blank to auto-detect"
              placeholderTextColor={Colors.textMuted}
              value={city}
              onChangeText={setCity}
            />
            <Text style={styles.hint}>
              We try to approximate your location to prioritize nearby stores. It&apos;s never exact — set your city
              here if you&apos;d rather choose it yourself.
            </Text>

            <TouchableOpacity
              style={[styles.button, state === 'loading' && styles.buttonDisabled]}
              onPress={search}
              activeOpacity={0.85}
              disabled={state === 'loading'}
            >
              {state === 'loading' ? (
                <ActivityIndicator color={Colors.cardHighlight} />
              ) : (
                <Text style={styles.buttonText}>FIND PRODUCTS</Text>
              )}
            </TouchableOpacity>

            {state === 'loading' && (
              <Text style={styles.loadingHint}>Understanding your home and looking for real matches...</Text>
            )}
          </>
        )}

        {state === 'error' && (
          <>
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Something went wrong</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>

            <TouchableOpacity style={styles.button} onPress={search} activeOpacity={0.85}>
              <Text style={styles.buttonText}>TRY AGAIN</Text>
            </TouchableOpacity>
          </>
        )}

        {state === 'results' && result && (
          <ResultsView result={result} onSearchAgain={searchAgain} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultsView({
  result,
  onSearchAgain,
}: {
  result: FindForMyHomeResult;
  onSearchAgain: () => void;
}) {
  return (
    <>
      <View style={styles.intro}>
        <Text style={styles.title}>Based on your home</Text>
        <Text style={styles.subtitle}>{result.summary}</Text>
      </View>

      {result.isMock && (
        <View style={styles.mockBadge}>
          <Text style={styles.mockBadgeText}>
            MOCK DATA — no real product source is connected yet, this is an architecture preview
          </Text>
        </View>
      )}

      {result.location.city && (
        <Text style={styles.locationText}>
          Prioritizing results near {result.location.city}
          {result.location.source === 'manual' ? '' : ' (approximate)'}
        </Text>
      )}

      <Text style={styles.label}>RECOMMENDED FOR YOU</Text>

      {result.recommendations.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nothing to recommend right now</Text>
          <Text style={styles.emptyText}>
            Based on what you already have, we don&apos;t see a product that would clearly improve this space.
          </Text>
        </View>
      ) : (
        <View style={styles.productList}>
          {result.recommendations.map((product) => (
            <ProductRecommendationCard key={product.id} product={product} />
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.secondaryButton} onPress={onSearchAgain} activeOpacity={0.85}>
        <Text style={styles.secondaryButtonText}>SEARCH AGAIN</Text>
      </TouchableOpacity>
    </>
  );
}

function ProductRecommendationCard({ product }: { product: RecommendedProduct }) {
  return (
    <View style={styles.productCard}>
      <View style={styles.productImagePlaceholder}>
        <Text style={styles.productImagePlaceholderText}>{product.category.charAt(0).toUpperCase()}</Text>
      </View>

      <View style={styles.productInfo}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.productStore}>{product.store}</Text>

        <View style={styles.productBottomRow}>
          <Text style={styles.productPrice}>
            {product.price != null ? `${product.price.toFixed(2)} ${product.currency}` : 'Price unavailable'}
          </Text>
        </View>

        <Text style={styles.productReason}>{product.reason}</Text>
      </View>
    </View>
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
  intro: {
    marginTop: 30,
    marginBottom: 24,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  label: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 12,
    marginTop: 20,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 15,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  chipTextActive: {
    color: Colors.accentText,
    fontWeight: '700',
  },
  input: {
    height: 54,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    color: Colors.textPrimary,
    fontSize: 14,
  },
  hint: {
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  button: {
    height: 56,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 26,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: Colors.cardHighlight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  loadingHint: {
    color: Colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
  },
  errorCard: {
    marginTop: 18,
    backgroundColor: Colors.dangerDim,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.danger,
    padding: 20,
  },
  errorTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  mockBadge: {
    backgroundColor: Colors.warningDim,
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  mockBadgeText: {
    color: Colors.warningText,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  locationText: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  productList: {
    gap: 12,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 12,
  },
  productImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImagePlaceholderText: {
    color: Colors.accentText,
    fontSize: 20,
    fontWeight: '700',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  productStore: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  productBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  productPrice: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  productReason: {
    color: Colors.accentText,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  secondaryButton: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  secondaryButtonText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
