import React from 'react';

import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '@/components/ScreenHeader';
import { Colors } from '@/constants/colors';
import { updateProductCheckName } from '@/services/productChecks';
import { saveProduct } from '@/services/savedProducts';

export default function ProductCaptured() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    imageUri?: string | string[];
    productName?: string | string[];
    productCheckId?: string | string[];
  }>();

  const imageUri = Array.isArray(params.imageUri)
    ? params.imageUri[0]
    : params.imageUri;

  const initialName = Array.isArray(params.productName)
    ? params.productName[0]
    : (params.productName ?? '');

  const productCheckId = Array.isArray(params.productCheckId)
    ? params.productCheckId[0]
    : params.productCheckId;

  const [productName, setProductName] = React.useState(initialName);

  const [priceInput, setPriceInput] = React.useState('');

  const [isSaving, setIsSaving] = React.useState(false);

  const [isUpdating, setIsUpdating] = React.useState(false);

  const isHistoryItem = Boolean(productCheckId);

  const handleSaveProduct = async () => {
    if (!imageUri) {
      Alert.alert(
        'No product photo',
        'We could not find the product photo.'
      );
      return;
    }

    if (!productName.trim()) {
      Alert.alert(
        'Product name needed',
        'Please enter a name for this product before saving.'
      );
      return;
    }

    setIsSaving(true);

    try {
      await saveProduct({
        name: productName.trim(),
        imageUri,
      });

      Alert.alert(
        'Product saved ✓',
        `"${productName.trim()}" has been added to your saved products.`,
        [
          {
            text: 'GO TO SAVED',
            onPress: () => router.replace('/saved'),
          },
          {
            text: 'CONTINUE',
            style: 'cancel',
          },
        ]
      );
    } catch (error) {
      console.error(
        '[product-captured] Save failed:',
        error
      );

      Alert.alert(
        'Could not save',
        'We could not save this product. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateName = async () => {
    if (!productCheckId) {
      return;
    }

    if (!productName.trim()) {
      Alert.alert(
        'Product name needed',
        'Please enter a name for this product.'
      );
      return;
    }

    setIsUpdating(true);

    try {
      await updateProductCheckName(
        productCheckId,
        productName.trim()
      );

      Alert.alert(
        'Name updated ✓',
        `The product is now called "${productName.trim()}".`,
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error(
        '[product-captured] Update name failed:',
        error
      );

      Alert.alert(
        'Could not update',
        'We could not update the product name. Please try again.'
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const analyzeProduct = () => {
    if (!imageUri) {
      return;
    }

    // Price is optional. Accept "129", "129.99" or "129,99" (EUR).
    const normalizedPrice = priceInput.trim().replace(',', '.');
    if (normalizedPrice) {
      const valid =
        /^\d{1,7}(\.\d{1,2})?$/.test(normalizedPrice) &&
        Number(normalizedPrice) > 0;
      if (!valid) {
        Alert.alert(
          'Check the price',
          'Enter a valid price such as 129 or 129.99, or leave it empty.'
        );
        return;
      }
    }

    router.push({
      pathname: '/product-analysis',
      params: {
        imageUri,
        // Only forward a name if the user actually typed one — an empty
        // field must NOT be sent as a fake "Unknown product" override,
        // since the backend treats any non-empty productName as the
        // user's deliberate choice and will use it instead of what the
        // AI actually detects.
        ...(productName.trim() ? { productName: productName.trim() } : {}),
        // Optional: the price the user saw in the shop (EUR).
        ...(normalizedPrice ? { userPrice: normalizedPrice } : {}),
      },
    });
  };

  const visualizeProduct = () => {
    if (!imageUri) {
      return;
    }

    router.push({
      pathname: '/select-room',
      params: {
        productImageUri: imageUri,
        productName: productName.trim() || 'Unknown product',
        ...(productCheckId
          ? { productCheckId }
          : {}),
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader
            eyebrow="PRODUCT CHECK"
            title="Product captured"
          />

          <View style={styles.intro}>
            <Text style={styles.title}>
              We&apos;ve got it.
            </Text>

            <Text style={styles.subtitle}>
              {isHistoryItem
                ? 'Update the product name or continue working with this checked product.'
                : 'Give this product a name, then choose what you want to do with it.'}
            </Text>
          </View>

          {/* Product Image — the hero */}

          <View style={styles.imageOuter}>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.productImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.noImage}>
                <Text style={styles.noImageText}>
                  Product photo unavailable
                </Text>
              </View>
            )}
          </View>

          {/* Name — the title of this item */}

          <Text style={styles.inputLabel}>
            PRODUCT NAME
          </Text>

          <TextInput
            value={productName}
            onChangeText={setProductName}
            placeholder="e.g. Modern Lounge Chair"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            autoCapitalize="words"
            returnKeyType="done"
          />

          {/* Save / Update — small + secondary when updating an existing item */}

          <TouchableOpacity
            style={[
              isHistoryItem ? styles.updateNameButton : styles.saveButton,
              (isSaving || isUpdating) &&
                styles.saveButtonDisabled,
            ]}
            onPress={
              isHistoryItem
                ? handleUpdateName
                : handleSaveProduct
            }
            disabled={isSaving || isUpdating}
            activeOpacity={0.85}
          >
            <Text
              style={
                isHistoryItem
                  ? styles.updateNameButtonText
                  : styles.saveButtonText
              }
            >
              {isHistoryItem
                ? (isUpdating
                    ? 'UPDATING...'
                    : 'UPDATE NAME')
                : (isSaving
                    ? 'SAVING...'
                    : 'SAVE PRODUCT')}
            </Text>
          </TouchableOpacity>

          {/* Actions */}

          <Text style={styles.inputLabel}>
            PRICE YOU SAW (OPTIONAL)
          </Text>

          <TextInput
            value={priceInput}
            onChangeText={setPriceInput}
            placeholder="€ 129.99"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            keyboardType="decimal-pad"
            returnKeyType="done"
            maxLength={10}
          />

          <Text style={styles.sectionTitle}>
            WHAT DO YOU WANT TO DO?
          </Text>

          <TouchableOpacity
            style={styles.generateCard}
            onPress={visualizeProduct}
            activeOpacity={0.88}
          >
            <View style={styles.generateIconCircle}>
              <Text style={styles.generateIcon}>
                ⌂
              </Text>
            </View>

            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>
                Generate into my room
              </Text>

              <Text style={styles.actionDescription}>
                See how this product could look in your
                actual space.
              </Text>
            </View>

            <Text style={styles.arrow}>
              →
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.analyzeCard}
            onPress={analyzeProduct}
            activeOpacity={0.88}
          >
            <View style={styles.analyzeIconCircle}>
              <Text style={styles.analyzeIcon}>
                ◎
              </Text>
            </View>

            <View style={styles.actionText}>
              <Text style={[styles.actionTitle, { color: Colors.textPrimary }]}>
                Analyze this product
              </Text>

              <Text style={[styles.actionDescription, { color: Colors.textSecondary }]}>
                Check the price, specifications, and
                whether it is worth buying.
              </Text>
            </View>

            <Text style={[styles.arrow, { color: Colors.savedAccentText }]}>
              →
            </Text>
          </TouchableOpacity>

          {/* Info card */}

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>
              NEXT STEP
            </Text>

            <Text style={styles.infoText}>
              Analyzing this product will run real AI
              recognition and add it to your check
              History automatically.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightBackground,
  },

  flex: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  intro: {
    marginTop: 30,
    marginBottom: 20,
  },

  title: {
    color: Colors.lightTextPrimary,
    fontSize: 20,
    fontWeight: '600',
  },

  subtitle: {
    color: Colors.lightTextSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },

  imageOuter: {
    borderRadius: 28,
    padding: 3,
    backgroundColor: 'rgba(172, 163, 242, 0.28)',
    shadowColor: Colors.savedAccent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 6,
  },

  productImage: {
    width: '100%',
    height: 300,
    borderRadius: 25,
    backgroundColor: Colors.savedSurface,
  },

  noImage: {
    width: '100%',
    height: 300,
    borderRadius: 25,
    backgroundColor: Colors.savedSurface,
    borderWidth: 1,
    borderColor: Colors.savedBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  noImageText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },

  inputLabel: {
    color: Colors.lightTextSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 24,
    marginBottom: 10,
  },

  input: {
    height: 58,
    backgroundColor: 'rgba(40, 55, 90, 0.5)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.savedBorder,
    paddingHorizontal: 16,
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },

  saveButton: {
    height: 56,
    backgroundColor: Colors.savedAccent,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    shadowColor: Colors.savedAccent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveButtonText: {
    color: Colors.textInverse,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  updateNameButton: {
    alignSelf: 'center',
    height: 30,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(172, 163, 242, 0.12)',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(172, 163, 242, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  updateNameButtonText: {
    color: Colors.savedAccentText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  sectionTitle: {
    color: Colors.lightTextSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 28,
    marginBottom: 12,
  },

  generateCard: {
    minHeight: 84,
    backgroundColor: 'rgba(172, 163, 242, 0.10)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(172, 163, 242, 0.45)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 14,
    shadowColor: Colors.savedAccent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 4,
  },

  generateIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: Colors.savedAccent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  generateIcon: {
    color: Colors.textInverse,
    fontSize: 21,
    fontWeight: '700',
  },

  analyzeCard: {
    minHeight: 84,
    backgroundColor: Colors.savedSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.savedBorder,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 14,
  },

  analyzeIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: Colors.savedAccentDim,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  analyzeIcon: {
    color: Colors.savedAccentText,
    fontSize: 19,
  },

  actionText: {
    flex: 1,
  },

  actionTitle: {
    color: Colors.lightTextPrimary,
    fontSize: 15,
    fontWeight: '700',
  },

  actionDescription: {
    color: Colors.lightTextSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  arrow: {
    color: Colors.lightSavedAccentText,
    fontSize: 20,
    fontWeight: '700',
  },

  infoCard: {
    marginTop: 20,
    padding: 16,
    backgroundColor: Colors.savedAccentDim,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.savedBorder,
  },

  infoTitle: {
    color: Colors.savedAccentText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  infoText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
});
