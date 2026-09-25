import React from 'react';

import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ProductSelector from '@/components/ProductSelector';
import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import {
  clearPendingSelection,
  createSelectionImage,
  getPendingSelection,
  type NormalizedPoint,
  type SelectionReason,
} from '@/services/productSelection';

function explain(reason: SelectionReason, products: string[]): string {
  switch (reason) {
    case 'multiple':
      return `We found ${products.length} possible products${
        products.length ? ` (${products.slice(0, 4).join(', ')})` : ''
      }. Draw around the one you want to use.`;
    case 'uncertain':
      return "We're not sure which product you mean. Draw around the one you want to use.";
    case 'none':
      return "We couldn't find a clear product. Draw around the one you want to use.";
    default:
      return "We couldn't check this photo automatically. Draw around the product you want to use.";
  }
}

/**
 * Shown only when the photo doesn't clearly show one product. The selection
 * becomes the product image for the existing pipeline; going back cancels
 * without processing anything.
 */
export default function SelectProduct() {
  const router = useRouter();
  const [selection] = React.useState(getPendingSelection);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => clearPendingSelection, []);

  if (!selection) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="MY ROOM" title="Select product" />
          <Text style={styles.subtitle}>This selection is no longer available. Please add the product again.</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.backButtonText}>GO BACK</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleConfirm = async (polygon: NormalizedPoint[]) => {
    if (busy) return;
    setBusy(true);
    try {
      const selectedImageUri = await createSelectionImage(selection.source, polygon);
      // The caller continues the existing flow with this image (and navigates).
      selection.onConfirm(selectedImageUri);
    } catch (error: any) {
      setBusy(false);
      Alert.alert("Couldn't use that selection", error?.message ?? 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <ScreenHeader eyebrow="MY ROOM" title="Select product" onBack={busy ? () => {} : undefined} />
        <Text style={styles.eyebrow}>SELECT YOUR PRODUCT</Text>
        <Text style={styles.subtitle}>{explain(selection.reason, selection.products)}</Text>
        <View style={styles.selector}>
          <ProductSelector imageUri={selection.source.imageUri} busy={busy} onConfirm={handleConfirm} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundElevated,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  eyebrow: {
    color: Colors.accentText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 24,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  selector: {
    flex: 1,
    marginTop: 16,
  },
  backButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.cardHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  backButtonText: {
    color: Colors.cardHighlightText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
